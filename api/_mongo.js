const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");

function getMongoUri() {
  const value = String(process.env.MONGODB_URI || "").trim();
  if (!value) {
    throw new Error("MONGODB_URI environment variable is required.");
  }
  return value;
}

function getMongoDbName() {
  return String(process.env.MONGODB_DB_NAME || "ty_portfolio").trim() || "ty_portfolio";
}

function getClientPromise() {
  const uri = getMongoUri();

  if (!global.__tyMongoClientPromise || global.__tyMongoClientUri !== uri) {
    const client = new MongoClient(uri, {
      serverApi: ServerApiVersion.v1,
    });
    global.__tyMongoClientUri = uri;
    global.__tyMongoClientPromise = client.connect().catch((error) => {
      global.__tyMongoClientPromise = null;
      throw error;
    });
  }

  return global.__tyMongoClientPromise;
}

async function getDb() {
  const client = await getClientPromise();
  return client.db(getMongoDbName());
}

function json(response, statusCode, payload) {
  response.status(statusCode).setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function parseObjectIdFromRemoteKey(key) {
  const raw = String(key || "").replace(/^mongo:/, "");
  if (!ObjectId.isValid(raw)) return null;
  return new ObjectId(raw);
}

module.exports = {
  getDb,
  json,
  parseObjectIdFromRemoteKey,
};
