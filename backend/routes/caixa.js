const router = require("express").Router();
const { getAll, getOne, run, runInsert } = require("../database");
const { auth } = require("../middlewares/auth");
const { toNumber } = require("../utils/numbers");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { descricaoRestanteOS } = require("../domain/ordensRules");

// GET /api/caixa
router.get("/", auth(), (req, res, next) => {
  try {
    const { data, mes } = req.query;
    let sql = "SELECT l.*, o.numero AS ordemnumero FROM lancamentos l LEFT JOIN ordens o ON o.id=l.ordemid WHERE l.deletedat IS NULL";
    const p = [];
    if (data) { sql += " AND l.data=?"; p.push(data); }
    if (mes)  { sql += " AND strftime('%Y-%m',l.data)=?"; p.push(mes); }
    sql += " ORDER BY l.data DESC, l.id DESC";
    res.json(getAll(sql, p));
  } catch(e) { next(e); }
});

// POST /api/caixa
router.post("/", auth(["admin","caixa"]), (req, res, next) => {
  try {
    const { data, tipo, descricao, pagamento, valor, pago, ordemid } = req.body ?? {};
    if (!data || !pagamento || valor == null)
      return res.status(400).json({ error: "data, pagamento e valor sao obrigatorios" });

    const nValor = toNumber(valor);
    let origem = "manual";
    let descFinal = descricao;

    if (ordemid) {
      const resumo = getResumoFinanceiroOS(ordemid);
      if (!resumo) return res.status(404).json({ error: "OS vinculada nao encontrada." });
      if (!(nValor > 0)) return res.status(400).json({ error: "Recebimento de saldo deve ter valor maior que zero." });
      if (nValor > resumo.saldo + 0.0001)
        return res.status(400).json({ error: `Saldo disponivel para a ${resumo.ordem.numero}: R$ ${resumo.saldo.toFixed(2)}` });
      origem = "saldoos";
      descFinal = descricaoRestanteOS(resumo.ordem.numero, resumo.ordem.clientenome, resumo.ordem.servico);
    }

    if (!descFinal)
      return res.status(400).json({ error: "descricao e obrigatoria" });

    const id = runInsert(
      "INSERT INTO lancamentos (data,tipo,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?)",
      [data, tipo||"Diversos", descFinal, pagamento, nValor, pago ? 1 : 0, ordemid||null, req.user.id, origem]
    );
    res.json({ id, origem });
  } catch(e) { next(e); }
});

// PUT /api/caixa/:id
router.put("/:id", auth(["admin","caixa"]), (req, res, next) => {
  try {
    const old = getOne("SELECT * FROM lancamentos WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Lancamento nao encontrado." });
    if (old.origem === "entradaos")
      return res.status(400).json({ error: "A entrada vinculada a OS deve ser alterada pela propria OS." });

    const { data, tipo, descricao, pagamento, valor, pago, ordemid } = req.body ?? {};
    const novoOrdemId = ordemid || null;
    const nValor = toNumber(valor);
    let origem = novoOrdemId ? "saldoos" : "manual";
    let descFinal = descricao;

    if (novoOrdemId) {
      const ordem = getOne("SELECT id,numero,clientenome,servico,valortotal FROM ordens WHERE id=?", [novoOrdemId]);
      if (!ordem) return res.status(404).json({ error: "OS vinculada nao encontrada." });
      const recebido = getOne(
        "SELECT COALESCE(SUM(valor),0) AS total FROM lancamentos WHERE ordemid=? AND pago=1 AND valor>0 AND id!=? AND deletedat IS NULL",
        [novoOrdemId, req.params.id]
      );
      const saldo = Math.max(0, toNumber(ordem.valortotal) - toNumber(recebido?.total));
      if (!(nValor > 0)) return res.status(400).json({ error: "Recebimento de saldo deve ter valor maior que zero." });
      if (nValor > saldo + 0.0001)
        return res.status(400).json({ error: `Saldo disponivel para ${ordem.numero}: R$ ${saldo.toFixed(2)}` });
      descFinal = descricaoRestanteOS(ordem.numero, ordem.clientenome, ordem.servico);
    }

    run(
      "UPDATE lancamentos SET data=?,tipo=?,descricao=?,pagamento=?,valor=?,pago=?,ordemid=?,origem=? WHERE id=?",
      [data, tipo||"Diversos", descFinal, pagamento, nValor, pago ? 1 : 0, novoOrdemId, origem, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// DELETE /api/caixa/:id  — soft delete com auditoria
router.delete("/:id", auth(["admin"]), (req, res, next) => {
  try {
    const old = getOne("SELECT * FROM lancamentos WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Lancamento nao encontrado." });
    if (old.origem === "entradaos")
      return res.status(400).json({ error: "A entrada automatica da OS nao pode ser excluida pelo caixa." });
    run(
      "UPDATE lancamentos SET deletedat=datetime('now','localtime'), deletedpor=? WHERE id=?",
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
