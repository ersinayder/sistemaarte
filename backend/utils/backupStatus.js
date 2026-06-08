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
  "backup-falhou": {
    nivel: "critico",
    codigo: "backup-falhou",
    mensagem: "Ultima tentativa de backup local falhou.",
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

function buildAlertas(codigos = []) {
  return codigos
    .map((codigo) => ALERTAS_BACKUP[codigo])
    .filter(Boolean);
}

function sanitizeMessage(message = "") {
  return String(message)
    .replace(/\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[^\s"',;)]+/gi, "[segredo ocultado]")
    .replace(/(https?:\/\/)[^\/\s:@]+:[^\/\s@]+@/gi, "$1[credenciais ocultadas]@")
    .replace(/[?&][^=&\s]*(?:token|secret|password|senha|key)[^=&\s]*=[^&#\s"',;)]+/gi, "?[segredo ocultado]")
    .replace(/["']?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|SENHA|KEY)[A-Z0-9_]*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s;,)]+)/gi, "[segredo ocultado]")
    .replace(/\\\\[^\s"'<>|\\]+\\[^\s"'<>|\\]+(?:\\[^\s"'<>|\\]+)*/g, "[caminho ocultado]")
    .replace(/[A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]*/g, "[caminho ocultado]")
    .replace(/(^|[\s"'(])\/(?:[^\s"'<>|/]+\/)+[^\s"'<>|]*/g, "$1[caminho ocultado]");
}

function cleanFileName(name) {
  return name ? path.basename(String(name)) : name;
}

function buildOffsiteStatus(offsite = {}, { now = new Date() } = {}) {
  if (!offsite.enabled) {
    return {
      status: "Pendente",
      missing: ["destino-offsite"],
    };
  }

  const latest = offsite.latest || null;
  const ultimo = latest ? {
    nome: cleanFileName(latest.nome),
    bytes: latest.bytes,
    sha256: latest.sha256,
    uploadedat: latest.uploadedat,
  } : null;

  const uploadedAtMs = ultimo?.uploadedat ? new Date(ultimo.uploadedat).getTime() : NaN;
  const horasDesdeUltimo = Number.isFinite(uploadedAtMs)
    ? Math.round(((now.getTime() - uploadedAtMs) / 36e5) * 10) / 10
    : null;

  const base = {
    status: "OK",
    missing: [],
    provider: offsite.provider || null,
    bucket: offsite.bucket || null,
    retencaoDias: offsite.retentionDays ?? null,
    ultimo,
    horasDesdeUltimo,
  };

  if (offsite.ultimoErro) {
    return {
      ...base,
      status: "Falhou",
      missing: ["backup-offsite-falhou"],
      ultimoErro: {
        mensagem: sanitizeMessage(offsite.ultimoErro.mensagem),
        createdat: offsite.ultimoErro.createdat,
      },
    };
  }

  if (!ultimo || horasDesdeUltimo === null || horasDesdeUltimo > 30) {
    return {
      ...base,
      status: "Atrasado",
      missing: ["backup-offsite-recente"],
    };
  }

  return base;
}

function buildBackupStatus(backupsDir, { now = new Date(), offsite } = {}) {
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

  const offsiteStatus = buildOffsiteStatus(offsite, { now });
  const offsiteMissing = offsiteStatus.missing;
  const statusMissing = [...missing, ...offsiteMissing];

  return {
    status: {
      status: statusMissing.length ? "Pendente" : "OK",
      missing: statusMissing,
    },
    alertas: buildAlertas([...missing, ...offsiteMissing]),
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
    offsite: {
      ...offsiteStatus,
    },
  };
}

function writeBackupStatus(backupsDir, status) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const file = backupStatusPath(backupsDir);
  fs.writeFileSync(file, JSON.stringify(status, null, 2));
  return file;
}

function sanitizeStatusSnapshot(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeStatusSnapshot(item));
  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "diretorio") continue;
      sanitized[key] = sanitizeStatusSnapshot(item);
    }
    return sanitized;
  }
  if (typeof value === "string") return sanitizeMessage(value);
  return value;
}

function offsiteSnapshotToBuildInput(offsite) {
  if (!offsite || typeof offsite !== "object") return undefined;

  const missing = Array.isArray(offsite.missing) ? offsite.missing : [];
  const disabled = missing.includes("destino-offsite")
    || (!offsite.provider && !offsite.bucket && !offsite.ultimo && !offsite.latest && !offsite.ultimoErro);

  return {
    enabled: !disabled,
    provider: offsite.provider || null,
    bucket: offsite.bucket || null,
    retentionDays: offsite.retencaoDias ?? offsite.retentionDays ?? null,
    latest: offsite.latest || offsite.ultimo || null,
    ultimoErro: offsite.ultimoErro || null,
  };
}

function preservePersistedLocalFailure(rebuilt, snapshot) {
  const missing = Array.isArray(snapshot?.status?.missing) ? snapshot.status.missing : [];
  if (!missing.includes("backup-falhou")) return rebuilt;

  const statusMissing = Array.from(new Set([...(rebuilt.status.missing || []), "backup-falhou"]));
  const status = {
    ...rebuilt,
    status: {
      ...rebuilt.status,
      status: "Pendente",
      missing: statusMissing,
    },
    alertas: buildAlertas(statusMissing),
  };

  if (snapshot.ultimoErro) {
    status.ultimoErro = snapshot.ultimoErro;
  }

  return status;
}

function readBackupStatus(backupsDir, options = {}) {
  const file = backupStatusPath(backupsDir);
  if (!fs.existsSync(file)) return buildBackupStatus(backupsDir, options);

  try {
    const status = sanitizeStatusSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
    const rebuilt = buildBackupStatus(backupsDir, {
      ...options,
      offsite: offsiteSnapshotToBuildInput(status.offsite),
    });
    return preservePersistedLocalFailure(rebuilt, status);
  } catch {
    return buildBackupStatus(backupsDir, options);
  }
}

module.exports = {
  BACKUP_STATUS_FILE,
  buildAlertas,
  buildOffsiteStatus,
  backupStatusPath,
  buildBackupStatus,
  readBackupStatus,
  sanitizeMessage,
  writeBackupStatus,
};
