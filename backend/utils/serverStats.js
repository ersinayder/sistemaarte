'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getDB } = require('../database');
const { readBackupStatus } = require('./backupStatus');
const { getFiscalConfig } = require('./nfeConfig');

const BACKUPS_DIR = path.resolve(__dirname, '..', 'data', 'backups');
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'oficina.db');
const DB_WAL_PATH = path.join(DATA_DIR, 'oficina.db-wal');
const DB_SHM_PATH = path.join(DATA_DIR, 'oficina.db-shm');

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const s = Math.floor(seconds || 0);
  const dias = Math.floor(s / 86400);
  const horas = Math.floor((s % 86400) / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
  if (horas > 0) return `${horas}h ${minutos}m`;
  return `${minutos}m`;
}

function getCpuMetrics() {
  const cpus = os.cpus() || [];
  const model = cpus[0]?.model || 'Desconhecido';
  const cores = cpus.length;

  let load = os.loadavg();
  if (process.platform === 'linux' && fs.existsSync('/proc/loadavg')) {
    try {
      const raw = fs.readFileSync('/proc/loadavg', 'utf-8').trim();
      const parts = raw.split(/\s+/);
      if (parts.length >= 3) {
        load = [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
      }
    } catch (_) {}
  }

  return {
    model,
    cores,
    load1: Number((load[0] || 0).toFixed(2)),
    load5: Number((load[1] || 0).toFixed(2)),
    load15: Number((load[2] || 0).toFixed(2)),
    loadFormatted: `${(load[0] || 0).toFixed(2)}, ${(load[1] || 0).toFixed(2)}, ${(load[2] || 0).toFixed(2)}`,
  };
}

function getRamMetrics() {
  let totalMem = os.totalmem();
  let freeMem = os.freemem();

  if (process.platform === 'linux' && fs.existsSync('/proc/meminfo')) {
    try {
      const content = fs.readFileSync('/proc/meminfo', 'utf-8');
      const lines = content.split('\n');
      const map = {};
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx > -1) {
          const key = line.slice(0, idx).trim();
          const val = parseInt(line.slice(idx + 1).trim(), 10);
          if (!isNaN(val)) map[key] = val; // in kB
        }
      }
      if (map.MemTotal) {
        totalMem = map.MemTotal * 1024;
        const available = map.MemAvailable !== undefined
          ? map.MemAvailable
          : (map.MemFree + (map.Buffers || 0) + (map.Cached || 0));
        freeMem = available * 1024;
      }
    } catch (_) {}
  }

  const usedMem = Math.max(0, totalMem - freeMem);
  const ramPercentUsed = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  return {
    totalBytes: totalMem,
    freeBytes: freeMem,
    usedBytes: usedMem,
    totalFormatted: formatBytes(totalMem),
    freeFormatted: formatBytes(freeMem),
    usedFormatted: formatBytes(usedMem),
    percentUsed: ramPercentUsed,
    alert: ramPercentUsed > 85,
  };
}

function getDiskMetrics() {
  if (process.platform === 'linux') {
    try {
      const targetDir = fs.existsSync('/var/www/sistemaarte') ? '/var/www/sistemaarte' : '/';
      const output = execSync(`df -kP "${targetDir}"`, { encoding: 'utf-8', timeout: 3000 });
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 6) {
          const totalBytes = parseInt(parts[1], 10) * 1024;
          const usedBytes = parseInt(parts[2], 10) * 1024;
          const freeBytes = parseInt(parts[3], 10) * 1024;
          const percentUsed = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
          const percentFree = 100 - percentUsed;

          return {
            drive: parts[5] || targetDir,
            totalBytes,
            freeBytes,
            usedBytes,
            totalFormatted: formatBytes(totalBytes),
            freeFormatted: formatBytes(freeBytes),
            usedFormatted: formatBytes(usedBytes),
            percentUsed,
            percentFree,
            alert: percentFree < 15,
          };
        }
      }
    } catch (_) {}
  }

  try {
    const rootDrive = process.platform === 'win32'
      ? 'C:\\'
      : (fs.existsSync('/var/www/sistemaarte') ? '/var/www/sistemaarte' : '/');
    const s = fs.statfsSync(rootDrive);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const freeBytes = Number(s.bfree) * Number(s.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const percentUsed = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
    const percentFree = 100 - percentUsed;

    return {
      drive: rootDrive,
      totalBytes,
      freeBytes,
      usedBytes,
      totalFormatted: formatBytes(totalBytes),
      freeFormatted: formatBytes(freeBytes),
      usedFormatted: formatBytes(usedBytes),
      percentUsed,
      percentFree,
      alert: percentFree < 15,
    };
  } catch (err) {
    return {
      drive: process.platform === 'win32' ? 'C:\\' : '/',
      totalBytes: 0,
      freeBytes: 0,
      usedBytes: 0,
      totalFormatted: 'Indisponível',
      freeFormatted: 'Indisponível',
      usedFormatted: 'Indisponível',
      percentUsed: 0,
      percentFree: 100,
      alert: false,
      error: err.message,
    };
  }
}

