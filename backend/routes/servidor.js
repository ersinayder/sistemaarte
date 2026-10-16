'use strict';

const router = require('express').Router();
const { auth, authPermission } = require('../middlewares/auth');
const {
  getSystemMetrics,
  getDatabaseMetrics,
  getBackupsSummary,
  getFiscalSummary,
  resolveLogFilePath,
  tailFile,
  triggerBackendRestart,
} = require('../utils/serverStats');

// Permissão para visualizar métricas, logs e operações do servidor
const guardServidor = authPermission(['servidor.ver', 'configuracoes.ver']);

// GET /api/servidor/status
router.get('/status', auth(), guardServidor, (req, res, next) => {
  try {
    const system = getSystemMetrics();
    const database = getDatabaseMetrics();
    const backups = getBackupsSummary();
    const fiscal = getFiscalSummary();

    const alertas = [];

    // Alerta de disco
    if (system.disk.alert) {
      alertas.push({
        id: 'disco-baixo',
        nivel: 'critico',
        titulo: 'Espaço em disco crítico',
        mensagem: `O disco ${system.disk.drive} possui apenas ${system.disk.percentFree}% livre (${system.disk.freeFormatted}).`,
      });
    }

    // Alerta de RAM
    if (system.ram.alert) {
      alertas.push({
        id: 'ram-alta',
        nivel: 'atencao',
        titulo: 'Uso elevado de memória RAM',
        mensagem: `O servidor está utilizando ${system.ram.percentUsed}% da memória RAM total.`,
      });
    }

    // Alerta de integridade do banco
    if (!database.integridadeOk) {
      alertas.push({
        id: 'db-integridade',
        nivel: 'critico',
        titulo: 'Atenção na integridade do banco',
        mensagem: `O SQLite reportou status: ${database.integridade}`,
      });
    }

    // Alertas de backup
    if (backups.alertaCritico) {
      for (const al of backups.alertas) {
        if (al.nivel === 'critico') {
          alertas.push({
            id: `backup-${al.codigo || 'erro'}`,
            nivel: 'critico',
            titulo: 'Falha no backup local',
            mensagem: al.mensagem,
          });
        }
      }
    }

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      system,
      database,
      backups,
      fiscal,
      alertas,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/servidor/logs
router.get('/logs', auth(), guardServidor, (req, res, next) => {
  try {
    const tipo = req.query.tipo === 'out' ? 'out' : 'error';
    const linesCount = Math.min(Math.max(10, parseInt(req.query.lines, 10) || 150), 300);
    const filterQuery = (req.query.q || '').trim().toLowerCase();

    const filePath = resolveLogFilePath(tipo);
    const result = tailFile(filePath, linesCount);

    let filteredLines = result.lines;
    if (filterQuery) {
      filteredLines = result.lines.filter(line => line.toLowerCase().includes(filterQuery));
    }

    res.json({
      ok: true,
      tipo,
      linhasSolicitadas: linesCount,
      totalLinhasRetornadas: filteredLines.length,
      linhas: filteredLines,
      arquivo: result.arquivo,
      existe: result.existe,
      tamanhoFormatted: result.tamanhoFormatted,
      mtime: result.mtime || null,
      filtro: filterQuery || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/servidor/restart
router.post('/restart', auth(), guardServidor, (req, res, next) => {
  try {
    const result = triggerBackendRestart();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
