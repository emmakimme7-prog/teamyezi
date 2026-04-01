const { getDb, json, parseObjectIdFromRemoteKey } = require("./_mongo");
const { saveBuffer, readBuffer, getFileMeta } = require("./_storage");

const COLLECTION_NAME = "media_assets";
const CHUNK_COLLECTION_NAME = "media_upload_chunks";
const UPLOAD_COLLECTION_NAME = "media_uploads";

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";

  return {
    mimeType,
    buffer: isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8"),
  };
}

module.exports = async function handler(request, response) {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);
  const chunkCollection = db.collection(CHUNK_COLLECTION_NAME);
  const uploadCollection = db.collection(UPLOAD_COLLECTION_NAME);

  if (request.method === "GET") {
    const key = String(request.query?.key || "");
    if (!key) {
      return json(response, 400, { ok: false, message: "Invalid key" });
    }

    const meta = await getFileMeta(key);
    if (meta) {
      return json(response, 200, {
        ok: true,
        url: `/api/media-file?key=${encodeURIComponent(key)}`,
        type: meta.contentType || "",
        name: meta.name || "",
      });
    }

    const objectId = parseObjectIdFromRemoteKey(request.query?.key);
    if (!objectId) {
      return json(response, 400, { ok: false, message: "Invalid key" });
    }

    const asset = await collection.findOne({ _id: objectId });
    if (!asset?.dataUrl) {
      return json(response, 404, { ok: false, message: "Asset not found" });
    }

    return json(response, 200, {
      ok: true,
      url: asset.dataUrl,
      type: asset.type || "",
      name: asset.name || "",
    });
  }

  if (request.method === "POST") {
    const contentType = String(request.headers["content-type"] || "").toLowerCase();
    if (contentType.startsWith("application/octet-stream")) {
      const name = String(request.headers["x-file-name"] || request.query?.name || "").trim();
      const type = String(request.headers["x-file-type"] || request.query?.type || "").trim();
      const uploadId = String(request.headers["x-upload-id"] || "").trim();
      const chunkIndexHeader = request.headers["x-chunk-index"];
      const totalChunksHeader = request.headers["x-total-chunks"];
      const buffer = await readRawBody(request);
      if (!buffer || !buffer.length) {
        return json(response, 400, { ok: false, message: "Empty upload body" });
      }

      if (uploadId) {
        const chunkIndex = Number(chunkIndexHeader);
        const totalChunks = Number(totalChunksHeader);
        if (!Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || totalChunks < 1) {
          return json(response, 400, { ok: false, message: "Invalid binary chunk headers" });
        }

        await uploadCollection.updateOne(
          { _id: uploadId },
          {
            $set: {
              name: name || "upload",
              type: type || "application/octet-stream",
              totalChunks,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );

        await chunkCollection.updateOne(
          { uploadId, chunkIndex },
          {
            $set: {
              uploadId,
              chunkIndex,
              buffer,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );

        return json(response, 200, { ok: true });
      }

      const key = await saveBuffer({
        name: name || "upload",
        type: type || "application/octet-stream",
        buffer,
      });

      return json(response, 200, { ok: true, key });
    }

    const action = String(request.body?.action || "single");
    const name = String(request.body?.name || "").trim();
    const type = String(request.body?.type || "").trim();

    if (action === "single") {
      const dataUrl = String(request.body?.dataUrl || "");
      const parsed = parseDataUrl(dataUrl);
      if (!parsed) {
        return json(response, 400, { ok: false, message: "Valid dataUrl is required" });
      }

      const key = await saveBuffer({
        name,
        type: type || parsed.mimeType,
        buffer: parsed.buffer,
      });

      return json(response, 200, {
        ok: true,
        key,
      });
    }

    if (action === "chunk") {
      const uploadId = String(request.body?.uploadId || "").trim();
      const chunkIndex = Number(request.body?.chunkIndex);
      const totalChunks = Number(request.body?.totalChunks);
      const base64 = String(request.body?.base64 || "");

      if (!uploadId || !Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) || !base64) {
        return json(response, 400, { ok: false, message: "Invalid chunk payload" });
      }

      await uploadCollection.updateOne(
        { _id: uploadId },
        {
          $set: {
            name,
            type,
            totalChunks,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      await chunkCollection.updateOne(
        { uploadId, chunkIndex },
        {
          $set: {
            uploadId,
            chunkIndex,
            base64,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      return json(response, 200, { ok: true });
    }

    if (action === "complete") {
      const uploadId = String(request.body?.uploadId || "").trim();
      const totalChunks = Number(request.body?.totalChunks);

      if (!uploadId || !Number.isInteger(totalChunks) || totalChunks < 1) {
        return json(response, 400, { ok: false, message: "Invalid upload completion payload" });
      }

      const chunks = await chunkCollection.find({ uploadId }).sort({ chunkIndex: 1 }).toArray();
      if (chunks.length !== totalChunks) {
        return json(response, 400, { ok: false, message: "Missing upload chunks" });
      }

      const buffer = Buffer.concat(
        chunks.map((chunk) => {
          if (chunk && chunk.buffer && Buffer.isBuffer(chunk.buffer)) {
            return chunk.buffer;
          }
          return Buffer.from(chunk.base64 || "", "base64");
        })
      );
      const key = await saveBuffer({
        name,
        type,
        buffer,
      });

      await chunkCollection.deleteMany({ uploadId });
      await uploadCollection.deleteOne({ _id: uploadId });

      return json(response, 200, { ok: true, key });
    }

    return json(response, 400, { ok: false, message: "Unsupported action" });
  }

  response.setHeader("Allow", "GET, POST");
  return json(response, 405, { ok: false, message: "Method not allowed" });
};
