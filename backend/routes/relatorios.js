const router = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { toNumber } = require("../utils/numbers");

// Filtro reutilizavel: exclui lancamentos soft-deleted (C4) e lancamentos
// vinculados a OS que foram soft-deleted (I4).
const FILTRO_ATIVO = `
  l.deletedat IS NULL
  AND (l.ordemid IS NULL OR (SELECT deletedat FROM ordens WHERE id=l.ordemid) IS NULL)
`;

router.get("/resumo", auth(), (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o m\u00eas YYYY-MM" });

    const hj = hoje();

    const total = getOne(
      `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}`,
      [mes]
    )?.v ?? 0;

    const hojeV = getOne(
      `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l WHERE l.data=? AND ${FILTRO_ATIVO}`,
      [hj]
    )?.v ?? 0;

    const count = getOne(
      `SELECT COUNT(*) AS c FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO}`,
      [mes]
    )?.c ?? 0;

    const porPag = { Pix:0, Dinheiro:0, Credito:0, Debito:0, Link:0 };
    getAll(
      `SELECT l.pagamento, SUM(l.valor) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} GROUP BY l.pagamento`,
      [mes]
    ).forEach(r => { if (porPag[r.pagamento] !== undefined) porPag[r.pagamento] = r.v; });

    const porTipo = {};
    getAll(
      `SELECT l.tipo, SUM(l.valor) AS v FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} GROUP BY l.tipo`,
      [mes]
    ).forEach(r => { porTipo[r.tipo] = r.v; });

    const dias = getAll(
      `SELECT l.data, SUM(l.valor) AS total FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} GROUP BY l.data ORDER BY l.data`,
      [mes]
    );

    const ordensabertas  = getOne("SELECT COUNT(*) AS c FROM ordens WHERE status NOT IN ('Entregue','Cancelado') AND deletedat IS NULL")?.c ?? 0;
    const ordensvencidas = getOne("SELECT COUNT(*) AS c FROM ordens WHERE prazoentrega<? AND status NOT IN ('Entregue','Cancelado') AND deletedat IS NULL", [hj])?.c ?? 0;

    const lancamentos = getAll(
      `SELECT l.* FROM lancamentos l WHERE strftime('%Y-%m',l.data)=? AND ${FILTRO_ATIVO} ORDER BY l.data DESC, l.id DESC`,
      [mes]
    );

    res.json({
      total, hoje: hojeV, count,
      ticketmedio: count > 0 ? toNumber(total) / count : 0,
      ordensabertas, ordensvencidas,
      porpagamento: porPag, portipo: porTipo,
      dias, lancamentos
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
