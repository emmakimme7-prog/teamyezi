const { getFileMeta, openReadStream, parseStorageKey } = require("./_storage");

module.exports = async function handler(request, response) {
  const isHeadRequest = request.method === "HEAD";
  const isAllowedMethod = request.method === "GET" || isHeadRequest;
  if (isAllowedMethod === false) {
    response.setHeader("Allow", "GET, HEAD");
    response.status(405).end("Method not allowed");
    return;
  }

  const rangeHeader = request.headers.range;
  const key = String((request.query && request.query.key) || "");
  const parsedKey = parseStorageKey(key);

  if (parsedKey.provider) {
    const meta = await getFileMeta(key);
    if (meta == null) {
      response.status(404).end("Asset not found");
      return;
    }

    const totalSize = Number(meta.contentLength || 0);
    response.setHeader("Content-Type", meta.contentType || "application/octet-stream");
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Disposition", "inline");

    if (rangeHeader) {
      const match = String(rangeHeader).match(/bytes=([0-9]*)-([0-9]*)/);
      if (match == null) {
        response.status(416).end();
        return;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : totalSize - 1;
      const safeStart = Math.max(0, Math.min(start, Math.max(0, totalSize - 1)));
      const safeEnd = Math.max(safeStart, Math.min(end, Math.max(0, totalSize - 1)));

      response.statusCode = 206;
      response.setHeader("Content-Range", "bytes " + safeStart + "-" + safeEnd + "/" + totalSize);
      response.setHeader("Content-Length", String(safeEnd - safeStart + 1));

      if (isHeadRequest) {
        response.end();
        return;
      }

      await new Promise((resolve, reject) => {
        Promise.resolve(openReadStream(key, { start: safeStart, endInclusive: safeEnd }))
          .then((stream) => {
            stream.on("error", reject);
            response.on("close", () => stream.destroy());
            stream.on("end", resolve);
            stream.pipe(response);
          })
          .catch(reject);
      });
      return;
    }

    response.setHeader("Content-Length", String(totalSize));

    if (isHeadRequest) {
      response.end();
      return;
    }

    await new Promise((resolve, reject) => {
      Promise.resolve(openReadStream(key))
        .then((stream) => {
          stream.on("error", reject);
          response.on("close", () => stream.destroy());
          stream.on("end", resolve);
          stream.pipe(response);
        })
        .catch(reject);
    });
    return;
  }

  response.status(404).end("Asset not found");
};
