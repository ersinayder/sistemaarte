'use strict';

const express = require('express');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { getDB, getOne } = require('../database');
const { auth } = require('../middlewares/auth');
const { isAgenteOnline, avaliarLeaseTimeout } = require('../domain/printQueueRules');

const router = express.Router();
const printAgentEvents = new EventEmitter();
printAgentEvents.setMaxListeners(50);

function notificarNovoJob(job) {
  if (!job) return;
  printAgentEvents.emit('job', job);
}

function atualizarAgentLastSeen(dbInstance = getDB()) {
  try {
    const res = dbInstance.prepare("UPDATE impressao_config SET agent_last_seen = datetime('now', 'localtime') WHERE id = 1").run();
    if (res.changes === 0) {
      dbInstance.prepare("INSERT INTO impressao_config (id, agent_mode, agent_last_seen) VALUES (1, 1, datetime('now', 'localtime'))").run();
    }
  } catch (err) {
    // Ignora erro caso a tabela esteja sendo inicializada
  }
}

function verificarTokenAgente(req) {
  const expectedToken = process.env.PRINT_AGENT_TOKEN;
  if (!expectedToken || typeof expectedToken !== 'string' || expectedToken.trim() === '') {
    return false;
  }

  let providedToken = req.headers['x-print-agent-token'];
  if (!providedToken && req.headers['authorization']) {
    const authHeader = String(req.headers['authorization']).trim();
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      providedToken = match[1].trim();
    }
  }

  if (!providedToken || typeof providedToken !== 'string') {
    return false;
  }

  const hashProvided = crypto.createHash('sha256').update(Buffer.from(providedToken, 'utf8')).digest();
  const hashExpected = crypto.createHash('sha256').update(Buffer.from(expectedToken, 'utf8')).digest();

  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

function autenticarAgente(req, res, next) {
  const expectedToken = process.env.PRINT_AGENT_TOKEN;
  if (!expectedToken || typeof expectedToken !== 'string' || expectedToken.trim() === '') {
    return res.status(401).json({ error: 'Token de agente de impressão não configurado no servidor.' });
  }

  let providedToken = req.headers['x-print-agent-token'];
  if (!providedToken && req.headers['authorization']) {
    const authHeader = String(req.headers['authorization']).trim();
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      providedToken = match[1].trim();
    }
  }

  if (!providedToken || typeof providedToken !== 'string') {
    return res.status(401).json({ error: 'Token de agente de impressão ausente ou inválido.' });
  }

  const hashProvided = crypto.createHash('sha256').update(Buffer.from(providedToken, 'utf8')).digest();
  const hashExpected = crypto.createHash('sha256').update(Buffer.from(expectedToken, 'utf8')).digest();

  if (!crypto.timingSafeEqual(hashProvided, hashExpected)) {
    return res.status(401).json({ error: 'Token de agente de impressão inválido.' });
  }

  next();
}

function autenticarAgenteOuUsuario(req, res, next) {
  if (verificarTokenAgente(req)) {
    req.isAgent = true;
    return next();
  }
  return auth()(req, res, next);
}

// ── GET /stream (SSE) ──────────────────────────────────────────────────────────
router.get('/stream', autenticarAgente, (req, res) => {
  const db = getDB();
  atualizarAgentLastSeen(db);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': connected\n\n');

  let closed = false;
  const keepAliveTimer = setInterval(() => {
    if (closed) return;
    try {
      atualizarAgentLastSeen(getDB());
      res.write(': ping\n\n');
    } catch {
      // Conexão encerrada pelo cliente
    }
  }, 20000);

  const onJob = (job) => {
    if (closed) return;
    try {
      const payload = JSON.stringify({
        id: job.id,
        tipo: job.tipo,
        documento_nome: job.documento_nome ?? job.documentoNome,
      });
      res.write(`event: job\ndata: ${payload}\n\n`);
    } catch {
      // Conexão encerrada pelo cliente
    }
  };

  printAgentEvents.on('job', onJob);

  req.on('close', () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAliveTimer);
    printAgentEvents.removeListener('job', onJob);
  });
});