function getSystemMetrics() {
  const ram = getRamMetrics();
  const cpu = getCpuMetrics();
  const procMem = process.memoryUsage();

  return {
    os: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptimeSeconds: os.uptime(),
      uptimeFormatted: formatUptime(os.uptime()),
    },
    cpu,
    ram,
    node: {
      version: process.version,
      pid: process.pid,
      uptimeSeconds: process.uptime(),
      uptimeFormatted: formatUptime(process.uptime()),
      heapUsedBytes: procMem.heapUsed,
      heapUsedFormatted: formatBytes(procMem.heapUsed),
      heapTotalBytes: procMem.heapTotal,
      heapTotalFormatted: formatBytes(procMem.heapTotal),
      rssBytes: procMem.rss,
      rssFormatted: formatBytes(procMem.rss),
    },
    pm2: {
      isPM2: Boolean(process.env.pm_id !== undefined || process.env.PM2_HOME),
      pm_id: process.env.pm_id ?? null,
      name: process.env.name || 'sistemaarte-backend',
      restart_time: Number(process.env.restart_time || 0),
      status: 'online',
    },
    disk: getDiskMetrics(),
  };
}

function getDatabaseMetrics() {
  let dbSize = 0;
  let walSize = 0;
  let shmSize = 0;

  try {
    if (fs.existsSync(DB_PATH)) dbSize = fs.statSync(DB_PATH).size;
    if (fs.existsSync(DB_WAL_PATH)) walSize = fs.statSync(DB_WAL_PATH).size;
    if (fs.existsSync(DB_SHM_PATH)) shmSize = fs.statSync(DB_SHM_PATH).size;
  } catch (_) {}

  let integridade = 'OK';
  let totalOrdens = 0;
  let totalClientes = 0;
  let totalLancamentos = 0;

  try {
    const db = getDB();
    if (db) {
      const check = db.prepare('PRAGMA integrity_check(1)').get();
      integridade = check ? Object.values(check)[0] : 'Desconhecido';

      totalOrdens = db.prepare('SELECT COUNT(*) AS total FROM ordens WHERE deletedat IS NULL').get()?.total ?? 0;
      totalClientes = db.prepare('SELECT COUNT(*) AS total FROM clientes WHERE deletedat IS NULL').get()?.total ?? 0;
      totalLancamentos = db.prepare('SELECT COUNT(*) AS total FROM lancamentos WHERE deletedat IS NULL').get()?.total ?? 0;
    }
  } catch (err) {
    integridade = `Erro: ${err.message}`;
  }

  return {
    tamanhoDbBytes: dbSize,
    tamanhoDbFormatted: formatBytes(dbSize),
    tamanhoWalBytes: walSize,
    tamanhoWalFormatted: formatBytes(walSize),
    tamanhoShmBytes: shmSize,
    tamanhoShmFormatted: formatBytes(shmSize),
    tamanhoTotalBytes: dbSize + walSize + shmSize,
    tamanhoTotalFormatted: formatBytes(dbSize + walSize + shmSize),
    integridade,
    integridadeOk: integridade === 'ok' || integridade === 'OK',
    contagens: {
      ordens: totalOrdens,
      clientes: totalClientes,
      lancamentos: totalLancamentos,
    },
  };
}

function getBackupsSummary() {
  try {
    const status = readBackupStatus(BACKUPS_DIR);
    return {
      ok: true,
      ultimoBackup: status.ultimoBackup || null,
      arquivosLocais: (status.arquivosLocais || []).slice(0, 7),
      offsite: status.offsite || { configurado: false },
      alertas: status.alertas || [],
      alertaCritico: (status.alertas || []).some(a => a.nivel === 'critico'),
    };
  } catch (err) {
    return {
      ok: false,
      ultimoBackup: null,
      arquivosLocais: [],
      offsite: { configurado: false },
      alertas: [{ nivel: 'critico', mensagem: `Erro ao ler status de backup: ${err.message}` }],
      alertaCritico: true,
    };
  }
}

