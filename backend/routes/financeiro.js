const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const { hoje } = require("../utils/dates");
const { toNumber } = require("../utils/numbers");
const {
  calcularResumoFinanceiroAdmin,
  normalizarStatusContaPagar,
  validarContaPagar,
} = require("../domain/financeiroAdminRules");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { validarInvarianteCredito } = require("../domain/clienteCreditoRules");
const {
  auditarIntegridadeFinanceiraOS,
  montarDetalheIntegridadeFinanceiraOS,
} = require("../services/financeiroIntegridadeService");
const { getContasReceberPayload } = require("../services/financeiroReceberService");
const {
  renderContasPagarHtml,
  renderContasReceberHtml,
  renderDreHtml,
  renderResumoFinanceiroHtml,
} = require("../utils/print/financeiroReports");
const { sendPrintHtml } = require("../utils/print/base");

const FILTRO_LANCAMENTO_ATIVO = `
  l.deletedat IS NULL
  AND (l.ordemid IS NULL OR (SELECT deletedat FROM ordens WHERE id=l.ordemid) IS NULL)
`;

function mesAtual() {
  return hoje().slice(0, 7);
}

function periodoMes(mesInput) {
  const mes = /^\d{4}-\d{2}$/.test(String(mesInput || "").trim())
    ? String(mesInput).trim()
    : mesAtual();
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const inicio = `${mes}-01`;
  const fim = `${mes}-${String(ultimoDia).padStart(2, "0")}`;
  return { mes, inicio, fim };
}

function rowConta(id) {
  return getOne("SELECT * FROM contas_pagar WHERE id=? AND deletedat IS NULL", [id]);
}

function filtrosContaPagar(query = {}) {
  const where = ["deletedat IS NULL"];
  const params = [];
  if (query.mes) {
    const { inicio, fim } = periodoMes(query.mes);
    where.push("vencimento BETWEEN ? AND ?");
    params.push(inicio, fim);
  }
  if (query.status && query.status !== "todos") {
    where.push("status=?");
    params.push(normalizarStatusContaPagar(query.status));
  }
  if (query.q) {
    const q = `%${String(query.q).trim()}%`;
    where.push("(fornecedor LIKE ? OR descricao LIKE ? OR categoria LIKE ? OR observacoes LIKE ?)");
    params.push(q, q, q, q);
  }
  return { where: where.join(" AND "), params };
}

function getResumoFinanceiroPayload(mesInput) {
  const { mes, inicio, fim } = periodoMes(mesInput);
  const receitaRealizada = getOne(
    `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l
     WHERE strftime('%Y-%m',l.data)=? AND (l.tipo='Entrada' OR l.tipo='entrada') AND (l.pago=1 OR l.pago IS NULL) AND ${FILTRO_LANCAMENTO_ATIVO}`,
    [mes]
  )?.v ?? 0;
  const saidasPagas = getOne(
    `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l
     WHERE strftime('%Y-%m',l.data)=? AND l.tipo IN ('Saída', 'Saida', 'saida', 'saída') AND (l.pago=1 OR l.pago IS NULL)
     AND COALESCE(l.origem,'') != 'credito_devolvido'
     AND ${FILTRO_LANCAMENTO_ATIVO}`,
    [mes]
  )?.v ?? 0;
  const contasPendentes = getOne(
    `SELECT COALESCE(SUM(valor),0) AS v FROM contas_pagar
     WHERE deletedat IS NULL AND status='Pendente' AND vencimento BETWEEN ? AND ?`,
    [inicio, fim]
  )?.v ?? 0;
  const contasVencidas = getOne(
    `SELECT COALESCE(SUM(valor),0) AS v FROM contas_pagar
     WHERE deletedat IS NULL AND status='Pendente' AND vencimento < ?`,
    [hoje()]
  )?.v ?? 0;
  const despesasPorCategoria = getAll(
    `SELECT COALESCE(categoria,'Outros') AS categoria, COALESCE(SUM(valor),0) AS valor
     FROM contas_pagar
     WHERE deletedat IS NULL AND status='Pago' AND strftime('%Y-%m',COALESCE(pagoem,vencimento))=?
     GROUP BY COALESCE(categoria,'Outros') ORDER BY valor DESC`,
    [mes]
  );
  return {
    mes,
    ...calcularResumoFinanceiroAdmin({ receitaRealizada, saidasPagas, contasPendentes, contasVencidas }),
    despesasPorCategoria,
  };
}

