import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  BACKUP_STATUS_FILE,
  backupStatusPath,
  buildBackupStatus,
  readBackupStatus,
  writeBackupStatus,
} = await import('../utils/backupStatus.js');

let tmpDir;

function touchBackup(nome, mtime) {
  const file = path.join(tmpDir, nome);
  fs.writeFileSync(file, 'backup');
  fs.utimesSync(file, mtime, mtime);
  return file;
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

  it('reports OK for a fresh local backup and keeps newest file first', () => {
    touchBackup('backup-2026-05-17T10-00-00.db', new Date('2026-05-17T10:00:00-03:00'));
    touchBackup('backup-2026-05-18T14-00-00.db', new Date('2026-05-18T14:00:00-03:00'));

    const status = buildBackupStatus(tmpDir, {
      now: new Date('2026-05-18T15:00:00-03:00'),
    });

    expect(status.status.status).toBe('OK');
    expect(status.local.total).toBe(2);
    expect(status.local.ultimo.nome).toBe('backup-2026-05-18T14-00-00.db');
    expect(status.local.arquivos[0].nome).toBe('backup-2026-05-18T14-00-00.db');
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

    expect(loaded.status.status).toBe('OK');
    expect(loaded.local.ultimo.nome).toBe('backup-2026-05-18T14-00-00.db');
    expect(fs.existsSync(backupStatusPath(tmpDir))).toBe(false);
  });
});
