const fs = require("fs");
const path = require("path");

const BACKUP_STATUS_FILE = "backup-status.json";

function fileInfo(dir, name) {
  const full = path.join(dir, name);
  const stat = fs.statSync(full);
  return {
    nome: name,
    bytes: stat.size,
    updatedat: stat.mtime.toISOString(),
    mtimeMs: stat.mtimeMs,
  };
}

function backupStatusPath(backupsDir) {
  return path.join(backupsDir, BACKUP_STATUS_FILE);
}

function buildBackupStatus(backupsDir, { now = new Date() } = {}) {
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

  return {
    status: {
      status: missing.length ? "Pendente" : "OK",
      missing,
    },
    local: {
      diretorio: backupsDir,
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
    offsite: {
      status: "Pendente",
      missing: ["destino-offsite"],
    },
  };
}

function writeBackupStatus(backupsDir, status) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const file = backupStatusPath(backupsDir);
  fs.writeFileSync(file, JSON.stringify(status, null, 2));
  return file;
}

function readBackupStatus(backupsDir, options = {}) {
  const file = backupStatusPath(backupsDir);
  if (!fs.existsSync(file)) return buildBackupStatus(backupsDir, options);

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return buildBackupStatus(backupsDir, options);
  }
}

module.exports = {
  BACKUP_STATUS_FILE,
  backupStatusPath,
  buildBackupStatus,
  readBackupStatus,
  writeBackupStatus,
};