function getContasPagarPayload(query = {}) {
  const { where, params } = filtrosContaPagar(query);
  return getAll(`SELECT * FROM contas_pagar WHERE ${where} ORDER BY vencimento ASC, id ASC`, params);
}

function getDrePayload(mesInput) {
  const { mes } = periodoMes(mesInput);
  const receitaBruta = getOne(
    `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l
     WHERE strftime('%Y-%m',l.data)=? AND (l.tipo='Entrada' OR l.tipo='entrada') AND (l.pago=1 OR l.pago IS NULL) AND ${FILTRO_LANCAMENTO_ATIVO}`,
    [mes]
  )?.v ?? 0;
  const devolucoes = getOne(
    `SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l
     WHERE strftime('%Y-%m',l.data)=? AND l.tipo IN ('Saída', 'Saida', 'saida', 'saída') AND (l.pago=1 OR l.pago IS NULL)
     AND (LOWER(COALESCE(l.categoria,'')) LIKE '%devol%' OR LOWER(COALESCE(l.categoria,'')) LIKE '%estorno%')
     AND COALESCE(l.origem,'') != 'credito_devolvido'
     AND ${FILTRO_LANCAMENTO_ATIVO}`,
    [mes]
  )?.v ?? 0;
  const despesas = getAll(
    `SELECT COALESCE(l.categoria,'Outros') AS categoria, COALESCE(SUM(l.valor),0) AS valor
     FROM lancamentos l
     WHERE strftime('%Y-%m',l.data)=? AND l.tipo IN ('Saída', 'Saida', 'saida', 'saída') AND (l.pago=1 OR l.pago IS NULL)
     AND NOT (LOWER(COALESCE(l.categoria,'')) LIKE '%devol%' OR LOWER(COALESCE(l.categoria,'')) LIKE '%estorno%')
     AND COALESCE(l.origem,'') != 'credito_devolvido'
     AND ${FILTRO_LANCAMENTO_ATIVO}
     GROUP BY COALESCE(l.categoria,'Outros') ORDER BY valor DESC`,
    [mes]
  );
  const totalDespesas = despesas.reduce((acc, row) => acc + toNumber(row.valor), 0);
  const receitaLiquida = toNumber(receitaBruta) - toNumber(devolucoes);
  return { mes, receitaBruta, devolucoes, receitaLiquida, despesas, totalDespesas, resultado: receitaLiquida - totalDespesas };
}

router.get("/resumo", auth(), authPermission("financeiro.ver"), (req, res, next) => {
  try {
    res.json(getResumoFinanceiroPayload(req.query.mes));
  } catch (e) { next(e); }
});

router.get("/resumo/pdf", auth(), authPermission("financeiro.relatorios"), (req, res, next) => {
  try {
    const resumo = getResumoFinanceiroPayload(req.query.mes);
    sendPrintHtml(
      res,
      `resumo-financeiro-${resumo.mes}.html`,
      renderResumoFinanceiroHtml({ mes: resumo.mes, resumo })
    );
  } catch (e) { next(e); }
});

router.get("/contas-pagar", auth(), authPermission("financeiro.contas_pagar.ver"), (req, res, next) => {
  try {
    res.json(getContasPagarPayload(req.query));
  } catch (e) { next(e); }
});

router.get("/contas-pagar/pdf", auth(), authPermission("financeiro.relatorios"), (req, res, next) => {
  try {
    const contas = getContasPagarPayload(req.query);
    const mes = req.query.mes || mesAtual();
    sendPrintHtml(
      res,
      `contas-pagar-${mes}.html`,
      renderContasPagarHtml({ mes, contas })
    );
  } catch (e) { next(e); }
});