function getFiscalSummary() {
  try {
    const config = getFiscalConfig();
    return {
      ambiente: config.ambiente === 1 ? 'Produção' : 'Homologação',
      ambienteNum: config.ambiente,
      serie: config.serie,
      proximoNumero: config.proximoNumero,
      certificadoConfigurado: Boolean(config.certificado?.configurado),
      certificadoNome: config.certificado?.nome || '',
      certificadoUpdatedat: config.certificado?.updatedat || null,
    };
  } catch (err) {
    return {
      ambiente: 'Desconhecido',
      ambienteNum: 2,
      serie: '1',
      proximoNumero: null,
      certificadoConfigurado: false,
      certificadoNome: '',
      certificadoUpdatedat: null,
      error: err.message,
    };
  }
}

function resolveLogFilePath(tipo = 'error') {
  const filename = tipo === 'out'
    ? 'sistemaarte-backend-out.log'
    : 'sistemaarte-backend-error.log';

  const possiblePaths = [
    path.join('/var', 'log', 'sistemaarte', filename),
    path.join('/var', 'log', 'sistemaarte'),
    path.join(os.homedir(), '.pm2', 'logs', filename),
    path.join('/root', '.pm2', 'logs', filename),
    path.join('/var', 'www', 'sistemaarte', filename),
    path.resolve(__dirname, '..', '..', '.pm2', 'logs', filename),
    path.resolve(__dirname, '..', filename),
    path.join('C:', 'Users', 'Administrator', '.pm2', 'logs', filename),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) return p;
    } catch (_) {
      if (fs.existsSync(p)) return p;
    }
  }

  return possiblePaths[0]; // default path for reference
}

function tailFile(filePath, maxLines = 150) {
  if (!fs.existsSync(filePath)) {
    return {
      lines: [
        `[INFO] Arquivo de log não encontrado em: ${filePath}`,
        '[INFO] Logs são gravados automaticamente quando o serviço roda sob o PM2.'
      ],
      tamanhoBytes: 0,
      tamanhoFormatted: '0 B',
      arquivo: filePath,
      existe: false,
    };
  }

  try {
    const stat = fs.statSync(filePath);
    const maxBytes = 512 * 1024; // lê no máximo os últimos 512 KB
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;

    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, length, start);
    fs.closeSync(fd);

    const content = buffer.toString('utf-8');
    const allLines = content.split(/\r?\n/).filter(line => line.length > 0);
    const lines = allLines.slice(-maxLines);

    return {
      lines,
      tamanhoBytes: stat.size,
      tamanhoFormatted: formatBytes(stat.size),
      arquivo: filePath,
      existe: true,
      mtime: stat.mtime.toISOString(),
    };
  } catch (err) {
    return {
      lines: [`[ERRO] Falha ao ler log: ${err.message}`],
      tamanhoBytes: 0,
      tamanhoFormatted: '0 B',
      arquivo: filePath,
      existe: true,
      error: err.message,
    };
  }
}

function triggerBackendRestart() {
  const candidates = [
    '/var/www/sistemaarte/backend/.deploy-trigger',
    path.resolve(__dirname, '..', '.deploy-trigger'),
    path.resolve('C:\\sistemaarte\\backend\\.deploy-trigger'),
  ];

  const now = new Date().toISOString();
  let written = 0;

  for (const p of candidates) {
    try {
      fs.writeFileSync(p, `restart_requested_at=${now}\n`, 'utf-8');
      written += 1;
    } catch (_) {}
  }

  return {
    ok: true,
    message: 'Gatilho de reinício acionado com sucesso. O backend será reiniciado em instantes.',
    timestamp: now,
    sentinelasGravadas: written,
  };
}

module.exports = {
  formatBytes,
  formatUptime,
  getCpuMetrics,
  getRamMetrics,
  getDiskMetrics,
  getSystemMetrics,
  getDatabaseMetrics,
  getBackupsSummary,
  getFiscalSummary,
  resolveLogFilePath,
  tailFile,
  triggerBackendRestart,
};