// ── GET /tarefas ───────────────────────────────────────────────────────────────
router.get('/tarefas', autenticarAgente, (req, res, next) => {
  try {
    const db = getDB();
    atualizarAgentLastSeen(db);

    const processarFila = db.transaction(() => {
      // 1. Lease timeout em tarefas 'processando' antigas (> 120s)
      const processandoJobs = db.prepare("SELECT * FROM print_queue WHERE status = 'processando'").all();
      for (const pj of processandoJobs) {
        const timeoutResult = avaliarLeaseTimeout(pj);
        if (timeoutResult) {
          if (timeoutResult.status === 'pendente') {
            db.prepare("UPDATE print_queue SET status = 'pendente', updatedat = datetime('now', 'localtime') WHERE id = ?").run(pj.id);
          } else if (timeoutResult.status === 'falha') {
            db.prepare("UPDATE print_queue SET status = 'falha', erro = ?, updatedat = datetime('now', 'localtime') WHERE id = ?").run(
              timeoutResult.erro || 'Timeout de execução',
              pj.id
            );
          }
        }
      }

      // 2. Busca próximo job pendente (FIFO)
      const proximo = db.prepare("SELECT * FROM print_queue WHERE status = 'pendente' ORDER BY id ASC LIMIT 1").get();
      if (!proximo) {
        return null;
      }

      // 3. Marca como processando e incrementa tentativas
      db.prepare(`
        UPDATE print_queue
        SET status = 'processando',
            tentativas = tentativas + 1,
            updatedat = datetime('now', 'localtime')
        WHERE id = ?
      `).run(proximo.id);

      return db.prepare("SELECT * FROM print_queue WHERE id = ?").get(proximo.id);
    });

    const tarefa = processarFila();
    res.json({ tarefa: tarefa || null });
  } catch (error) {
    next(error);
  }
});

// ── POST /tarefas/:id/concluir ────────────────────────────────────────────────
router.post('/tarefas/:id/concluir', autenticarAgente, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de tarefa inválido.' });
    }

    if (typeof req.body?.ok !== 'boolean') {
      return res.status(400).json({ error: "Campo 'ok' booleano é obrigatório." });
    }

    const db = getDB();
    atualizarAgentLastSeen(db);

    const job = db.prepare('SELECT id, status FROM print_queue WHERE id = ?').get(id);
    if (!job) {
      return res.status(404).json({ error: 'Tarefa de impressão não encontrada.' });
    }

    if (req.body.ok) {
      db.prepare(`
        UPDATE print_queue
        SET status = 'concluido',
            printedat = datetime('now', 'localtime'),
            updatedat = datetime('now', 'localtime')
        WHERE id = ?
      `).run(id);
    } else {
      const erro = String(req.body.error || req.body.erro || 'Falha na impressao').trim();
      db.prepare(`
        UPDATE print_queue
        SET status = 'falha',
            erro = ?,
            updatedat = datetime('now', 'localtime')
        WHERE id = ?
      `).run(erro, id);
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ── POST /ping ────────────────────────────────────────────────────────────────
router.post('/ping', autenticarAgente, (req, res, next) => {
  try {
    const db = getDB();
    atualizarAgentLastSeen(db);
    const row = db.prepare('SELECT agent_last_seen FROM impressao_config WHERE id = 1').get();
    res.json({
      ok: true,
      agentLastSeen: row?.agent_last_seen || null,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /status ───────────────────────────────────────────────────────────────
router.get('/status', autenticarAgenteOuUsuario, (req, res, next) => {
  try {
    const db = getDB();
    const configRow = db.prepare('SELECT * FROM impressao_config WHERE id = 1').get() || {};
    const online = isAgenteOnline(configRow);

    const pendentes = db.prepare("SELECT COUNT(*) AS total FROM print_queue WHERE status = 'pendente'").get()?.total ?? 0;
    const processando = db.prepare("SELECT COUNT(*) AS total FROM print_queue WHERE status = 'processando'").get()?.total ?? 0;
    const concluidos = db.prepare("SELECT COUNT(*) AS total FROM print_queue WHERE status = 'concluido'").get()?.total ?? 0;
    const falhas = db.prepare("SELECT COUNT(*) AS total FROM print_queue WHERE status = 'falha'").get()?.total ?? 0;

    res.json({
      ok: true,
      online,
      agentMode: configRow.agent_mode ?? 1,
      agentLastSeen: configRow.agent_last_seen ?? null,
      fila: {
        pendentes,
        processando,
        concluidos,
        falhas,
        total: pendentes + processando + concluidos + falhas,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.notificarNovoJob = notificarNovoJob;
router.printAgentEvents = printAgentEvents;

module.exports = router;
module.exports.notificarNovoJob = notificarNovoJob;
module.exports.printAgentEvents = printAgentEvents;
