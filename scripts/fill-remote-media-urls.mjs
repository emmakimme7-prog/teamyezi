import https from "node:https";

const HOST = "www.teamyezi.kr";
const IP = "136.110.186.175";

function requestJson(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: IP,
        servername: HOST,
        path,
        method,
        headers: {
          Host: HOST,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`${method} ${path} failed: ${res.statusCode} ${raw}`));
            return;
          }

          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function toMediaUrl(key) {
  const value = String(key || "").trim();
  if (!value) return "";
  return `https://${HOST}/api/media-file?key=${encodeURIComponent(value)}`;
}

const current = await requestJson("GET", "/api/site-state");
const payload = current?.payload;

if (!payload || typeof payload !== "object") {
  throw new Error("Remote payload is missing");
}

payload.products = Array.isArray(payload.products)
  ? payload.products.map((product) => ({
      ...product,
      thumbnailUrl: product.thumbnailUrl || toMediaUrl(product.thumbnailKey),
      coverUrl: product.coverUrl || toMediaUrl(product.coverKey || product.thumbnailKey),
    }))
  : [];

const result = await requestJson("POST", "/api/site-state", { payload });
console.log(JSON.stringify({ ok: true, result }, null, 2));
