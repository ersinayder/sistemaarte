const router   = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");

function calcKpis() {
  const hj = hoje();

  const abertas = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL`
  )?.n ?? 0;

  const emProducao = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status = 'Em Produ\u00e7\u00e3o' AND deletedat IS NULL`
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
     WHERE status NOT IN ('Entregue','Cancelado','Cancelada')
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

  const faturamentoHoje = getOne(
    `SELECT COALESCE(SUM(l.valor),0) AS total
     FROM lancamentos l
     WHERE l.pago = 1 AND l.valor > 0
       AND date(l.data) = ?
       AND l.deletedat IS NULL
       AND (l.ordemid IS NULL OR
         (SELECT deletedat FROM ordens WHERE id=l.ordemid) IS NULL)`,
    [hj]
  )?.total ?? 0;

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
    faturamentoHoje: Number(faturamentoHoje),
    abertasHoje,
    ts: Date.now()
  };
}

// REST snapshot unico
router.get("/", auth(), (req, res, next) => {
  try {
    res.json(calcKpis());
  } catch (e) {
    next(e);
  }
});

// SSE stream continuo a cada 15s com limite de conexoes
const SSE_INTERVAL_MS     = 15000;
const SSE_HEARTBEAT_MS    = 30000;
const SSE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
let activeSSE = 0;
const MAX_SSE = 10;

router.get("/stream", auth(), (req, res) => {
  if (activeSSE >= MAX_SSE) {
    return res.status(429).json({ error: `Limite de streams atingido (m\u00e1x ${MAX_SSE})` });
  }

  activeSSE++;
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed    = false;
  // Declara idleTimer antes de qualquer uso para evitar hoisting error
  let idleTimer = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(dataTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(idleTimer);
    activeSSE--;
  };

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { res.end(); cleanup(); }, SSE_IDLE_TIMEOUT_MS);
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

  send();
  const dataTimer      = setInterval(send, SSE_INTERVAL_MS);
  const heartbeatTimer = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, SSE_HEARTBEAT_MS);

  // Inicia o idle timer apos declarar todas as variaveis
  resetIdle();

  req.on("close", cleanup);
});

module.exports = router;
