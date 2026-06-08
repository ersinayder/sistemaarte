import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  buildOffsiteConfig,
  decryptPackageForTest,
  runOffsiteBackup,
} = await import('../utils/offsiteBackup.js');

let tmpDir;
let dataDir;
let backupsDir;
let backupFile;

function base64Key() {
  return crypto.randomBytes(32).toString('base64');
}

function makeEnv(overrides = {}) {
  return {
    OFFSITE_BACKUP_ENABLED: '1',
    OFFSITE_BACKUP_BUCKET: 'sistemaarte-offsite',
    OFFSITE_BACKUP_ENCRYPTION_KEY: base64Key(),
    ...overrides,
  };
}

function tempOffsiteDirs() {
  return fs.readdirSync(os.tmpdir())
    .filter((name) => name.startsWith('sistemaarte-offsite-'))
    .sort();
}

function zipText(body, base64Key) {
  return decryptPackageForTest(body, base64Key).toString('latin1');
}

function writeBackupFixture() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  backupFile = path.join(backupsDir, 'backup-2026-06-08.db');
  fs.writeFileSync(backupFile, 'sqlite-data');
  fs.mkdirSync(path.join(dataDir, 'nfe_xmls'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'nfe_xmls', '351.xml'), '<xml>nfe</xml>');
  fs.writeFileSync(path.join(dataDir, 'nfe_xmls', 'segredo.pfx'), 'nfe-pfx-secret');
  fs.writeFileSync(path.join(dataDir, 'nfe_xmls', '.env'), 'NFE_SECRET=leak');
  fs.writeFileSync(path.join(dataDir, 'nfe_xmls', 'token.xml.bak'), 'token-backup-leak');
  fs.mkdirSync(path.join(dataDir, 'nfe_xmls', 'subdir'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'nfe_xmls', 'subdir', 'senha.xml'), '<xml>senha</xml>');
  fs.writeFileSync(path.join(dataDir, 'nfe_xmls', 'subdir', '352.xml'), '<xml>nfe2</xml>');
  fs.writeFileSync(path.join(dataDir, '.env'), 'SECRET=leak');
  fs.writeFileSync(path.join(dataDir, 'certificado.pfx'), 'pfx-secret');
  fs.mkdirSync(path.join(dataDir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'node_modules', 'ignored.txt'), 'node_modules-leak');
  fs.mkdirSync(path.join(tmpDir, 'frontend', 'dist'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'frontend', 'dist', 'index.html'), 'frontend-build-leak');
}

