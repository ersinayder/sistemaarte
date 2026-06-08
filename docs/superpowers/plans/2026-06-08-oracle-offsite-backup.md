# Oracle Offsite Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted offsite backup uploads to Oracle Object Storage, with immutable-retention-aware status reporting in the existing Configuracoes backup panel.

**Architecture:** Keep the current local SQLite backup flow as the source of truth, then optionally build an encrypted offsite package and upload it to Oracle through its S3-compatible API. Split responsibilities into status modeling, Oracle upload signing, package/encryption orchestration, database integration, UI display, and restore documentation.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, Vitest 4.1, built-in `crypto`/`https`/`fs`, and `archiver` for streaming ZIP creation.

---

## File Structure

- Modify: `backend/package.json` and `backend/package-lock.json`
  - Add `archiver` so packages can be created as ZIP streams without shelling out to PowerShell.
- Modify: `backend/utils/backupStatus.js`
  - Extend backup status snapshots with offsite provider, latest upload, retention days, bytes, hash, and sanitized errors.
- Test: `backend/__tests__/backupStatus.test.js`
  - Cover disabled, configured, recent, stale, and failed offsite states.
- Create: `backend/utils/oracleObjectStorage.js`
  - Implement S3-compatible PUT signing for Oracle Object Storage using Node built-ins.
- Test: `backend/__tests__/oracleObjectStorage.test.js`
  - Verify endpoint construction, credential validation, authorization header shape, no secret leakage, and mocked upload success/failure.
- Create: `backend/utils/offsiteBackup.js`
  - Build ZIP package, encrypt with AES-256-GCM, hash encrypted package, call provider adapter, clean temporary files, and return sanitized status.
- Test: `backend/__tests__/offsiteBackup.test.js`
  - Verify package scope, exclusion rules, encryption round-trip through test helper, failure preservation, and no remote delete calls.
- Modify: `backend/database.js`
  - After successful local backup rotation, call offsite orchestration when enabled and write combined status.
- Modify: `backend/routes/backup.js`
  - Return combined status and allow manual backup to trigger offsite as part of existing `backup()`.
- Modify: `backend/routes/configuracoes.js`
  - Use the combined status builder and include offsite status in Configuracoes.
- Test: `backend/__tests__/routeContracts.test.js`
  - Keep admin-only backup routes and assert the new offsite utility is wired without exposing secrets.
- Modify: `frontend/src/pages/Configuracoes.jsx`
  - Show real Oracle offsite status, last upload, retention, size, and safe error summary.
- Create: `docs/backup-offsite-oracle.md`
  - Document Oracle setup, bucket retention, environment variables, manual backup, and restore test.

---

### Task 1: Add Packaging Dependency

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

- [ ] **Step 1: Install `archiver` in the backend**

Run:

```powershell
cd backend
npm.cmd install archiver
```

Expected: `package.json` gains an `archiver` dependency and `package-lock.json` is updated.

- [ ] **Step 2: Verify dependency tree**

Run:

```powershell
cd backend
npm.cmd ls archiver
```

Expected: output contains `archiver@` and exits with code `0`.

- [ ] **Step 3: Commit dependency update**

```powershell
git add backend/package.json backend/package-lock.json
git commit -m "chore: add backup packaging dependency"
```

---

### Task 2: Extend Backup Status Model

**Files:**
- Modify: `backend/utils/backupStatus.js`
- Test: `backend/__tests__/backupStatus.test.js`

- [ ] **Step 1: Add failing tests for offsite status states**

Append these tests inside `describe('backupStatus', () => { ... })` in `backend/__tests__/backupStatus.test.js`:

