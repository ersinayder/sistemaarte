const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction, getDB } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const { hasPermission } = require("../domain/permissionRules");
const { toNumber } = require("../utils/numbers");
const { createClienteCreditoService } = require("../services/clienteCreditoService");
const { createClienteAcertoService } = require("../services/clienteAcertoService");
const { renderExtratoContaHtml, renderReciboAcertoHtml } = require("../utils/print/clienteExtrato");
const { sendPrintHtml } = require("../utils/print/base");
const { normalizarPaginacao, montarMetaPaginacao } = require("../domain/paginationRules");
const { consultarCnpj } = require("../services/cnpjLookupService");
const { hoje } = require("../utils/dates");

const SEL_CLIENTE = `
  SELECT c.*,
    (SELECT COUNT(*) FROM ordens WHERE clienteid=c.id AND deletedat IS NULL) AS totalordens,
    (SELECT COALESCE(SUM(valortotal),0) FROM ordens WHERE clienteid=c.id AND deletedat IS NULL) AS gastototal
  FROM clientes c
  WHERE c.deletedat IS NULL
`;

router.get("/", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    const querPaginacao = req.query.page !== undefined || req.query.limit !== undefined;
    const { page, limit, offset } = normalizarPaginacao(req.query, { defaultLimit: 25, maxLimit: 100 });
    const q = String(req.query.q || "").trim();
    const where = ["c.deletedat IS NULL"];
    const params = [];
    if (q) {
      const lk = `%${q}%`;
      where.push("(c.name LIKE ? OR c.phone LIKE ? OR c.cpf LIKE ? OR c.ie LIKE ? OR c.cidade LIKE ?)");
      params.push(lk, lk, lk, lk, lk);
    }
    if (!querPaginacao) {
      if (q) {
        return res.json(getAll(
          SEL_CLIENTE + " AND (c.name LIKE ? OR c.phone LIKE ? OR c.cpf LIKE ? OR c.ie LIKE ? OR c.cidade LIKE ?) ORDER BY c.name LIMIT 20",
          params
        ));
      }
      return res.json(getAll(SEL_CLIENTE + " ORDER BY c.name LIMIT 100"));
    }
    const whereSql = ` WHERE ${where.join(" AND ")}`;
    const total = getOne(`SELECT COUNT(*) AS total FROM clientes c${whereSql}`, params)?.total ?? 0;
    const rows = getAll(
      `SELECT c.*,
        (SELECT COUNT(*) FROM ordens WHERE clienteid=c.id AND deletedat IS NULL) AS totalordens,
        (SELECT COALESCE(SUM(valortotal),0) FROM ordens WHERE clienteid=c.id AND deletedat IS NULL) AS gastototal
       FROM clientes c
       ${whereSql}
       ORDER BY c.name COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({
      data: rows,
      meta: montarMetaPaginacao({ page, limit, total }),
    });
  } catch(e) { next(e); }
});

router.get("/cnpj/:cnpj", auth(), authPermission("clientes.consultar_documentos"), async (req, res, next) => {
  try {
    res.json(await consultarCnpj(req.params.cnpj));
  } catch(e) {
    next(e);
  }
});

router.get("/:id", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    const id = req.params.id;
    const c = getOne("SELECT * FROM clientes WHERE id=? AND deletedat IS NULL", [id]);
    if (!c) return res.status(404).json({ error: "Cliente nao encontrado" });

    const ordens = getAll(
      "SELECT id, numero, status, servico, valortotal, createdat, prazoentrega FROM ordens WHERE clienteid=? AND deletedat IS NULL ORDER BY createdat DESC",
      [id]
    );

    const total = ordens.reduce((s, o) => s + Number(o.valortotal || 0), 0);
    const ticketMedio = ordens.length ? total / ordens.length : 0;

    const dataHoje = hoje();
    const statusAberto = ['Aguardando', 'Em Produção', 'Pronto'];
    const osEmAberto = ordens.filter(o => statusAberto.includes(o.status)).length;

    const osVencidas = ordens.filter(o =>
      statusAberto.includes(o.status) &&
      o.prazoentrega &&
      o.prazoentrega.slice(0, 10) < dataHoje
    ).length;

    const ultimaOs = ordens[0] || null;

    const statusBreakdown = {};
    for (const o of ordens) {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
    }

    res.json({
      ...c,
      _sumario: {
        totalOrdens:  ordens.length,
        totalGasto:   total,
        ticketMedio,
        osEmAberto,
        osVencidas,
        ultimaOs,
        statusBreakdown,
        saldoCredito: (typeof getDB === "function" && getDB())
          ? createClienteCreditoService({ db: getDB() }).getExtratoCredito(id).saldo
          : 0,
      },
    });
  } catch(e) { next(e); }
});

router.get("/:id/ordens", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    res.json(getAll(
      "SELECT * FROM ordens WHERE clienteid=? AND deletedat IS NULL ORDER BY createdat DESC",
      [req.params.id]
    ));
  } catch(e) { next(e); }
});

router.post("/", auth(), authPermission("clientes.criar"), (req, res, next) => {
  try {
    const { name, phone, email, cpf, ie, ind_ie_dest, logradouro, numero, bairro, cidade, uf, cep, notes } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Nome obrigatorio" });
    // ind_ie_dest so faz sentido para CNPJ (PJ); para CPF e sempre null
    const docDigits = (cpf || '').replace(/\D/g, '');
    const indIeDest = docDigits.length === 14 && ['1','2','9'].includes(String(ind_ie_dest||'').trim())
      ? String(ind_ie_dest).trim()
      : null;
    const id = runInsert(
      `INSERT INTO clientes
        (name, phone, email, cpf, ie, ind_ie_dest, logradouro, numero, bairro, cidade, uf, cep, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, phone||null, email||null, cpf||null, ie||null, indIeDest,
       logradouro||null, numero||null, bairro||null,
       cidade||null, uf||null, cep||null, notes||null]
    );
    res.json({ id, name });
  } catch(e) { next(e); }
});