describe('offsiteBackup', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offsite-backup-'));
    dataDir = path.join(tmpDir, 'data');
    backupsDir = path.join(tmpDir, 'backups');
    writeBackupFixture();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('is disabled by default and when OFFSITE_BACKUP_ENABLED=0', async () => {
    expect(buildOffsiteConfig({}).enabled).toBe(false);
    expect(buildOffsiteConfig({ OFFSITE_BACKUP_ENABLED: '0' }).enabled).toBe(false);

    let uploads = 0;
    const result = await runOffsiteBackup({
      backupFile,
      dataDir,
      backupsDir,
      env: { OFFSITE_BACKUP_ENABLED: '0' },
      upload: () => {
        uploads += 1;
      },
      now: new Date('2026-06-08T05:00:00Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.status.enabled).toBe(false);
    expect(uploads).toBe(0);
  });

  it('creates an encrypted package and uploads it once without leaking plaintext or secrets', async () => {
    const env = makeEnv();
    let uploaded;
    const result = await runOffsiteBackup({
      backupFile,
      dataDir,
      backupsDir,
      env,
      upload: async (payload) => {
        uploaded = payload;
        return { ok: true };
      },
      now: new Date('2026-06-08T05:00:00Z'),
    });

    expect(uploaded).toBeDefined();
    expect(uploaded.key).toBe(result.status.latest.nome);
    expect(uploaded.contentType).toBe('application/octet-stream');
    expect(Buffer.isBuffer(uploaded.body)).toBe(true);
    expect(uploaded.body.toString('utf8')).not.toContain('sqlite-data');
    expect(uploaded.body.toString('utf8')).not.toContain('<xml>nfe</xml>');
    expect(result.status.latest.nome).toMatch(/\.zip\.enc$/);
    expect(result.status.latest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.status.latest.bytes).toBe(uploaded.body.length);
    expect(result.status.enabled).toBe(true);
    expect(result.status.provider).toBe('oracle');
    expect(result.status.bucket).toBe('sistemaarte-offsite');
    expect(result.status.retentionDays).toBe(60);

    const json = JSON.stringify(result);
    expect(json).not.toContain('.env');
    expect(json).not.toContain('SECRET=leak');
    expect(json).not.toContain('pfx');
    expect(json).not.toContain(env.OFFSITE_BACKUP_ENCRYPTION_KEY);
  });

  it('decrypts the package for tests with the original key and proves ZIP scope', async () => {
    const env = makeEnv();
    let body;
    await runOffsiteBackup({
      backupFile,
      dataDir,
      backupsDir,
      env,
      upload: async (payload) => {
        body = payload.body;
      },
      now: new Date('2026-06-08T05:00:00Z'),
    });

    const zipBytes = decryptPackageForTest(body, env.OFFSITE_BACKUP_ENCRYPTION_KEY);
    const text = zipBytes.toString('latin1');

    expect(zipBytes.subarray(0, 2).toString('utf8')).toBe('PK');
    expect(text).toContain('oficina.db');
    expect(text).toContain('nfe_xmls/351.xml');
    expect(text).toContain('nfe_xmls/subdir/352.xml');
    expect(text).toContain('manifest.json');
    expect(text).not.toContain('.env');
    expect(text).not.toContain('.pfx');
    expect(text).not.toContain('segredo.pfx');
    expect(text).not.toContain('node_modules');
    expect(text).not.toContain('frontend');
    expect(text).not.toContain('dist');
    expect(text).not.toContain('SECRET=leak');
    expect(text).not.toContain('NFE_SECRET=leak');
    expect(text).not.toContain('pfx-secret');
    expect(text).not.toContain('nfe-pfx-secret');
    expect(text).not.toContain('node_modules-leak');
    expect(text).not.toContain('frontend-build-leak');
    expect(text).not.toContain('token-backup-leak');
    expect(text).not.toContain('senha.xml');
  });

  it('uses a random AES-GCM IV and rejects tampered encrypted packages', async () => {
    const env = makeEnv();
    const bodies = [];
    const input = {
      backupFile,
      dataDir,
      backupsDir,
      env,
      upload: async (payload) => {
        bodies.push(payload.body);
      },
      now: new Date('2026-06-08T05:00:00Z'),
    };

    await runOffsiteBackup(input);
    await runOffsiteBackup(input);

    expect(bodies).toHaveLength(2);
    expect(Buffer.compare(bodies[0], bodies[1])).not.toBe(0);
    expect(zipText(bodies[0], env.OFFSITE_BACKUP_ENCRYPTION_KEY).slice(0, 2)).toBe('PK');
    expect(zipText(bodies[1], env.OFFSITE_BACKUP_ENCRYPTION_KEY).slice(0, 2)).toBe('PK');

    const tampered = Buffer.from(bodies[0]);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptPackageForTest(tampered, env.OFFSITE_BACKUP_ENCRYPTION_KEY)).toThrow();
  });

  it('returns a sanitized status when upload fails without deleting the local backup', async () => {
    const env = makeEnv();
    const beforeTempDirs = tempOffsiteDirs();
    const result = await runOffsiteBackup({
      backupFile,
      dataDir,
      backupsDir,
      env,
      upload: async () => {
        throw new Error(`Falha SECRET=leak em ${path.join(dataDir, '.env')}`);
      },
      now: new Date('2026-06-08T05:00:00Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.status.enabled).toBe(true);
    expect(result.status.ultimoErro.mensagem).toContain('[segredo ocultado]');
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(tempOffsiteDirs()).toEqual(beforeTempDirs);

    const json = JSON.stringify(result);
    expect(json).not.toContain('SECRET=leak');
    expect(json).not.toContain(dataDir);
    expect(json).not.toContain('.env');
    expect(json).not.toContain(env.OFFSITE_BACKUP_ENCRYPTION_KEY);
  });

  it('fails safely for invalid encryption keys and does not upload', async () => {
    let uploads = 0;
    const result = await runOffsiteBackup({
      backupFile,
      dataDir,
      backupsDir,
      env: makeEnv({ OFFSITE_BACKUP_ENCRYPTION_KEY: Buffer.from('short').toString('base64') }),
      upload: async () => {
        uploads += 1;
      },
      now: new Date('2026-06-08T05:00:00Z'),
    });

    expect(result.ok).toBe(false);
    expect(uploads).toBe(0);
    expect(result.status.ultimoErro.mensagem).toContain('chave de criptografia');
    expect(result.status.ultimoErro.mensagem).toContain('Configuracao invalida');
    expect(JSON.stringify(result)).not.toContain('short');
  });
});
