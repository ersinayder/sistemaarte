const router   = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth } = require("../middlewares/auth");

const HOJE = () => new Date().toISOString().slice(0, 10);

function calcKpis() {
  const hoje = HOJE();

  const abertas = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL`
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
     WHERE status NOT IN ('Entregue','Cancelado','Cancelada')
       AND prazoentrega IS NOT NULL AND prazoentrega < ?
       AND deletedat IS NULL`,
    [hoje]
  )?.n ?? 0;

  const entreguesHoje = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE status = 'Entregue'
       AND date(updatedat) = ?
       AND deletedat IS NULL`,
    [hoje]
  )?.n ?? 0;

  // Usa l.data (data real do pagamento), nao createdat (data de digitacao)
  const faturamentoHoje = getOne(
    `SELECT COALESCE(SUM(l.valor),0) AS total
     FROM lancamentos l
     WHERE l.pago = 1 AND l.valor > 0
       AND date(l.data) = ?
       AND l.deletedat IS NULL`,
    [hoje]
  )?.total ?? 0;

  const abertasHoje = getOne(
    `SELECT COUNT(*) AS n FROM ordens
     WHERE date(createdat) = ? AND deletedat IS NULL`,
    [hoje]
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

// REST – snapshot único
router.get("/", auth(), (req, res, next) => {
  try {
    res.json(calcKpis());
  } catch (e) {
    next(e);
  }
});

// SSE – stream contínuo a cada 15 s
router.get("/stream", auth(), (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = () => {
    try {
      const data = JSON.stringify(calcKpis());
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      console.error("[SSE kpis]", e.message);
    }
  };

  send();
  const timer = setInterval(send, 15000);
  req.on("close", () => clearInterval(timer));
});

module.exports = router;
