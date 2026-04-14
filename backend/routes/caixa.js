
const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const { toNumber } = require("../utils/numbers");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");

// GET /api/caixa
router.get("/", auth(), (req, res) => {
  try {
    const { data, mes } = req.query;
    let sql = "SELECT l.*, o.numero AS ordemnumero FROM lancamentos l LEFT JOIN ordens o ON o.id=l.ordemid WHERE 1=1";
    const p = [];
    if (data) { sql += " AND l.data=?"; p.push(data); }
    if (mes)  { sql += " AND strftime('%Y-%m',l.data)=?"; p.push(mes); }
    sql += " ORDER BY l.data DESC, l.id DESC";
    res.json(getAll(sql, p));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/caixa
router.post("/", auth(["admin","caixa"]), (req, res) => {
  try {
    const { data, tipo, descricao, pagamento, valor, pago, ordemid } = req.body ?? {};
    if (!data || !descricao || !pagamento || valor == null)
      return res.status(400).json({ error: "data, descricao, pagamento e valor são obrigatórios" });

    const nValor = toNumber(valor);
    let origem = "manual";

    if (ordemid) {
      const resumo = getResumoFinanceiroOS(ordemid);
      if (!resumo) return res.status(404).json({ error: "OS vinculada não encontrada." });
      if (!(nValor > 0)) return res.status(400).json({ error: "Recebimento de saldo deve ter valor maior que zero." });
      if (nValor > resumo.saldo + 0.0001)
        return res.status(400).json({ error: `Saldo disponível para a ${resumo.ordem.numero}: R$ ${resumo.saldo.toFixed(2)}` });
      origem = "saldoos";
    }

    const id = runInsert(
      "INSERT INTO lancamentos (data,tipo,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?)",
      [data, tipo||"Diversos", descricao, pagamento, nValor, pago ? 1 : 0, ordemid||null, req.user.id, origem]
    );
    res.json({ id, origem });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/caixa/:id
router.put("/:id", auth(["admin","caixa"]), (req, res) => {
  try {
    const old = getOne("SELECT * FROM lancamentos WHERE id=?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Lançamento não encontrado." });
    if (old.origem === "entradaos")
      return res.status(400).json({ error: "A entrada vinculada à OS deve ser alterada pela própria OS." });

    const { data, tipo, descricao, pagamento, valor, pago, ordemid } = req.body ?? {};
    const novoOrdemId = ordemid || null;
    const nValor = toNumber(valor);
    let origem = novoOrdemId ? "saldoos" : "manual";

    if (novoOrdemId) {
      const ordem = getOne("SELECT id,numero,valortotal FROM ordens WHERE id=?", [novoOrdemId]);
      if (!ordem) return res.status(404).json({ error: "OS vinculada não encontrada." });
      const recebido = getOne(
        "SELECT COALESCE(SUM(valor),0) AS total FROM lancamentos WHERE ordemid=? AND pago=1 AND valor>0 AND id!=?",
        [novoOrdemId, req.params.id]
      );
      const saldo = Math.max(0, toNumber(ordem.valortotal) - toNumber(recebido?.total));
      if (!(nValor > 0)) return res.status(400).json({ error: "Recebimento de saldo deve ter valor maior que zero." });
      if (nValor > saldo + 0.0001)
        return res.status(400).json({ error: `Saldo disponível para ${ordem.numero}: R$ ${saldo.toFixed(2)}` });
    }

    run(
      "UPDATE lancamentos SET data=?,tipo=?,descricao=?,pagamento=?,valor=?,pago=?,ordemid=?,origem=? WHERE id=?",
      [data, tipo||"Diversos", descricao, pagamento, nValor, pago ? 1 : 0, novoOrdemId, origem, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/caixa/:id
router.delete("/:id", auth(["admin"]), (req, res) => {
  try {
    const old = getOne("SELECT * FROM lancamentos WHERE id=?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Lançamento não encontrado." });
    if (old.origem === "entradaos")
      return res.status(400).json({ error: "A entrada automática da OS não pode ser excluída pelo caixa." });
    run("DELETE FROM lancamentos WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
