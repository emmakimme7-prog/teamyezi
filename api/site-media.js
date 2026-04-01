const { getDb, json } = require("./_mongo");

const COLLECTION_NAME = "site_state";
const RECORD_ID = "default";

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { ok: false, message: "Method not allowed" });
  }

  const section = String(request.body?.section || "").trim();
  const payload = request.body?.payload;
  if (!payload || typeof payload !== "object") {
    return json(response, 400, { ok: false, message: "payload is required" });
  }

  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  if (section === "main") {
    await collection.updateOne(
      { _id: RECORD_ID },
      {
        $set: {
          "payload.main.heroImageName": String(payload.heroImageName || ""),
          "payload.main.heroMediaType": String(payload.heroMediaType || "image"),
          "payload.main.heroMediaKey": String(payload.heroMediaKey || ""),
          "payload.main.heroPosterKey": String(payload.heroPosterKey || ""),
          "payload.main.heroImageUrl": "",
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    return json(response, 200, { ok: true });
  }

  if (section === "about") {
    await collection.updateOne(
      { _id: RECORD_ID },
      {
        $set: {
          "payload.about.imageName": String(payload.imageName || ""),
          "payload.about.mediaType": String(payload.mediaType || "image"),
          "payload.about.mediaKey": String(payload.mediaKey || ""),
          "payload.about.posterKey": String(payload.posterKey || ""),
          "payload.about.imageUrl": "",
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    return json(response, 200, { ok: true });
  }

  return json(response, 400, { ok: false, message: "Unsupported section" });
};
