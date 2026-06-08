"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sanitizeMessage } = require("./backupStatus");
const { buildOracleS3Config, putObject, sanitizeOracleError } = require("./oracleObjectStorage");

const ENCRYPTION_MAGIC = Buffer.from("SAOBK1");
const ZIP_CONTENT_TYPE = "application/octet-stream";
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return crc >>> 0;
});

function isEnabled(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseRetentionDays(value) {
  const days = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(days) && days > 0 ? days : 60;
}

function buildOffsiteConfig(env = process.env) {
  return {
    enabled: isEnabled(env.OFFSITE_BACKUP_ENABLED),
    provider: String(env.OFFSITE_BACKUP_PROVIDER || "oracle").trim() || "oracle",
    bucket: String(env.OFFSITE_BACKUP_BUCKET || env.ORACLE_OBJECT_STORAGE_BUCKET || "").trim(),
    retentionDays: parseRetentionDays(env.OFFSITE_BACKUP_RETENTION_DAYS),
    encryptionKey: env.OFFSITE_BACKUP_ENCRYPTION_KEY || "",
  };
}

function publicStatus(config) {
  return {
    enabled: config.enabled,
    provider: config.provider,
    bucket: config.bucket || null,
    retentionDays: config.retentionDays,
  };
}

function sanitizeError(err) {
  return sanitizeMessage(sanitizeOracleError(err))
    .replace(/\.env\b/gi, "[arquivo ocultado]")
    .replace(/\.pfx\b/gi, "[arquivo ocultado]")
    .replace(/\bpfx\b/gi, "[arquivo ocultado]");
}

function decodeEncryptionKey(key) {
  const decoded = Buffer.from(String(key || ""), "base64");
  if (decoded.length !== 32 || decoded.toString("base64").replace(/=+$/, "") !== String(key || "").replace(/=+$/, "")) {
    throw new Error("Configuracao invalida: chave de criptografia offsite deve ser base64 com 32 bytes.");
  }
  return decoded;
}

function safeTimestamp(now) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "-");
}

function objectKey(now) {
  return `sistemaarte-offsite-${safeTimestamp(now)}.zip.enc`;
}

function ensureInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Arquivo fora do escopo permitido para backup offsite.");
  }
}

function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function isAllowedNfeXmlFile(file) {
  const name = path.basename(file).toLowerCase();
  const ext = path.extname(name);
  const sensitiveExtensions = new Set([".pfx", ".env", ".key", ".pem"]);
  const sensitiveWords = ["secret", "senha", "password", "token", "key"];

  if (name === ".env") return false;
  if (sensitiveExtensions.has(ext)) return false;
  if (ext !== ".xml") return false;
  return !sensitiveWords.some((word) => name.includes(word));
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(data);
    const localHeader = Buffer.concat([
      Buffer.from("504b0304", "hex"),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      name,
    ]);
    localParts.push(localHeader, data);

    centralParts.push(Buffer.concat([
      Buffer.from("504b0102", "hex"),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name,
    ]));

    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    Buffer.from("504b0506", "hex"),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createZip({ backupFile, dataDir, tempDir, now }) {
  const zipFile = path.join(tempDir, "offsite-package.zip");
  const nfeDir = path.join(dataDir, "nfe_xmls");
  const nfeFiles = listFilesRecursive(nfeDir).filter(isAllowedNfeXmlFile);
  const nfeNames = nfeFiles.map((file) => {
    ensureInside(nfeDir, file);
    return path.relative(nfeDir, file).split(path.sep).join("/");
  });
  const entries = [
    { name: "oficina.db", data: fs.readFileSync(backupFile) },
    ...nfeFiles.map((file, index) => ({
      name: `nfe_xmls/${nfeNames[index]}`,
      data: fs.readFileSync(file),
    })),
    {
      name: "manifest.json",
      data: JSON.stringify({
        generatedat: now.toISOString(),
        database: "oficina.db",
        includes: {
          nfe_xmls: nfeNames,
        },
      }, null, 2),
    },
  ];

  fs.writeFileSync(zipFile, buildZip(entries));
  return zipFile;
}

function encryptPackage(zipBytes, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(zipBytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENCRYPTION_MAGIC, iv, tag, ciphertext]);
}

function decryptPackageForTest(encryptedPackage, base64Key) {
  const body = Buffer.isBuffer(encryptedPackage)
    ? encryptedPackage
    : Buffer.from(encryptedPackage);
  if (!body.subarray(0, ENCRYPTION_MAGIC.length).equals(ENCRYPTION_MAGIC)) {
    throw new Error("Pacote offsite invalido.");
  }
  const key = decodeEncryptionKey(base64Key);
  const offset = ENCRYPTION_MAGIC.length;
  const iv = body.subarray(offset, offset + 12);
  const tag = body.subarray(offset + 12, offset + 28);
  const ciphertext = body.subarray(offset + 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function defaultUpload({ key, body, contentType, env, offsiteConfig, now }) {
  const config = buildOracleS3Config({ bucket: offsiteConfig.bucket }, env);
  return putObject({ config, key, body, contentType, now });
}

async function runOffsiteBackup({
  backupFile,
  dataDir,
  backupsDir,
  env = process.env,
  upload,
  now = new Date(),
} = {}) {
  const config = buildOffsiteConfig(env);
  const statusBase = publicStatus(config);

  if (!config.enabled) {
    return {
      ok: true,
      skipped: true,
      status: statusBase,
    };
  }

  let tempDir;
  try {
    const keyBytes = decodeEncryptionKey(config.encryptionKey);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sistemaarte-offsite-"));
    fs.mkdirSync(backupsDir, { recursive: true });
    ensureInside(backupsDir, backupFile);

    const zipFile = await createZip({ backupFile, dataDir, tempDir, now });
    const zipBytes = fs.readFileSync(zipFile);
    const encrypted = encryptPackage(zipBytes, keyBytes);
    const sha256 = crypto.createHash("sha256").update(encrypted).digest("hex");
    const key = objectKey(now);
    const uploader = upload || ((payload) => defaultUpload({
      ...payload,
      env,
      offsiteConfig: config,
      now,
    }));

    await uploader({ key, body: encrypted, contentType: ZIP_CONTENT_TYPE });

    return {
      ok: true,
      status: {
        ...statusBase,
        latest: {
          nome: key,
          bytes: encrypted.length,
          sha256,
          uploadedat: now.toISOString(),
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: {
        ...statusBase,
        ultimoErro: {
          mensagem: sanitizeError(err),
          createdat: now.toISOString(),
        },
      },
    };
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  buildOffsiteConfig,
  decryptPackageForTest,
  runOffsiteBackup,
};