router.post("/contas-pagar", auth(), authPermission("financeiro.contas_pagar.editar"), (req, res, next) => {
  try {
    const errors = validarContaPagar(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join("; "), errors });
    const id = runInsert(
      `INSERT INTO contas_pagar
        (fornecedor, descricao, categoria, valor, vencimento, status, pagamento, observacoes, criadopor)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        String(req.body.fornecedor || "").trim(),
        String(req.body.descricao || "").trim(),
        req.body.categoria || "Outros",
        toNumber(req.body.valor),
        req.body.vencimento,
        normalizarStatusContaPagar(req.body.status || "Pendente"),
        req.body.pagamento || null,
        req.body.observacoes || null,
        req.user.id,
      ]
    );
    res.status(201).json(rowConta(id));
  } catch (e) { next(e); }
});

router.put("/contas-pagar/:id", auth(), authPermission("financeiro.contas_pagar.editar"), (req, res, next) => {
  try {
    const old = rowConta(req.params.id);
    if (!old) return res.status(404).json({ error: "Conta nao encontrada" });
    if (old.status === "Pago") return res.status(400).json({ error: "Conta paga nao pode ser editada" });
    const input = { ...old, ...req.body };
    const errors = validarContaPagar(input);
    if (errors.length) return res.status(400).json({ error: errors.join("; "), errors });
    run(
      `UPDATE contas_pagar
       SET fornecedor=?, descricao=?, categoria=?, valor=?, vencimento=?, status=?, pagamento=?, observacoes=?, updatedat=datetime('now','localtime')
       WHERE id=? AND deletedat IS NULL`,
      [
        String(input.fornecedor || "").trim(),
        String(input.descricao || "").trim(),
        input.categoria || "Outros",
        toNumber(input.valor),
        input.vencimento,
        normalizarStatusContaPagar(input.status || "Pendente"),
        input.pagamento || null,
        input.observacoes || null,
        req.params.id,
      ]
    );
    res.json(rowConta(req.params.id));
  } catch (e) { next(e); }
});

router.patch("/contas-pagar/:id/pagar", auth(), authPermission("financeiro.contas_pagar.pagar"), (req, res, next) => {
  try {
    const conta = rowConta(req.params.id);
    if (!conta) return res.status(404).json({ error: "Conta nao encontrada" });
    if (conta.status === "Pago") return res.status(400).json({ error: "Conta ja esta paga" });
    if (conta.status === "Cancelado") return res.status(400).json({ error: "Conta cancelada nao pode ser paga" });
    const pagoem = req.body?.pagoem || hoje();
    const pagamento = req.body?.pagamento || conta.pagamento || "Pix";
    const lancamentoId = transaction(() => {
      const id = runInsert(
        `INSERT INTO lancamentos
          (data, tipo, categoria, descricao, pagamento, valor, pago, criadopor, origem, conta_pagar_id)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [pagoem, "Saída", conta.categoria || "Conta a pagar", `${conta.fornecedor} - ${conta.descricao}`, pagamento, toNumber(conta.valor), 1, req.user.id, "conta-pagar", conta.id]
      );
      run(
        "UPDATE contas_pagar SET status='Pago', pagoem=?, datapagamento=?, pagamento=?, lancamentoid=?, updatedat=datetime('now','localtime') WHERE id=? AND deletedat IS NULL",
        [pagoem, pagoem, pagamento, id, conta.id]
      );
      return id;
    });
    res.json({ ok: true, lancamentoid: lancamentoId, conta: rowConta(req.params.id) });
  } catch (e) { next(e); }
});

router.patch("/contas-pagar/:id/cancelar", auth(), authPermission("financeiro.contas_pagar.editar"), (req, res, next) => {
  try {
    const conta = rowConta(req.params.id);
    if (!conta) return res.status(404).json({ error: "Conta nao encontrada" });
    if (conta.status === "Pago") return res.status(400).json({ error: "Conta paga nao pode ser cancelada" });
    run("UPDATE contas_pagar SET status='Cancelado', updatedat=datetime('now','localtime') WHERE id=? AND deletedat IS NULL", [req.params.id]);
    res.json(rowConta(req.params.id));
  } catch (e) { next(e); }
});

