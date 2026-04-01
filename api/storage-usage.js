const { getDb, json } = require("./_mongo");

const ALERT_THRESHOLD_BYTES = 500 * 1024 * 1024;

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return json(response, 405, { ok: false, message: "Method not allowed" });
  }

  try {
    const db = await getDb();
    const stats = await db.stats();
    const storageSize = Number(stats?.storageSize || 0);
    const indexSize = Number(stats?.indexSize || 0);
    const dataSize = Number(stats?.dataSize || 0);
    const usedBytes = Math.max(storageSize + indexSize, dataSize);

    response.setHeader("Cache-Control", "no-store");
    return json(response, 200, {
      ok: true,
      usedBytes,
      usedMb: Number((usedBytes / (1024 * 1024)).toFixed(2)),
      thresholdBytes: ALERT_THRESHOLD_BYTES,
      thresholdMb: 500,
      overThreshold: usedBytes >= ALERT_THRESHOLD_BYTES,
    });
  } catch (error) {
    return json(response, 500, {
      ok: false,
      message: "Failed to read MongoDB storage usage",
      detail: String(error?.message || error),
    });
  }
};