router.put("/:id", auth(), authPermission("clientes.editar"), (req, res, next) => {
  try {
    const { name, phone, email, cpf, ie, ind_ie_dest, logradouro, numero, bairro, cidade, uf, cep, notes } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Nome obrigatorio" });
    if (!getOne("SELECT id FROM clientes WHERE id=? AND deletedat IS NULL", [req.params.id]))
      return res.status(404).json({ error: "Cliente nao encontrado" });
    const docDigits = (cpf || '').replace(/\D/g, '');
    const indIeDest = docDigits.length === 14 && ['1','2','9'].includes(String(ind_ie_dest||'').trim())
      ? String(ind_ie_dest).trim()
      : null;
    const canManageFiado = hasPermission(req.user, "clientes.fiado.gerenciar");
    const fields = [
      "name=?", "phone=?", "email=?", "cpf=?", "ie=?", "ind_ie_dest=?",
      "logradouro=?", "numero=?", "bairro=?",
      "cidade=?", "uf=?", "cep=?", "notes=?"
    ];
    const params = [
      name, phone||null, email||null, cpf||null, ie||null, indIeDest,
      logradouro||null, numero||null, bairro||null,
      cidade||null, uf||null, cep||null, notes||null
    ];

    if (canManageFiado && (req.body.fiado_ativo !== undefined || req.body.fiado_limite !== undefined)) {
      fields.push("fiado_ativo=?", "fiado_limite=?");
      params.push(
        req.body.fiado_ativo ? 1 : 0,
        req.body.fiado_limite != null && req.body.fiado_limite !== "" ? toNumber(req.body.fiado_limite, null) : null
      );
    }
    params.push(req.params.id);

    run(`UPDATE clientes SET ${fields.join(", ")} WHERE id=?`, params);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.delete("/:id", auth(), authPermission("clientes.excluir"), (req, res, next) => {
  try {
    const c = getOne("SELECT id,name FROM clientes WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Cliente nao encontrado" });

    const osAtivas = getOne(
      "SELECT COUNT(*) AS n FROM ordens WHERE clienteid=? AND status NOT IN ('Entregue','Cancelado','Cancelada') AND deletedat IS NULL",
      [req.params.id]
    );
    if (osAtivas?.n > 0)
      return res.status(400).json({ error: `Cliente possui ${osAtivas.n} OS(s) ativas. Finalize-as antes de excluir.` });

    run(
      "UPDATE clientes SET deletedat=datetime('now','localtime'), deletedpor=? WHERE id=?",
      [req.user.id, req.params.id]
    );
    res.json({ ok: true, nome: c.name });
  } catch(e) { next(e); }
});

// GET /api/clientes/:id/credito
router.get("/:id/credito", auth(), authPermission("clientes.credito.ver"), (req, res, next) => {
  try {
    const service = createClienteCreditoService({ db: getDB() });
    res.json(service.getExtratoCredito(req.params.id));
  } catch (e) { next(e); }
});

// POST /api/clientes/:id/credito/saldo-inicial
router.post("/:id/credito/saldo-inicial", auth(), authPermission("clientes.credito.ajustar"), (req, res, next) => {
  try {
    const { valor, motivo } = req.body ?? {};
    const service = createClienteCreditoService({ db: getDB() });
    const result = service.lancarSaldoInicial({
      clienteId: req.params.id,
      valor,
      motivo,
      criadopor: req.user.id,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/clientes/:id/credito/ajuste
router.post("/:id/credito/ajuste", auth(), authPermission("clientes.credito.ajustar"), (req, res, next) => {
  try {
    const { tipo, valor, motivo } = req.body ?? {};
    const service = createClienteCreditoService({ db: getDB() });
    const result = service.lancarAjusteManual({
      clienteId: req.params.id,
      tipo,
      valor,
      motivo,
      criadopor: req.user.id,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/clientes/:id/credito/usar
router.post("/:id/credito/usar", auth(), authPermission("clientes.credito.usar"), (req, res, next) => {
  try {
    const { ordem_id, ordemId, valor } = req.body ?? {};
    const service = createClienteCreditoService({ db: getDB() });
    const result = service.usarCreditoOS({
      ordemId: ordem_id || ordemId,
      clienteId: req.params.id,
      valor,
      criadopor: req.user.id,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/clientes/:id/credito/devolver
router.post("/:id/credito/devolver", auth(), authPermission("clientes.credito.devolver"), (req, res, next) => {
  try {
    const { valor, pagamento } = req.body ?? {};
    const service = createClienteCreditoService({ db: getDB() });
    const result = service.devolverCredito({
      clienteId: req.params.id,
      valor,
      pagamento,
      criadopor: req.user.id,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/clientes/:id/credito/estornar/:movimentoId
router.post("/:id/credito/estornar/:movimentoId", auth(), authPermission("clientes.credito.ajustar"), (req, res, next) => {
  try {
    const service = createClienteCreditoService({ db: getDB() });
    const result = service.estornarMovimento({
      movimentoId: req.params.movimentoId,
      usuarioId: req.user.id,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/clientes/:id/conta-aberto
router.get("/:id/conta-aberto", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    const service = createClienteAcertoService({ db: getDB() });
    res.json(service.getContaEmAberto(req.params.id));
  } catch (e) { next(e); }
});

// POST /api/clientes/:id/acerto
router.post("/:id/acerto", auth(), authPermission("clientes.acerto.receber"), (req, res, next) => {
  try {
    const { pagamento, ordem_ids, valor_total_esperado } = req.body ?? {};
    const service = createClienteAcertoService({ db: getDB() });
    const result = service.receberAcerto({
      clienteId: req.params.id,
      pagamento,
      ordem_ids,
      valor_total_esperado,
      usuarioId: req.user.id,
    });
    res.json(result);
  } catch (e) {
    if (e.message && e.message.includes("Valores divergentes")) {
      return res.status(409).json({ code: "ACERTO_DESATUALIZADO", error: e.message });
    }
    res.status(400).json({ error: e.message });
  }
});

// POST /api/clientes/acertos/:acertoId/estornar
router.post("/acertos/:acertoId/estornar", auth(), authPermission("clientes.fiado.gerenciar"), (req, res, next) => {
  try {
    const service = createClienteAcertoService({ db: getDB() });
    const result = service.estornarAcerto({
      acertoId: req.params.acertoId,
      usuarioId: req.user.id,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/clientes/:id/cobranca/whatsapp
router.get("/:id/cobranca/whatsapp", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    const service = createClienteAcertoService({ db: getDB() });
    res.json(service.gerarMensagemCobranca({ clienteId: req.params.id }));
  } catch (e) { next(e); }
});

// GET /api/clientes/:id/conta-aberto/extrato
router.get("/:id/conta-aberto/extrato", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    const service = createClienteAcertoService({ db: getDB() });
    const conta = service.getContaEmAberto(req.params.id);
    const empresa = getOne("SELECT chave_pix FROM empresa_config WHERE id=1");
    const html = renderExtratoContaHtml({
      cliente: conta.cliente,
      ordens: conta.ordens,
      totalEmAberto: conta.totalEmAberto,
      chavePix: empresa?.chave_pix,
      usuario: req.user,
    });
    sendPrintHtml(res, `extrato-conta-${req.params.id}.html`, html);
  } catch (e) { next(e); }
});

// GET /api/clientes/acertos/:acertoId/recibo
router.get("/acertos/:acertoId/recibo", auth(), authPermission("clientes.ver"), (req, res, next) => {
  try {
    const acerto = getOne("SELECT * FROM cliente_acertos WHERE id=?", [req.params.acertoId]);
    if (!acerto) return res.status(404).json({ error: "Acerto não encontrado." });
    const cliente = getOne("SELECT * FROM clientes WHERE id=?", [acerto.clienteid]);
    const ordensQuitadas = getAll(
      `SELECT o.id, o.numero, o.servico, l.valor
       FROM lancamentos l
       JOIN ordens o ON o.id = l.ordemid
       WHERE l.acerto_id = ? AND l.deletedat IS NULL`,
      [req.params.acertoId]
    );
    const html = renderReciboAcertoHtml({
      cliente,
      acerto,
      ordensQuitadas,
      usuario: req.user,
    });
    sendPrintHtml(res, `recibo-acerto-${req.params.acertoId}.html`, html);
  } catch (e) { next(e); }
});

module.exports = router;
