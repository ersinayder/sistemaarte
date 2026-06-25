const router = require("express").Router();
const { getAll, getOne, getDB } = require("../database");
const { auth } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { criarSseConnectionTracker } = require("../domain/sseConnectionRules");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { listarPendenciasFiscais } = require("../repositories/nfePendenciaRepository");
const { auditarIntegridadeFinanceiraOS } = require("../services/financeiroIntegridadeService");
const { getContasReceberPayload } = require("../services/financeiroReceberService");
const { auditarIntegridadeFiscalFinanceiraNFe } = require("../services/nfeIntegridadeFinanceiraService");
const { montarResumoIntegridade } = require("../services/integridadeResumoService");

function calcKpis() {
  const hj = hoje();

  const abertas = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status NOT IN ('Entregue','Cancelado') AND deletedat IS NULL`
  )?.n ?? 0;

  const emProducao = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status = 'Em Produção' AND deletedat IS NULL`
  )?.n ?? 0;

  const prontas = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status = 'Pronto' AND deletedat IS NULL`
  )?.n ?? 0;

  const aguardando = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status = 'Aguardando' AND deletedat IS NULL`
  )?.n ?? 0;

  const vencidas = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status NOT IN ('Pronto','Entregue','Cancelado')
       AND prazoentrega IS NOT NULL AND prazoentrega < ?
       AND deletedat IS NULL`,
    [hj]
  )?.n ?? 0;

  const entreguesHoje = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status = 'Entregue'
       AND date(updatedat) = ?
       AND deletedat IS NULL`,
    [hj]
  )?.n ?? 0;

  const abertasHoje = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE date(createdat) = ? AND deletedat IS NULL`,
    [hj]
  )?.n ?? 0;

  return {
    abertas,
    emProducao,
    prontas,
    aguardando,
    vencidas,
    entreguesHoje,
    abertasHoje,
    ts: Date.now(),
  };
}

router.get("/", auth(["admin","caixa"]), (_req, res, next) => {
  try {
    res.json(calcKpis());
  } catch (e) {
    next(e);
  }
});

router.get("/integridade", auth(["admin"]), (_req, res, next) => {
  try {
    const ordens = getAll(
      "SELECT id, numero, clientenome, status, valortotal FROM ordens WHERE deletedat IS NULL ORDER BY id DESC"
    );
    const db = getDB();
    const notas = db.prepare(`
      SELECT id, numero, clientenome, status, valortotal, nfe_status, nfe_chave, nfe_xml
      FROM ordens
      WHERE deletedat IS NULL AND nfe_status IS NOT NULL AND nfe_deletedat IS NULL
      ORDER BY nfe_emitida_em DESC, id DESC
    `).all();

    res.json(montarResumoIntegridade({
      pendenciasFiscais: listarPendenciasFiscais(db),
      integridadeFinanceira: auditarIntegridadeFinanceiraOS({
        ordens,
        receberGerencial: getContasReceberPayload(),
        getResumoFinanceiroOS,
      }),
      integridadeFiscalFinanceira: auditarIntegridadeFiscalFinanceiraNFe(notas),
    }));
  } catch (e) {
    next(e);
  }
});

const SSE_INTERVAL_MS = 15000;
const SSE_HEARTBEAT_MS = 30000;
const SSE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SSE = 10;
const MAX_SSE_PER_USER = 3;
const sseTracker = criarSseConnectionTracker({
  maxGlobal: MAX_SSE,
  maxPerUser: MAX_SSE_PER_USER,
});

router.get("/stream", auth(["admin","caixa"]), (req, res) => {
  const slot = sseTracker.tryAcquire(req.user?.id);
  if (!slot.ok) return res.status(429).json({ error: slot.message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  let idleTimer = null;
  let dataTimer = null;
  let heartbeatTimer = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(dataTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(idleTimer);
    slot.release();
  };

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      res.end();
      cleanup();
    }, SSE_IDLE_TIMEOUT_MS);
  };

  const send = () => {
    if (closed) return;
    try {
      const data = JSON.stringify(calcKpis());
      res.write(`data: ${data}\n\n`);
      resetIdle();
    } catch (e) {
      console.error("[SSE kpis]", e.message);
    }
  };

  req.on("close", cleanup);

  send();
  dataTimer = setInterval(send, SSE_INTERVAL_MS);
  heartbeatTimer = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, SSE_HEARTBEAT_MS);

  resetIdle();
});

module.exports = router;