```js
  it('reports OK when local and Oracle offsite backups are recent', () => {
    touchBackup('backup-2026-06-08T02-00-00.db', new Date('2026-06-08T02:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-06-08T10:00:00-03:00'),
      offsite: {
        enabled: true,
        provider: 'oracle',
        bucket: 'sistemaarte-backups',
        retentionDays: 60,
        latest: {
          nome: 'sistemaarte-2026-06-08T02-00-00.zip.enc',
          bytes: 1024,
          sha256: 'a'.repeat(64),
          uploadedat: new Date('2026-06-08T02:05:00-03:00').toISOString(),
        },
      },
    });

    expect(status.status.status).toBe('OK');
    expect(status.status.missing).toEqual([]);
    expect(status.offsite.status).toBe('OK');
    expect(status.offsite.provider).toBe('oracle');
    expect(status.offsite.bucket).toBe('sistemaarte-backups');
    expect(status.offsite.retencaoDias).toBe(60);
    expect(status.offsite.ultimo.nome).toBe('sistemaarte-2026-06-08T02-00-00.zip.enc');
  });

  it('marks offsite stale when the last upload is older than 30 hours', () => {
    touchBackup('backup-2026-06-08T02-00-00.db', new Date('2026-06-08T02:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-06-10T10:00:00-03:00'),
      offsite: {
        enabled: true,
        provider: 'oracle',
        bucket: 'sistemaarte-backups',
        retentionDays: 60,
        latest: {
          nome: 'sistemaarte-2026-06-08T02-00-00.zip.enc',
          bytes: 1024,
          sha256: 'b'.repeat(64),
          uploadedat: new Date('2026-06-08T02:05:00-03:00').toISOString(),
        },
      },
    });

    expect(status.status.status).toBe('Pendente');
    expect(status.status.missing).toContain('backup-offsite-recente');
    expect(status.offsite.status).toBe('Atrasado');
  });

  it('sanitizes offsite errors and never exposes secrets', () => {
    touchBackup('backup-2026-06-08T02-00-00.db', new Date('2026-06-08T02:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-06-08T10:00:00-03:00'),
      offsite: {
        enabled: true,
        provider: 'oracle',
        bucket: 'sistemaarte-backups',
        retentionDays: 60,
        ultimoErro: {
          mensagem: 'Falha usando ORACLE_OBJECT_STORAGE_SECRET_KEY=abc123 no C:\\sistemaarte\\.env',
          createdat: new Date('2026-06-08T02:05:00-03:00').toISOString(),
        },
      },
    });

    const body = JSON.stringify(status);
    expect(status.status.missing).toContain('backup-offsite-falhou');
    expect(body).not.toContain('abc123');
    expect(body).not.toContain('SECRET_KEY');
    expect(body).not.toContain('C:\\sistemaarte');
  });
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- backupStatus.test.js
```

Expected: FAIL because `buildBackupStatus()` does not accept or model `offsite`.

- [ ] **Step 3: Implement status changes**

In `backend/utils/backupStatus.js`, replace `ALERTAS_BACKUP` with:

```js
const ALERTAS_BACKUP = {
  "backup-local": {
    nivel: "critico",
    codigo: "backup-local",
    mensagem: "Nenhum backup local encontrado.",
  },
  "backup-recente": {
    nivel: "critico",
    codigo: "backup-recente",
    mensagem: "Ultimo backup local esta atrasado.",
  },
  "retencao-local": {
    nivel: "atencao",
    codigo: "retencao-local",
    mensagem: "Ha mais backups locais que o limite de retencao esperado.",
  },
  "destino-offsite": {
    nivel: "atencao",
    codigo: "destino-offsite",
    mensagem: "Backup offsite ainda nao configurado.",
  },
  "backup-offsite-recente": {
    nivel: "critico",
    codigo: "backup-offsite-recente",
    mensagem: "Ultimo backup offsite esta atrasado.",
  },
  "backup-offsite-falhou": {
    nivel: "critico",
    codigo: "backup-offsite-falhou",
    mensagem: "Ultimo backup offsite falhou.",
  },
};
```

Add these helpers above `buildBackupStatus()`:

```js
function sanitizeMessage(value = "") {
  return String(value)
    .replace(/ORACLE_OBJECT_STORAGE_[A-Z_]*=([^,\s]+)/g, "ORACLE_OBJECT_STORAGE_SECRET=[redacted]")
    .replace(/OFFSITE_BACKUP_ENCRYPTION_KEY=([^,\s]+)/g, "OFFSITE_BACKUP_ENCRYPTION_KEY=[redacted]")
    .replace(/[A-Za-z]:\\[^\s"]+/g, "[path]");
}

function buildOffsiteStatus(offsite = {}, now = new Date()) {
  if (!offsite.enabled) {
    return {
      status: "Pendente",
      missing: ["destino-offsite"],
      provider: offsite.provider || null,
      bucket: offsite.bucket || null,
      retencaoDias: Number(offsite.retentionDays || 0) || null,
      ultimo: null,
    };
  }

  const missing = [];
  const latest = offsite.latest || null;
  const uploadedAt = latest?.uploadedat ? new Date(latest.uploadedat) : null;
  const horasDesdeUltimo = uploadedAt && !Number.isNaN(uploadedAt.getTime())
    ? Math.round(((now.getTime() - uploadedAt.getTime()) / 36e5) * 10) / 10
    : null;

  if (!latest) missing.push("backup-offsite-recente");
  if (horasDesdeUltimo !== null && horasDesdeUltimo > 30) missing.push("backup-offsite-recente");
  if (offsite.ultimoErro) missing.push("backup-offsite-falhou");

  return {
    status: missing.length ? (missing.includes("backup-offsite-falhou") ? "Falhou" : "Atrasado") : "OK",
    missing,
    provider: offsite.provider || "oracle",
    bucket: offsite.bucket || null,
    retencaoDias: Number(offsite.retentionDays || 0) || null,
    horasDesdeUltimo,
    ultimo: latest ? {
      nome: latest.nome,
      bytes: latest.bytes,
      sha256: latest.sha256,
      uploadedat: latest.uploadedat,
    } : null,
    ultimoErro: offsite.ultimoErro ? {
      mensagem: sanitizeMessage(offsite.ultimoErro.mensagem),
      createdat: offsite.ultimoErro.createdat,
    } : null,
  };
}
```

