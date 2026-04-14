
const router = require("express").Router();
const { getAll, getOne } = require("../database");
const { auth } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { toNumber } = require("../utils/numbers");

router.get("/resumo", auth(), (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: "Informe o mês YYYY-MM" });

    const hj    = hoje();
    const total = getOne("SELECT COALESCE(SUM(valor),0) AS v FROM lancamentos WHERE strftime('%Y-%m',data)=?", [mes])?.v ?? 0;
    const hojeV = getOne("SELECT COALESCE(SUM(valor),0) AS v FROM lancamentos WHERE data=?", [hj])?.v ?? 0;
    const count = getOne("SELECT COUNT(*) AS c FROM lancamentos WHERE strftime('%Y-%m',data)=?", [mes])?.c ?? 0;

    const porPag = { Pix:0, Dinheiro:0, Credito:0, Debito:0, Link:0 };
    getAll("SELECT pagamento, SUM(valor) AS v FROM lancamentos WHERE strftime('%Y-%m',data)=? GROUP BY pagamento", [mes])
      .forEach(r => { if (porPag[r.pagamento] !== undefined) porPag[r.pagamento] = r.v; });

    const porTipo = {};
    getAll("SELECT tipo, SUM(valor) AS v FROM lancamentos WHERE strftime('%Y-%m',data)=? GROUP BY tipo", [mes])
      .forEach(r => { porTipo[r.tipo] = r.v; });

    const dias = getAll(
      "SELECT data, SUM(valor) AS total FROM lancamentos WHERE strftime('%Y-%m',data)=? GROUP BY data ORDER BY data",
      [mes]
    );

    const ordensabertas  = getOne("SELECT COUNT(*) AS c FROM ordens WHERE status NOT IN ('Entregue','Cancelado')")?.c ?? 0;
    const ordensvencidas = getOne("SELECT COUNT(*) AS c FROM ordens WHERE prazoentrega<? AND status NOT IN ('Entregue','Cancelado')", [hj])?.c ?? 0;
    const lancamentos    = getAll("SELECT * FROM lancamentos WHERE strftime('%Y-%m',data)=? ORDER BY data DESC,id DESC", [mes]);

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
