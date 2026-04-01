const { GridFSBucket } = require("mongodb");
const { Readable } = require("stream");
const { getDb, parseObjectIdFromRemoteKey } = require("./_mongo");

const GCS_BUCKET = String(process.env.GCS_BUCKET || "").trim();
const GCS_TOKEN_CACHE_KEY = "__tyGcsTokenCache";
const GCS_METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

function parseStorageKey(key) {
  const value = String(key || "");
  if (value.indexOf("gfs:") === 0) return { provider: "mongo", raw: value.slice(4) };
  if (value.indexOf("mongo:") === 0) return { provider: "legacy", raw: value.slice(6) };
  if (value.indexOf("gcs:") === 0) return { provider: "gcs", raw: value.slice(4) };
  return { provider: "", raw: value };
}

function requireGcsBucket() {
  if (!GCS_BUCKET) {
    throw new Error("GCS_BUCKET environment variable is required for gcs media keys.");
  }
  return GCS_BUCKET;
}

async function getGcsAccessToken() {
  const cached = global[GCS_TOKEN_CACHE_KEY];
  const now = Date.now();
  if (cached && cached.token && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const response = await fetch(GCS_METADATA_TOKEN_URL, {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to read GCS access token: ${response.status}`);
  }

  const payload = await response.json();
  const token = String(payload?.access_token || "").trim();
  const expiresIn = Number(payload?.expires_in || 0);

  if (!token) {
    throw new Error("GCS access token is empty.");
  }

  global[GCS_TOKEN_CACHE_KEY] = {
    token,
    expiresAt: now + expiresIn * 1000,
  };

  return token;
}

function buildGcsMetadataUrl(objectName) {
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(requireGcsBucket())}/o/${encodeURIComponent(objectName)}`;
}

function buildGcsMediaUrl(objectName) {
  return `https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(requireGcsBucket())}/o/${encodeURIComponent(objectName)}?alt=media`;
}

async function fetchGcsObjectMetadata(key) {
  const objectName = parseStorageKey(key).raw;
  if (!objectName) return null;

  const token = await getGcsAccessToken();
  const response = await fetch(buildGcsMetadataUrl(objectName), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to read GCS object metadata: ${response.status}`);
  }

  const payload = await response.json();
  return {
    provider: "gcs",
    contentType: payload?.contentType || "application/octet-stream",
    contentLength: Number(payload?.size || 0),
    name: payload?.name || objectName,
    lastModified: payload?.updated || null,
    objectName,
  };
}

async function openGcsReadStream(key, options) {
  const objectName = parseStorageKey(key).raw;
  if (!objectName) {
    throw new Error("Invalid gcs media key");
  }

  const opts = options || {};
  const token = await getGcsAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  if (Number.isFinite(opts.start) || Number.isFinite(opts.endInclusive)) {
    const rangeStart = Number.isFinite(opts.start) ? opts.start : 0;
    const rangeEnd = Number.isFinite(opts.endInclusive) ? opts.endInclusive : "";
    headers.Range = `bytes=${rangeStart}-${rangeEnd}`;
  }

  const response = await fetch(buildGcsMediaUrl(objectName), { headers });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to read GCS object: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("GCS response body is empty");
  }

  return Readable.fromWeb(response.body);
}

async function saveBuffer(args) {
  const name = args && args.name ? args.name : "media-file";
  const type = args && args.type ? args.type : "application/octet-stream";
  const buffer = args.buffer;
  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: "media_files" });
  const uploadStream = bucket.openUploadStream(name, { contentType: type });

  await new Promise((resolve, reject) => {
    uploadStream.end(buffer, function (error) {
      if (error) reject(error);
      else resolve();
    });
  });

  return "gfs:" + String(uploadStream.id);
}

async function getFileMeta(key) {
  const parsed = parseStorageKey(key);

  if (parsed.provider === "gcs") {
    return fetchGcsObjectMetadata(key);
  }

  const db = await getDb();
  const objectId = parseObjectIdFromRemoteKey("mongo:" + parsed.raw);
  if (objectId == null) return null;
  const fileDoc = await db.collection("media_files.files").findOne({ _id: objectId });
  if (fileDoc == null) return null;
  return {
    provider: "mongo",
    contentType: fileDoc.contentType || "application/octet-stream",
    contentLength: Number(fileDoc.length || 0),
    name: fileDoc.filename || "",
    lastModified: fileDoc.uploadDate || null,
    objectId: objectId,
  };
}

async function openReadStream(key, options) {
  const parsed = parseStorageKey(key);
  const opts = options || {};

  if (parsed.provider === "gcs") {
    return openGcsReadStream(key, opts);
  }

  const db = await getDb();
  const objectId = parseObjectIdFromRemoteKey("mongo:" + parsed.raw);
  if (objectId == null) throw new Error("Invalid mongo media key");
  const bucket = new GridFSBucket(db, { bucketName: "media_files" });
  const streamOptions = {};
  if (Number.isFinite(opts.start)) streamOptions.start = opts.start;
  if (Number.isFinite(opts.endInclusive)) streamOptions.end = opts.endInclusive + 1;
  if (Number.isFinite(opts.endExclusive)) streamOptions.end = opts.endExclusive;
  return bucket.openDownloadStream(objectId, streamOptions);
}

async function readBuffer(key) {
  const stream = await openReadStream(key);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = {
  saveBuffer: saveBuffer,
  getFileMeta: getFileMeta,
  openReadStream: openReadStream,
  readBuffer: readBuffer,
  parseStorageKey: parseStorageKey,
};