Change `buildBackupStatus()` signature and offsite section:

```js
function buildBackupStatus(backupsDir, { now = new Date(), offsite = {} } = {}) {
  fs.mkdirSync(backupsDir, { recursive: true });

  const arquivos = fs.readdirSync(backupsDir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => fileInfo(backupsDir, name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const ultimo = arquivos[0] || null;
  const horasDesdeUltimo = ultimo
    ? Math.round(((now.getTime() - ultimo.mtimeMs) / 36e5) * 10) / 10
    : null;

  const missing = [];
  if (!ultimo) missing.push("backup-local");
  if (horasDesdeUltimo !== null && horasDesdeUltimo > 30) missing.push("backup-recente");
  if (arquivos.length > 7) missing.push("retencao-local");

  const offsiteStatus = buildOffsiteStatus(offsite, now);
  const statusMissing = [...missing, ...(offsiteStatus.missing || [])];

  return {
    status: {
      status: statusMissing.length ? "Pendente" : "OK",
      missing: statusMissing,
    },
    alertas: buildAlertas(statusMissing),
    local: {
      total: arquivos.length,
      retencao: 7,
      ultimo: ultimo ? {
        nome: ultimo.nome,
        bytes: ultimo.bytes,
        updatedat: ultimo.updatedat,
      } : null,
      horasDesdeUltimo,
      arquivos: arquivos.slice(0, 7).map(({ mtimeMs, ...item }) => item),
      proximaRotina: "Diariamente as 02:00 BRT",
    },
    offsite: offsiteStatus,
  };
}
```

Export `buildOffsiteStatus` and `sanitizeMessage`:

```js
module.exports = {
  BACKUP_STATUS_FILE,
  buildAlertas,
  backupStatusPath,
  buildBackupStatus,
  buildOffsiteStatus,
  readBackupStatus,
  sanitizeMessage,
  writeBackupStatus,
};
```

- [ ] **Step 4: Run status tests**

Run:

```powershell
cd backend
npm.cmd test -- backupStatus.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit status model**

```powershell
git add backend/utils/backupStatus.js backend/__tests__/backupStatus.test.js
git commit -m "feat: model offsite backup status"
```

---

### Task 3: Implement Oracle Object Storage Upload Adapter

**Files:**
- Create: `backend/utils/oracleObjectStorage.js`
- Test: `backend/__tests__/oracleObjectStorage.test.js`

- [ ] **Step 1: Write failing adapter tests**

Create `backend/__tests__/oracleObjectStorage.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const {
  buildOracleS3Config,
  buildObjectUrl,
  putObject,
  sanitizeOracleError,
} = await import('../utils/oracleObjectStorage.js');