router.delete("/contas-pagar/:id", auth(), authPermission("financeiro.contas_pagar.editar"), (req, res, next) => {
  try {
    const conta = rowConta(req.params.id);
    if (!conta) return res.status(404).json({ error: "Conta nao encontrada" });
    if (conta.status === "Pago") return res.status(400).json({ error: "Conta paga nao pode ser excluida" });
    run("UPDATE contas_pagar SET deletedat=datetime('now','localtime'), deletedpor=? WHERE id=? AND deletedat IS NULL", [req.user.id, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get("/contas-receber", auth(), authPermission("financeiro.ver"), (_req, res, next) => {
  try {
    res.json(getContasReceberPayload());
  } catch (e) { next(e); }
});

router.get("/integridade-os/:ordemId", auth(), authPermission("financeiro.ver"), (req, res, next) => {
  try {
    const ordem = getOne(
      `SELECT o.id, o.numero, o.clientenome, o.clienteid, o.status, o.valortotal,
              COALESCE(c.fiado_ativo, 0) AS cliente_fiado_ativo
       FROM ordens o
       LEFT JOIN clientes c ON c.id = o.clienteid
       WHERE o.id=? AND o.deletedat IS NULL`,
      [req.params.ordemId]
    );
    if (!ordem) return res.status(404).json({ error: "OS nao encontrada" });

    const receberGerencial = getContasReceberPayload()
      .find((row) => Number(row.id) === Number(req.params.ordemId)) || null;
    const lancamentos = getAll(
      `SELECT id, data, tipo, categoria, descricao, pagamento, valor, pago, origem, deletedat
       FROM lancamentos
       WHERE ordemid=?
       ORDER BY data ASC, id ASC`,
      [req.params.ordemId]
    );

    res.json(montarDetalheIntegridadeFinanceiraOS({
      ordem,
      receberGerencial,
      lancamentos,
      getResumoFinanceiroOS,
    }));
  } catch (e) { next(e); }
});

router.get("/integridade-os", auth(), authPermission("financeiro.ver"), (_req, res, next) => {
  try {
    const ordens = getAll(
      `SELECT o.id, o.numero, o.clientenome, o.clienteid, o.status, o.valortotal,
              COALESCE(c.fiado_ativo, 0) AS cliente_fiado_ativo
       FROM ordens o
       LEFT JOIN clientes c ON c.id = o.clienteid
       WHERE o.deletedat IS NULL
       ORDER BY o.id DESC`
    );

    const movQuery = getOne(
      "SELECT COALESCE(SUM(valor), 0) AS total FROM cliente_credito_movimentos WHERE tipo != 'saldo_inicial'"
    );
    const lancCreditoLojaQuery = getOne(
      "SELECT COALESCE(SUM(valor), 0) AS total FROM lancamentos WHERE pagamento = 'CreditoLoja' AND (pago = 1 OR pago IS NULL) AND deletedat IS NULL"
    );
    const saidasDevolvidoQuery = getOne(
      "SELECT COALESCE(SUM(valor), 0) AS total FROM lancamentos WHERE origem = 'credito_devolvido' AND (pago = 1 OR pago IS NULL) AND deletedat IS NULL"
    );
    const invarianteCredito = validarInvarianteCredito({
      totalMovimentosSemSaldoInicial: movQuery?.total ?? 0,
      totalLancamentosCreditoLoja: lancCreditoLojaQuery?.total ?? 0,
      totalSaidasDevolvido: saidasDevolvidoQuery?.total ?? 0,
    });

    const clientesComCreditoNegativo = getAll(
      `SELECT cliente_id, ROUND(COALESCE(SUM(valor), 0), 2) as saldo
       FROM cliente_credito_movimentos
       GROUP BY cliente_id
       HAVING saldo < -0.009`
    );

    const resultado = auditarIntegridadeFinanceiraOS({
      ordens,
      receberGerencial: getContasReceberPayload(),
      getResumoFinanceiroOS,
    });

    if (!invarianteCredito.valido) {
      resultado.itens.push({
        tipo: "invariante_credito_divergente",
        severidade: "critico",
        diferenca: invarianteCredito.diferenca,
        mensagem: `Invariante contábil de crédito diverge em R$ ${invarianteCredito.diferenca.toFixed(2)}.`,
      });
      resultado.total += 1;
      resultado.criticos += 1;
    }

    if (clientesComCreditoNegativo.length > 0) {
      resultado.itens.push({
        tipo: "cliente_credito_negativo",
        severidade: "critico",
        clientes: clientesComCreditoNegativo,
        mensagem: `${clientesComCreditoNegativo.length} cliente(s) com saldo de crédito negativo detectado(s).`,
      });
      resultado.total += 1;
      resultado.criticos += 1;
    }

    resultado.invarianteCredito = invarianteCredito;
    resultado.clientesComCreditoNegativo = clientesComCreditoNegativo;

    res.json(resultado);
  } catch (e) { next(e); }
});

router.get("/contas-receber/pdf", auth(), authPermission("financeiro.relatorios"), (_req, res, next) => {
  try {
    const contas = getContasReceberPayload();
    sendPrintHtml(
      res,
      "contas-receber.html",
      renderContasReceberHtml({ contas })
    );
  } catch (e) { next(e); }
});

router.get("/dre", auth(), authPermission("financeiro.relatorios"), (req, res, next) => {
  try {
    res.json(getDrePayload(req.query.mes));
  } catch (e) { next(e); }
});

router.get("/dre/pdf", auth(), authPermission("financeiro.relatorios"), (req, res, next) => {
  try {
    const dre = getDrePayload(req.query.mes);
    sendPrintHtml(
      res,
      `dre-${dre.mes}.html`,
      renderDreHtml({ mes: dre.mes, dre })
    );
  } catch (e) { next(e); }
});

module.exports = router;
