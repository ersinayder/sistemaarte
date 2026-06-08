import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  BACKUP_STATUS_FILE,
  backupStatusPath,
  buildBackupStatus,
  readBackupStatus,
  sanitizeMessage,
  writeBackupStatus,
} = await import('../utils/backupStatus.js');

let tmpDir;

function touchBackup(nome, mtime) {
  const file = path.join(tmpDir, nome);
  fs.writeFileSync(file, 'backup');
  fs.utimesSync(file, mtime, mtime);
  return file;
}

function expectUniqueMissing(status) {
  expect(status.status.missing).toEqual([...new Set(status.status.missing)]);
}

describe('backupStatus', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-status-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports pending when no local backups exist', () => {
    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });

    expect(status.status.status).toBe('Pendente');
    expect(status.status.missing).toContain('backup-local');
    expect(status.alertas).toContainEqual({
      nivel: 'critico',
      codigo: 'backup-local',
      mensagem: 'Nenhum backup local encontrado.',
    });
    expect(status.alertas).toContainEqual({
      nivel: 'atencao',
      codigo: 'destino-offsite',
      mensagem: 'Backup offsite ainda nao configurado.',
    });
    expect(status.local.total).toBe(0);
    expect(status.local.ultimo).toBeNull();
  });

  it('does not expose absolute filesystem paths in API status snapshots', () => {
    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });
    const body = JSON.stringify(status);

    expect(status.local).not.toHaveProperty('diretorio');
    expect(body).not.toMatch(/[A-Za-z]:\\/);
    expect(body).not.toContain(tmpDir);
  });

  it('keeps overall status pending while offsite backup is not configured', () => {
    touchBackup('backup-2026-05-17T10-00-00.db', new Date('2026-05-17T10:00:00-03:00'));
    touchBackup('backup-2026-05-18T14-00-00.db', new Date('2026-05-18T14:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });

    expect(status.status.status).toBe('Pendente');
    expect(status.status.missing).toContain('destino-offsite');
    expect(status.local.total).toBe(2);
    expect(status.local.ultimo.nome).toBe('backup-2026-05-18T14-00-00.db');
    expect(status.local.arquivos[0].nome).toBe('backup-2026-05-18T14-00-00.db');
  });

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

  it('sanitizes common credential and path leak formats', () => {
    const dirty = [
      'Authorization: Bearer eyJhbGciOiJsecret',
      'Authorization: Basic dXNlcjpwYXNz',
      'token: "abc123"',
      '"password":"super-secret"',
      'https://user:pass@example.com/backups?token=qwerty&secret=hidden&ok=1',
      'C:\\sistemaarte\\.env',
      '\\\\ARTESERVER\\share\\backup.zip',
      '/var/backups/sistemaarte/.env',
    ].join(' ');

    const clean = sanitizeMessage(dirty);

    expect(clean).not.toContain('eyJhbGciOiJsecret');
    expect(clean).not.toContain('dXNlcjpwYXNz');
    expect(clean).not.toContain('abc123');
    expect(clean).not.toContain('super-secret');
    expect(clean).not.toContain('user:pass@');
    expect(clean).not.toContain('token=qwerty');
    expect(clean).not.toContain('secret=hidden');
    expect(clean).not.toContain('C:\\sistemaarte');
    expect(clean).not.toContain('\\\\ARTESERVER\\share');
    expect(clean).not.toContain('/var/backups/sistemaarte');
  });

  it('sanitizes sensitive data from persisted status snapshots', () => {
    const persisted = {
      status: {
        status: 'Pendente',
        missing: ['backup-offsite-falhou'],
      },
      local: {
        diretorio: 'C:\\sistemaarte\\backend\\data\\backups',
      },
      ultimoErro: {
        mensagem: 'Authorization: Bearer top-secret-token em /var/backups/sistemaarte/.env',
      },
      offsite: {
        status: 'Falhou',
        ultimoErro: {
          mensagem: 'Falha em https://user:pass@example.com?secret=hidden no \\\\ARTESERVER\\share',
        },
      },
    };
    fs.writeFileSync(backupStatusPath(tmpDir), JSON.stringify(persisted, null, 2));

    const loaded = readBackupStatus(tmpDir);
    const body = JSON.stringify(loaded);

    expect(loaded.local).not.toHaveProperty('diretorio');
    expect(body).not.toContain('top-secret-token');
    expect(body).not.toContain('/var/backups/sistemaarte');
    expect(body).not.toContain('user:pass@');
    expect(body).not.toContain('secret=hidden');
    expect(body).not.toContain('\\\\ARTESERVER\\share');
  });

  it('keeps only local stale missing when local is late and offsite is OK', () => {
    touchBackup('backup-2026-06-08T02-00-00.db', new Date('2026-06-08T02:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-06-10T10:00:00-03:00'),
      offsite: {
        enabled: true,
        provider: 'oracle',
        bucket: 'sistemaarte-backups',
        retentionDays: 60,
        latest: {
          nome: 'sistemaarte-2026-06-10T09-00-00.zip.enc',
          bytes: 1024,
          sha256: 'c'.repeat(64),
          uploadedat: new Date('2026-06-10T09:00:00-03:00').toISOString(),
        },
      },
    });

    expect(status.status.missing).toEqual(['backup-recente']);
    expect(status.offsite.status).toBe('OK');
    expectUniqueMissing(status);
  });

  it('keeps only offsite failure missing when local is OK and offsite failed', () => {
    touchBackup('backup-2026-06-08T02-00-00.db', new Date('2026-06-08T02:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-06-08T10:00:00-03:00'),
      offsite: {
        enabled: true,
        provider: 'oracle',
        bucket: 'sistemaarte-backups',
        retentionDays: 60,
        ultimoErro: {
          mensagem: 'Falha com token: "abc123"',
          createdat: new Date('2026-06-08T02:05:00-03:00').toISOString(),
        },
      },
    });

    expect(status.status.missing).toEqual(['backup-offsite-falhou']);
    expect(status.offsite.status).toBe('Falhou');
    expectUniqueMissing(status);
  });

  it('reports stale when the last backup is older than 30 hours', () => {
    touchBackup('backup-2026-05-16T08-00-00.db', new Date('2026-05-16T08:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });

    expect(status.status.status).toBe('Pendente');
    expect(status.status.missing).toContain('backup-recente');
    expect(status.local.horasDesdeUltimo).toBeGreaterThan(30);
  });

  it('marks retention warning when there are more than seven backup files', () => {
    for (let i = 1; i <= 8; i += 1) {
      touchBackup(`backup-2026-05-${String(i).padStart(2, '0')}T02-00-00.db`, new Date(`2026-05-${String(i).padStart(2, '0')}T02:00:00-03:00`));
    }

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-08T10:00:00-03:00'),
    });

    expect(status.local.total).toBe(8);
    expect(status.status.status).toBe('Pendente');
    expect(status.status.missing).toContain('retencao-local');
    expect(status.alertas).toContainEqual({
      nivel: 'atencao',
      codigo: 'retencao-local',
      mensagem: 'Ha mais backups locais que o limite de retencao esperado.',
    });
  });

  it('writes and reads backup-status.json beside local backup files', () => {
    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });

    const file = writeBackupStatus(tmpDir, status);
    const loaded = readBackupStatus(tmpDir);

    expect(path.basename(file)).toBe(BACKUP_STATUS_FILE);
    expect(file).toBe(backupStatusPath(tmpDir));
    expect(fs.existsSync(file)).toBe(true);
    expect(loaded).toEqual(status);
  });

  it('reads a live status snapshot when backup-status.json does not exist yet', () => {
    touchBackup('backup-2026-05-18T14-00-00.db', new Date('2026-05-18T14:00:00-03:00'));

    const loaded = readBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });

    expect(loaded.status.status).toBe('Pendente');
    expect(loaded.status.missing).toContain('destino-offsite');
    expect(loaded.local.ultimo.nome).toBe('backup-2026-05-18T14-00-00.db');
    expect(fs.existsSync(backupStatusPath(tmpDir))).toBe(false);
  });
});