describe('oracleObjectStorage', () => {
  it('builds the Oracle S3-compatible endpoint without exposing secrets', () => {
    const config = buildOracleS3Config({
      namespace: 'ns1',
      region: 'sa-saopaulo-1',
      bucket: 'sistemaarte-backups',
      accessKey: 'access',
      secretKey: 'secret',
    });

    expect(config.host).toBe('ns1.compat.objectstorage.sa-saopaulo-1.oraclecloud.com');
    expect(config.bucket).toBe('sistemaarte-backups');
    expect(JSON.stringify(config)).not.toContain('secret');
  });

  it('encodes object keys safely in path-style URLs', () => {
    const url = buildObjectUrl({
      host: 'ns1.compat.objectstorage.sa-saopaulo-1.oraclecloud.com',
      bucket: 'sistemaarte-backups',
      key: 'daily/sistemaarte 2026.zip.enc',
    });

    expect(url.toString()).toBe('https://ns1.compat.objectstorage.sa-saopaulo-1.oraclecloud.com/sistemaarte-backups/daily/sistemaarte%202026.zip.enc');
  });

  it('uploads with a signed request and returns safe metadata', async () => {
    const body = Buffer.from('encrypted');
    const sha256 = createHash('sha256').update(body).digest('hex');
    const request = vi.fn((_url, options, callback) => {
      const chunks = [];
      const req = {
        write(chunk) { chunks.push(Buffer.from(chunk)); },
        end() {
          callback({
            statusCode: 200,
            headers: { etag: '"abc"' },
            on(event, handler) {
              if (event === 'data') handler(Buffer.from(''));
              if (event === 'end') handler();
            },
          });
        },
        on() {},
      };
      expect(options.method).toBe('PUT');
      expect(options.headers.Authorization).toContain('AWS4-HMAC-SHA256');
      expect(options.headers['x-amz-content-sha256']).toBe(sha256);
      return req;
    });

    const result = await putObject({
      namespace: 'ns1',
      region: 'sa-saopaulo-1',
      bucket: 'sistemaarte-backups',
      accessKey: 'access',
      secretKey: 'secret',
      key: 'daily/file.zip.enc',
      body,
      contentType: 'application/octet-stream',
      request,
      now: new Date('2026-06-08T05:00:00.000Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.etag).toBe('"abc"');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('sanitizes provider errors', () => {
    const error = sanitizeOracleError(new Error('403 secret C:\\sistemaarte\\.env'));
    expect(error).not.toContain('secret');
    expect(error).not.toContain('C:\\sistemaarte');
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- oracleObjectStorage.test.js
```

Expected: FAIL because `oracleObjectStorage.js` does not exist.

- [ ] **Step 3: Implement adapter**

Create `backend/utils/oracleObjectStorage.js`:

```js
const crypto = require("crypto");
const https = require("https");

function encodeKey(key) {
  return String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function sanitizeOracleError(err) {
  return String(err?.message || err || "Falha no Oracle Object Storage")
    .replace(/[A-Za-z]:\\[^\s"]+/g, "[path]")
    .replace(/secret/gi, "[redacted]");
}

function requireField(value, name) {
  if (!value) throw new Error(`Configuracao Oracle ausente: ${name}`);
  return value;
}

function buildOracleS3Config(input = process.env) {
  const namespace = requireField(input.namespace || input.ORACLE_OBJECT_STORAGE_NAMESPACE, "ORACLE_OBJECT_STORAGE_NAMESPACE");
  const region = requireField(input.region || input.ORACLE_OBJECT_STORAGE_REGION, "ORACLE_OBJECT_STORAGE_REGION");
  const bucket = requireField(input.bucket || input.ORACLE_OBJECT_STORAGE_BUCKET, "ORACLE_OBJECT_STORAGE_BUCKET");
  const accessKey = requireField(input.accessKey || input.ORACLE_OBJECT_STORAGE_ACCESS_KEY, "ORACLE_OBJECT_STORAGE_ACCESS_KEY");
  const secretKey = requireField(input.secretKey || input.ORACLE_OBJECT_STORAGE_SECRET_KEY, "ORACLE_OBJECT_STORAGE_SECRET_KEY");

  return {
    namespace,
    region,
    bucket,
    accessKey,
    secretKey,
    host: `${namespace}.compat.objectstorage.${region}.oraclecloud.com`,
    toJSON() {
      return { namespace, region, bucket, accessKey, host: this.host };
    },
  };
}

function buildObjectUrl({ host, bucket, key }) {
  return new URL(`https://${host}/${encodeURIComponent(bucket)}/${encodeKey(key)}`);
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function hashHex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signingKey(secretKey, dateStamp, region) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

async function putObject({
  namespace,
  region,
  bucket,
  accessKey,
  secretKey,
  key,
  body,
  contentType = "application/octet-stream",
  request = https.request,
  now = new Date(),
}) {
  const config = buildOracleS3Config({ namespace, region, bucket, accessKey, secretKey });
  const url = buildObjectUrl({ host: config.host, bucket: config.bucket, key });
  const payloadHash = hashHex(body);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = url.pathname;
  const canonicalHeaders = [
    `host:${config.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join("\n") + "\n";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = hmac(signingKey(config.secretKey, dateStamp, config.region), stringToSign, "hex");

  const headers = {
    "Content-Length": body.length,
    "Content-Type": contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };

  return new Promise((resolve, reject) => {
    const req = request(url, { method: "PUT", headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, etag: res.headers.etag || null });
          return;
        }
        reject(new Error(`Oracle Object Storage retornou HTTP ${res.statusCode}: ${responseBody.slice(0, 200)}`));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  buildOracleS3Config,
  buildObjectUrl,
  putObject,
  sanitizeOracleError,
};
```

- [ ] **Step 4: Run adapter tests**

Run:

```powershell
cd backend
npm.cmd test -- oracleObjectStorage.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit adapter**

```powershell
git add backend/utils/oracleObjectStorage.js backend/__tests__/oracleObjectStorage.test.js
git commit -m "feat: add oracle object storage adapter"
```

---

### Task 4: Build Encrypted Offsite Package Orchestrator

**Files:**
- Create: `backend/utils/offsiteBackup.js`
- Test: `backend/__tests__/offsiteBackup.test.js`

- [ ] **Step 1: Write failing orchestrator tests**

Create `backend/__tests__/offsiteBackup.test.js`:

```js
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildOffsiteConfig,
  decryptPackageForTest,
  runOffsiteBackup,
} = await import('../utils/offsiteBackup.js');

let tmpDir;

describe('offsiteBackup', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offsite-backup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps offsite disabled unless explicitly enabled', () => {
    expect(buildOffsiteConfig({ OFFSITE_BACKUP_ENABLED: '0' }).enabled).toBe(false);
    expect(buildOffsiteConfig({}).enabled).toBe(false);
  });

  it('creates an encrypted package and uploads it without exposing plaintext', async () => {
    const backupFile = path.join(tmpDir, 'backup-2026-06-08T02-00-00.db');
    const xmlDir = path.join(tmpDir, 'nfe_xmls');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(backupFile, 'sqlite-data');
    fs.writeFileSync(path.join(xmlDir, '3526.xml'), '<xml>nfe</xml>');
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=leak');
    fs.writeFileSync(path.join(tmpDir, 'certificado.pfx'), 'pfx');

    const upload = vi.fn(async ({ body, key }) => ({ ok: true, etag: '"etag"', key, bodyLength: body.length }));
    const result = await runOffsiteBackup({
      backupFile,
      dataDir: tmpDir,
      backupsDir: tmpDir,
      upload,
      env: {
        OFFSITE_BACKUP_ENABLED: '1',
        OFFSITE_BACKUP_PROVIDER: 'oracle',
        ORACLE_OBJECT_STORAGE_BUCKET: 'sistemaarte-backups',
        OFFSITE_BACKUP_RETENTION_DAYS: '60',
        OFFSITE_BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      },
      now: new Date('2026-06-08T05:00:00.000Z'),
    });

    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.status.latest.nome).toBe('sistemaarte-2026-06-08T05-00-00.zip.enc');
    expect(result.status.latest.sha256).toMatch(/^[a-f0-9]{64}$/);
    const encrypted = upload.mock.calls[0][0].body;
    expect(encrypted.toString('utf8')).not.toContain('sqlite-data');
    expect(encrypted.toString('utf8')).not.toContain('<xml>nfe</xml>');

    const decrypted = await decryptPackageForTest({
      encrypted,
      keyBase64: result.debug.keyBase64,
      ivBase64: result.debug.ivBase64,
      tagBase64: result.debug.tagBase64,
    });
    expect(decrypted.length).toBeGreaterThan(100);
    expect(JSON.stringify(result)).not.toContain('SECRET=leak');
    expect(JSON.stringify(result)).not.toContain('pfx');
  });

  it('returns a sanitized failure status when upload fails', async () => {
    const backupFile = path.join(tmpDir, 'backup.db');
    fs.writeFileSync(backupFile, 'sqlite-data');
    const upload = vi.fn(async () => {
      throw new Error('Falha secret C:\\sistemaarte\\.env');
    });

    const result = await runOffsiteBackup({
      backupFile,
      dataDir: tmpDir,
      backupsDir: tmpDir,
      upload,
      env: {
        OFFSITE_BACKUP_ENABLED: '1',
        OFFSITE_BACKUP_PROVIDER: 'oracle',
        ORACLE_OBJECT_STORAGE_BUCKET: 'sistemaarte-backups',
        OFFSITE_BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.status.ultimoErro.mensagem).not.toContain('secret');
    expect(result.status.ultimoErro.mensagem).not.toContain('C:\\sistemaarte');
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- offsiteBackup.test.js
```

Expected: FAIL because `offsiteBackup.js` does not exist.

- [ ] **Step 3: Implement orchestrator**

Create `backend/utils/offsiteBackup.js`:

```js
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const archiver = require("archiver");
const { putObject, buildOracleS3Config, sanitizeOracleError } = require("./oracleObjectStorage");

function safeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOffsiteConfig(env = process.env) {
  const enabled = env.OFFSITE_BACKUP_ENABLED === "1" || env.OFFSITE_BACKUP_ENABLED === "true";
  return {
    enabled,
    provider: env.OFFSITE_BACKUP_PROVIDER || "oracle",
    bucket: env.ORACLE_OBJECT_STORAGE_BUCKET || null,
    retentionDays: safeInt(env.OFFSITE_BACKUP_RETENTION_DAYS, 60),
    encryptionKey: env.OFFSITE_BACKUP_ENCRYPTION_KEY || "",
  };
}

function packageName(now = new Date()) {
  return `sistemaarte-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.zip`;
}

function assertEncryptionKey(keyBase64) {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("OFFSITE_BACKUP_ENCRYPTION_KEY deve ter 32 bytes em base64.");
  return key;
}

function addDirectoryIfExists(archive, dir, archiveName) {
  if (fs.existsSync(dir)) archive.directory(dir, archiveName);
}

function createZip({ backupFile, dataDir, destFile }) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destFile);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.file(backupFile, { name: "oficina.db" });
    addDirectoryIfExists(archive, path.join(dataDir, "nfe_xmls"), "nfe_xmls");
    archive.append(JSON.stringify({
      createdat: new Date().toISOString(),
      includes: ["oficina.db", "nfe_xmls"],
    }, null, 2), { name: "manifest.json" });
    archive.finalize();
  });
}

function encryptFile({ sourceFile, keyBase64 }) {
  const key = assertEncryptionKey(keyBase64);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(fs.readFileSync(sourceFile)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    body: Buffer.concat([Buffer.from("SAOB1"), iv, tag, encrypted]),
    ivBase64: iv.toString("base64"),
    tagBase64: tag.toString("base64"),
  };
}

async function decryptPackageForTest({ encrypted, keyBase64, ivBase64, tagBase64 }) {
  const key = Buffer.from(keyBase64, "base64");
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const body = Buffer.from(encrypted).subarray(33);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

async function runOffsiteBackup({
  backupFile,
  dataDir,
  backupsDir,
  env = process.env,
  upload,
  now = new Date(),
}) {
  const config = buildOffsiteConfig(env);
  if (!config.enabled) return { ok: true, skipped: true, status: config };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sistemaarte-offsite-"));
  const zipName = packageName(now);
  const zipFile = path.join(tmpDir, zipName);
  const encryptedName = `${zipName}.enc`;

  try {
    await createZip({ backupFile, dataDir, destFile: zipFile });
    const encrypted = encryptFile({ sourceFile: zipFile, keyBase64: config.encryptionKey });
    const sha256 = crypto.createHash("sha256").update(encrypted.body).digest("hex");
    const key = `daily/${encryptedName}`;
    const uploader = upload || ((payload) => putObject({ ...buildOracleS3Config(env), ...payload }));
    await uploader({
      key,
      body: encrypted.body,
      contentType: "application/octet-stream",
    });

    return {
      ok: true,
      status: {
        enabled: true,
        provider: config.provider,
        bucket: config.bucket,
        retentionDays: config.retentionDays,
        latest: {
          nome: encryptedName,
          key,
          bytes: encrypted.body.length,
          sha256,
          uploadedat: now.toISOString(),
        },
      },
      debug: {
        keyBase64: config.encryptionKey,
        ivBase64: encrypted.ivBase64,
        tagBase64: encrypted.tagBase64,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: {
        enabled: true,
        provider: config.provider,
        bucket: config.bucket,
        retentionDays: config.retentionDays,
        ultimoErro: {
          mensagem: sanitizeOracleError(err),
          createdat: new Date().toISOString(),
        },
      },
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    void backupsDir;
  }
}

module.exports = {
  buildOffsiteConfig,
  decryptPackageForTest,
  runOffsiteBackup,
};
```

- [ ] **Step 4: Run orchestrator tests**

Run:

```powershell
cd backend
npm.cmd test -- offsiteBackup.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit orchestrator**

```powershell
git add backend/utils/offsiteBackup.js backend/__tests__/offsiteBackup.test.js
git commit -m "feat: create encrypted offsite backup packages"
```

---

### Task 5: Integrate Offsite Backup Into Local Backup Flow

**Files:**
- Modify: `backend/database.js`
- Modify: `backend/routes/backup.js`
- Modify: `backend/routes/configuracoes.js`
- Test: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Add contract tests for integration**

In `backend/__tests__/routeContracts.test.js`, extend the existing backup contract test:

```js
    expect(source).toMatch(/runOffsiteBackup/);
    expect(source).toMatch(/offsite/);
```

In the `writes backup-status.json after backup attempts` test, add:

```js
    expect(source).toMatch(/runOffsiteBackup/);
    expect(source).toMatch(/writeBackupStatus\(bdir,\s*status\)/);
```

- [ ] **Step 2: Run contract tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because `database.js` is not wired to `runOffsiteBackup`.

- [ ] **Step 3: Wire database backup flow**

At the top of `backend/database.js`, add:

```js
const { runOffsiteBackup, buildOffsiteConfig } = require("./utils/offsiteBackup");
```

Replace the successful branch of `backup()` with:

```js
  return db.backup(dest).then(async () => {
    const files = fs.readdirSync(bdir).filter(f => f.endsWith(".db")).sort();
    while (files.length > 7) fs.unlinkSync(path.join(bdir, files.shift()));

    const offsiteResult = await runOffsiteBackup({
      backupFile: dest,
      dataDir: DATA_DIR,
      backupsDir: bdir,
    });
    const offsite = offsiteResult?.status || buildOffsiteConfig();
    const status = buildBackupStatus(bdir, { offsite });
    writeBackupStatus(bdir, status);
    console.log("[Backup] Salvo:", dest);
    if (offsiteResult?.ok === false) console.error("[Backup] Offsite falhou:", offsite.ultimoErro?.mensagem);
    return { ok: true, arquivo: path.basename(dest), status, offsite: offsiteResult };
  }).catch(e => {
```

In the catch branch, change:

```js
    const status = buildBackupStatus(bdir);
```

to:

```js
    const status = buildBackupStatus(bdir, { offsite: buildOffsiteConfig() });
```

- [ ] **Step 4: Ensure Configuracoes uses persisted offsite status**

In `backend/routes/configuracoes.js`, import `readBackupStatus`:

```js
const { buildBackupStatus, readBackupStatus } = require("../utils/backupStatus");
```

Replace `backupAtual()` with:

```js
function backupAtual() {
  return readBackupStatus(BACKUPS_DIR);
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
cd backend
npm.cmd test -- backupStatus.test.js routeContracts.test.js offsiteBackup.test.js oracleObjectStorage.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit integration**

```powershell
git add backend/database.js backend/routes/configuracoes.js backend/routes/backup.js backend/__tests__/routeContracts.test.js
git commit -m "feat: run oracle offsite backup after local backup"
```

---

### Task 6: Update Configuracoes Backup UI

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`

- [ ] **Step 1: Update offsite display**

Inside `renderBackups()` in `frontend/src/pages/Configuracoes.jsx`, replace the `Backup offsite` card body with:

```jsx
            <div className="settings-info-grid">
              <InfoRow label="Destino" value={offsite.provider === 'oracle' ? 'Oracle Object Storage' : 'Nao configurado'} />
              <InfoRow label="Bucket" value={offsite.bucket || '-'} />
              <InfoRow label="Retencao" value={offsite.retencaoDias ? `${offsite.retencaoDias} dias` : '-'} />
              <InfoRow label="Ultimo envio" value={offsite.ultimo?.uploadedat || 'Nenhum envio offsite'} />
              <InfoRow label="Arquivo" value={offsite.ultimo?.nome || '-'} />
              <InfoRow label="Tamanho" value={offsite.ultimo?.bytes ? formatBytes(offsite.ultimo.bytes) : '-'} />
            </div>
            {offsite.ultimoErro ? (
              <div className="settings-planned-item">
                <strong>Ultima falha</strong>
                <span>{offsite.ultimoErro.mensagem}</span>
              </div>
            ) : (
              <div className="settings-planned-item">
                <strong>Protecao externa</strong>
                <span>{offsite.status === 'OK' ? 'Backup offsite recente registrado.' : 'Aguardando primeiro envio offsite para o Oracle.'}</span>
              </div>
            )}
```

- [ ] **Step 2: Build frontend**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: Vite build completes without JSX errors.

- [ ] **Step 3: Commit UI**

```powershell
git add frontend/src/pages/Configuracoes.jsx
git commit -m "feat: show oracle offsite backup status"
```

---

### Task 7: Document Oracle Setup and Restore Procedure

**Files:**
- Create: `docs/backup-offsite-oracle.md`

- [ ] **Step 1: Create operational documentation**

Create `docs/backup-offsite-oracle.md`:

```markdown
# Backup Offsite Oracle Object Storage

## Objetivo

Guardar backups criptografados do Sistema Arte e Molduras fora do servidor Windows, usando Oracle Object Storage Always Free enquanto o volume total couber em 20 GB.

## Bucket Oracle

1. Criar bucket privado para backups.
2. Ativar regra de retencao no bucket por 60 dias.
3. Bloquear a regra de retencao somente depois de validar um upload e um restore de teste.
4. Criar credencial S3-compatible com permissao minima para upload e verificacao.
5. Manter a conta administrativa Oracle fora do servidor e protegida com 2FA.

## Variaveis de ambiente

```env
OFFSITE_BACKUP_ENABLED=1
OFFSITE_BACKUP_PROVIDER=oracle
ORACLE_OBJECT_STORAGE_NAMESPACE=namespace
ORACLE_OBJECT_STORAGE_REGION=sa-saopaulo-1
ORACLE_OBJECT_STORAGE_BUCKET=sistemaarte-backups
ORACLE_OBJECT_STORAGE_ACCESS_KEY=access-key
ORACLE_OBJECT_STORAGE_SECRET_KEY=secret-key
OFFSITE_BACKUP_RETENTION_DAYS=60
OFFSITE_BACKUP_ENCRYPTION_KEY=base64-32-bytes
```

Gerar chave local:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guarde essa chave fora do servidor. Sem ela, o pacote offsite nao pode ser restaurado.

## Teste manual

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"lojanova"}'
$token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""
Invoke-RestMethod -Uri "http://localhost:3001/api/configuracoes/backups/manual" -Method POST -Headers @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:3001/api/configuracoes/backups" -Method GET -Headers @{ Authorization = "Bearer $token" }
```

## Restore de teste

1. Baixar o objeto `.zip.enc` no Oracle.
2. Descriptografar com `OFFSITE_BACKUP_ENCRYPTION_KEY`.
3. Extrair `oficina.db` e `nfe_xmls/`.
4. Em ambiente local ou homologacao, parar PM2.
5. Substituir `backend/data/oficina.db` e `backend/data/nfe_xmls/`.
6. Iniciar PM2.
7. Validar `/api/health`, login admin, listagem de OS e tela NF-e.

## Regra operacional

Nunca usar sincronizacao bidirecional com delete remoto. O servidor envia snapshots datados e nao executa exclusao remota.
```

- [ ] **Step 2: Commit documentation**

```powershell
git add docs/backup-offsite-oracle.md
git commit -m "docs: add oracle backup restore procedure"
```

---

### Task 8: Full Verification

**Files:**
- Verify all touched backend, frontend, and docs files.

- [ ] **Step 1: Run backend tests**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: all backend Vitest tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Check git status**

Run:

```powershell
git status --short
```

Expected: only intentional working-tree changes remain, or a clean tree if every task committed.

- [ ] **Step 4: Manual Oracle validation on the server**

Run on the Windows Server after adding `.env` variables:

```powershell
cd C:\sistemaarte\backend
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pm2 restart ecosystem.config.js
```

Then trigger the manual backup using the documented PowerShell login flow and confirm:

- `backend/data/backups/backup-status.json` has `offsite.status` as `OK`.
- Oracle bucket contains `daily/sistemaarte-*.zip.enc`.
- The bucket retention rule prevents deleting that object before the retention period.

## Self-Review

- Spec coverage: The plan covers Oracle-only offsite backup, encrypted packages, `oficina.db`, `nfe_xmls/`, local backup preservation, status UI, restore docs, and tests.
- Placeholder scan: No placeholder markers remain.
- Type consistency: Offsite status uses `enabled`, `provider`, `bucket`, `retentionDays`, `latest`, and `ultimoErro` internally; public API exposes `retencaoDias`, `ultimo`, and sanitized `ultimoErro`.
