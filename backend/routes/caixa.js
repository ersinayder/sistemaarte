const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction, getDB } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const { toNumber } = require("../utils/numbers");
const { hoje } = require("../utils/dates");
const {
  descricaoVendaAvulsa,
  normalizarItensVendaAvulsa,
  totalItensVendaAvulsa,
} = require("../domain/caixaRules");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { descricaoRestanteOS } = require("../domain/ordensRules");
const { createCaixaLancamentoService } = require("../services/caixaLancamentoService");
const {
  montarFechamentoCaixa,
  renderFechamentoCaixaHtml,
} = require("../utils/print/caixaFechamento");
const { sendPrintHtml } = require("../utils/print/base");

// GET /api/caixa
router.get("/", auth(), authPermission("caixa.ver"), (req, res, next) => {
  try {
    const { data, mes } = req.query;
    let sql = `SELECT l.*,
                      o.numero AS ordemnumero,
                      (
                        SELECT GROUP_CONCAT(li.nome || ' x' || li.quantidade, ', ')
                        FROM lancamento_itens li
                        WHERE li.lancamentoid = l.id
                      ) AS itens_resumo
               FROM lancamentos l
               LEFT JOIN ordens o ON o.id=l.ordemid
               WHERE l.deletedat IS NULL
               AND (l.ordemid IS NULL OR o.deletedat IS NULL)`;
    const p = [];
    if (data) { sql += " AND l.data=?"; p.push(data); }
    if (mes)  { sql += " AND strftime('%Y-%m',l.data)=?"; p.push(mes); }
    sql += " ORDER BY l.data DESC, l.id DESC";
    res.json(getAll(sql, p));
  } catch(e) { next(e); }
});

// GET /api/caixa/fechamento?data=YYYY-MM-DD
router.get("/fechamento", auth(), authPermission("caixa.fechamento"), (req, res, next) => {
  try {
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.data || ""))
      ? String(req.query.data)
      : hoje();
    const lancamentos = getAll(
      `SELECT l.*,
              o.numero AS ordemnumero,
              (
                SELECT GROUP_CONCAT(li.nome || ' x' || li.quantidade, ', ')
                FROM lancamento_itens li
                WHERE li.lancamentoid = l.id
              ) AS itens_resumo
       FROM lancamentos l
       LEFT JOIN ordens o ON o.id=l.ordemid
       WHERE l.deletedat IS NULL
       AND (l.ordemid IS NULL OR o.deletedat IS NULL)
       AND l.data=?
       ORDER BY l.data DESC, l.id DESC`,
      [data]
    );
    const fechamento = montarFechamentoCaixa({ data, lancamentos });
    const html = renderFechamentoCaixaHtml({ data, fechamento, usuario: req.user });
    sendPrintHtml(res, `fechamento-caixa-${data}.html`, html);
  } catch(e) { next(e); }
});

// POST /api/caixa
router.post("/", auth(), authPermission("caixa.criar_lancamento"), (req, res, next) => {
  try {
    const { data, tipo, categoria, descricao, pagamento, valor, pago, ordemid, itens } = req.body ?? {};
    const itensVenda = normalizarItensVendaAvulsa(itens);

    if (!data || !pagamento || (valor == null && itensVenda.length === 0))
      return res.status(400).json({ error: "data, pagamento e valor sao obrigatorios" });

    const nValor = itensVenda.length > 0 ? totalItensVendaAvulsa(itensVenda) : toNumber(valor);
    let origem = "manual";
    let descFinal = descricao;
    let categoriaFinal = categoria || null;
    let pagoFinal = pago ? 1 : 0;

    if (itensVenda.length > 0 && ordemid)
      return res.status(400).json({ error: "Venda avulsa nao deve ser vinculada a uma OS." });

    if (ordemid) {
      const resumo = getResumoFinanceiroOS(ordemid);
      if (!resumo) return res.status(404).json({ error: "OS vinculada nao encontrada." });
      if (!(nValor > 0)) return res.status(400).json({ error: "Recebimento de saldo deve ter valor maior que zero." });
      if (nValor > resumo.saldo + 0.0001)
        return res.status(400).json({ error: `Saldo disponivel para a ${resumo.ordem.numero}: R$ ${resumo.saldo.toFixed(2)}` });
      origem = "saldoos";
      categoriaFinal = categoria || "Pagamento OS";
      pagoFinal = 1;
      descFinal = descricaoRestanteOS(resumo.ordem.numero, resumo.ordem.clientenome, resumo.ordem.servico);
    } else if (itensVenda.length > 0) {
      if (tipo && tipo !== "Entrada")
        return res.status(400).json({ error: "Venda avulsa deve ser uma entrada." });
      origem = "vendaavulsa";
      categoriaFinal = categoria || "Venda avulsa";
      pagoFinal = 1;
      descFinal = descricao || descricaoVendaAvulsa(itensVenda);
    }

    if (!descFinal)
      return res.status(400).json({ error: "descricao e obrigatoria" });

    const id = transaction(() => {
      const lancamentoId = runInsert(
        "INSERT INTO lancamentos (data,tipo,categoria,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [data, origem === "vendaavulsa" || origem === "saldoos" ? "Entrada" : (tipo||"Diversos"), categoriaFinal, descFinal, pagamento, nValor, pagoFinal, ordemid||null, req.user.id, origem]
      );

      for (const item of itensVenda) {
        runInsert(
          "INSERT INTO lancamento_itens (lancamentoid,produto_id,nome,quantidade,preco_unitario,avulso) VALUES (?,?,?,?,?,?)",
          [lancamentoId, item.produto_id, item.nome, item.quantidade, item.preco_unitario, item.avulso]
        );
      }

      return lancamentoId;
    });

    res.json({ id, origem, itens_resumo: itensVenda.length ? descricaoVendaAvulsa(itensVenda) : null });
  } catch(e) { next(e); }
});

// PUT /api/caixa/:id
router.put("/:id", auth(), authPermission("caixa.editar_lancamento"), (req, res, next) => {
  try {
    const service = createCaixaLancamentoService({ db: getDB() });
    res.json(service.editar(req.params.id, req.body ?? {}, req.user));
  } catch(e) {
    if (e.status) {
      return res.status(e.status).json({
        error: e.message,
        ...(e.code ? { code: e.code } : {}),
      });
    }
    next(e);
  }
});

// DELETE /api/caixa/:id  — soft delete com auditoria
router.delete("/:id", auth(), authPermission("caixa.excluir_lancamento"), (req, res, next) => {
  try {
    const old = getOne("SELECT * FROM lancamentos WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Lancamento nao encontrado." });
    if (old.ordemid && old.pago) {
      const ordemStatus = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [old.ordemid]);
      const resumo = getResumoFinanceiroOS(old.ordemid);
      const saldoProjetado = Math.max(0, Math.round((toNumber(resumo?.saldo) + toNumber(old.valor)) * 100) / 100);
      if (ordemStatus?.status === "Entregue" && saldoProjetado > 0.01) {
        return res.status(400).json({
          error: `Nao e possivel excluir pagamento de OS entregue. Reabra a OS ou ajuste o status antes de remover o pagamento.`,
        });
      }
    }
    transaction(() => {
      run(
        "UPDATE lancamentos SET deletedat=datetime('now','localtime'), deletedpor=? WHERE id=?",
        [req.user.id, req.params.id]
      );
      if (old.origem === "entradaos" && old.ordemid) {
        run(
          "UPDATE ordens SET valorentrada=0, updatedat=datetime('now','localtime') WHERE id=? AND deletedat IS NULL",
          [old.ordemid]
        );
      }
    });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
