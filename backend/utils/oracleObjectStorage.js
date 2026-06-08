"use strict";

const crypto = require("crypto");
const https = require("https");

const DEFAULT_SERVICE = "s3";

function requireValue(name, value) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`Configuracao Oracle Object Storage ausente: ${name}.`);
  return clean;
}

function buildOracleS3Config(input = {}, env = process.env) {
  const namespace = requireValue(
    "namespace",
    input.namespace || env.ORACLE_OBJECT_STORAGE_NAMESPACE
  );
  const region = requireValue(
    "region",
    input.region || env.ORACLE_OBJECT_STORAGE_REGION
  );
  const bucket = requireValue(
    "bucket",
    input.bucket || env.ORACLE_OBJECT_STORAGE_BUCKET
  );
  const accessKey = requireValue(
    "accessKey",
    input.accessKey || env.ORACLE_OBJECT_STORAGE_ACCESS_KEY
  );
  const secretKey = requireValue(
    "secretKey",
    input.secretKey || env.ORACLE_OBJECT_STORAGE_SECRET_KEY
  );

  const config = {
    namespace,
    region,
    bucket,
    accessKey,
    host: `${namespace}.compat.objectstorage.${region}.oraclecloud.com`,
  };

  Object.defineProperty(config, "secretKey", {
    value: secretKey,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return config;
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeKey(key) {
  return String(key)
    .split("/")
    .map(encodePathSegment)
    .join("/");
}

function buildObjectPath({ bucket, key }) {
  return `/${encodePathSegment(bucket)}/${encodeKey(key)}`;
}

function buildObjectUrl({ host, bucket, key }) {
  return `https://${host}${buildObjectPath({ bucket, key })}`;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function amzDate(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(now) {
  return amzDate(now).slice(0, 8);
}

function signingKey(secretKey, stamp, region, service = DEFAULT_SERVICE) {
  const kDate = hmac(`AWS4${secretKey}`, stamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function canonicalHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .sort(([a], [b]) => a.localeCompare(b));
}

function buildAuthorization({ config, method, path, headers, bodyHash, now }) {
  const stamp = dateStamp(now);
  const requestDate = amzDate(now);
  const credentialScope = `${stamp}/${config.region}/${DEFAULT_SERVICE}/aws4_request`;
  const canonical = canonicalHeaders(headers);
  const signedHeaders = canonical.map(([key]) => key).join(";");
  const canonicalHeaderText = canonical.map(([key, value]) => `${key}:${value}\n`).join("");
  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaderText,
    signedHeaders,
    bodyHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    requestDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    signingKey(config.secretKey, stamp, config.region),
    stringToSign,
    "hex"
  );

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    requestDate,
  };
}

function defaultRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers || {},
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    req.on("error", reject);
    req.end(body);
  });
}

function normalizeBody(body) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body ?? ""), "utf8");
}

async function putObject({
  config,
  key,
  body,
  contentType = "application/octet-stream",
  request = defaultRequest,
  now = new Date(),
} = {}) {
  if (!config) throw new Error("Configuracao Oracle Object Storage ausente.");
  const payload = normalizeBody(body);
  const path = buildObjectPath({ bucket: config.bucket, key });
  const bodyHash = sha256Hex(payload);
  const headers = {
    Host: config.host,
    "Content-Length": payload.length,
    "Content-Type": contentType,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amzDate(now),
  };
  const signed = buildAuthorization({
    config,
    method: "PUT",
    path,
    headers,
    bodyHash,
    now,
  });
  headers.Authorization = signed.authorization;
  headers["x-amz-date"] = signed.requestDate;

  let response;
  try {
    response = await request({
      protocol: "https:",
      hostname: config.host,
      host: config.host,
      method: "PUT",
      path,
      headers,
    }, payload);
  } catch (err) {
    throw new Error(sanitizeOracleError(err));
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(sanitizeOracleError(
      new Error(`Oracle Object Storage retornou HTTP ${response.statusCode}: ${response.body || ""}`)
    ));
  }

  return {
    ok: true,
    etag: response.headers.etag || response.headers.ETag || null,
    bucket: config.bucket,
    key,
    url: buildObjectUrl({ host: config.host, bucket: config.bucket, key }),
  };
}

function sanitizeOracleError(error) {
  return String(error?.message || error || "")
    .replace(/\bsecret\b/gi, "[segredo ocultado]")
    .replace(/["']?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|SENHA|KEY)[A-Z0-9_]*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s;,)]+)/gi, "[segredo ocultado]")
    .replace(/\b(?:token|password|senha|key)\b\s*[:=]\s*[^\s;,)]+/gi, "[segredo ocultado]")
    .replace(/(https?:\/\/)[^\/\s:@]+:[^\/\s@]+@/gi, "$1[credenciais ocultadas]@")
    .replace(/[?&][^=&\s]*(?:token|secret|password|senha|key)[^=&\s]*=[^&#\s"',;)]+/gi, "?[segredo ocultado]")
    .replace(/\\\\[^\s"'<>|\\]+\\[^\s"'<>|\\]+(?:\\[^\s"'<>|\\]+)*/g, "[caminho ocultado]")
    .replace(/[A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]*/g, "[caminho ocultado]")
    .replace(/(^|[\s"'(])\/(?:[^\s"'<>|/]+\/)+[^\s"'<>|]*/g, "$1[caminho ocultado]");
}

module.exports = {
  buildObjectUrl,
  buildOracleS3Config,
  putObject,
  sanitizeOracleError,
};
