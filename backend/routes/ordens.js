const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const { toNumber } = require("../utils/numbers");
const { hoje } = require("../utils/dates");
const { validarEntradaOS, validarStatus, validarPrazo, descricaoEntradaOS } = require("../domain/ordensRules");
const { descricaoRestanteOS } = require("../domain/ordensRules");
const { sendWhatsApp, sendWhatsAppConfirmacao } = require("../utils/whatsapp");

const SEL_ORDEM = `
  SELECT o.*,
    u.name AS criadopornome,
    o.servico AS tipo,
    o.valortotal AS valor,
    o.valorentrada AS entrada,
    o.clientetelefone AS clientecontato,
    o.prazoentrega AS prazo,
    o.observacoes AS obs,
    o.createdat AS criadoem,
    COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0) AS valorrecebido,
    CAST(o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0 AND l.deletedat IS NULL),0) AS REAL) AS saldoaberto
  FROM ordens o
  LEFT JOIN users u ON u.id=o.criadopor
`;

function nextNumero() {
  run("INSERT OR IGNORE INTO sequencias (nome, ultimo) VALUES ('os', 0)");
  const row = getOne(
    "UPDATE sequencias SET ultimo=ultimo+1 WHERE nome='os' RETURNING ultimo"
  );
  if (!row) throw new Error("Falha ao gerar número da OS: sequência 'os' não encontrada.");
  return `OS-${String(row.ultimo).padStart(4, "0")}`;
}

function getEntradaOS(ordemId) {
  return getOne(
    "SELECT * FROM lancamentos WHERE ordemid=? AND origem='entradaos' ORDER BY id DESC LIMIT 1",
    [ordemId]
  );
}

function resolveClienteData(clienteid, clientenome, telefoneFornecido, cpfFornecido) {
  let telefone = telefoneFornecido || null;
  let cpf = cpfFornecido || null;

  if (clienteid && (!telefone || !cpf)) {
    const cli = getOne("SELECT phone, cpf FROM clientes WHERE id=? LIMIT 1", [clienteid]);
    if (cli) {
      if (!telefone && cli.phone) telefone = cli.phone;
      if (!cpf && cli.cpf) cpf = cli.cpf;
    }
  }

  if (!telefone && clientenome) {
    const cli = getOne("SELECT phone, cpf FROM clientes WHERE name=? LIMIT 1", [clientenome]);
    if (cli) {
      if (!telefone && cli.phone) telefone = cli.phone;
      if (!cpf && cli.cpf) cpf = cli.cpf;
    }
  }

  return { telefone, cpf };
}

function maybeNotifyPronto(ordemId, statusAnterior, statusNovo) {
  if (statusAnterior === statusNovo) return;
  if (statusNovo !== 'Pronto') return;

  const os = getOne(SEL_ORDEM + " WHERE o.id=?", [ordemId]);
  if (!os) return;

  sendWhatsApp(os).catch(err => console.error('[WhatsApp] erro inesperado:', err.message));
}

// GET /api/ordens
router.get("/", auth(), (req, res, next) => {
  try {
    const { status, q, vencidas, lixeira } = req.query;
    const isLixeira = lixeira === "1" && req.user.role === "admin";

    let sql = SEL_ORDEM + (isLixeira ? " WHERE o.deletedat IS NOT NULL" : " WHERE o.deletedat IS NULL");
    const p = [];

    if (!isLixeira) {
      if (status && status !== "todos") {
        sql += " AND o.status=?";
        p.push(status);
      }
      if (vencidas == "1") {
        sql += " AND o.prazoentrega < ? AND o.status NOT IN ('Pronto','Entregue','Cancelado','Cancelada')";
        p.push(hoje());
      }
    }

    if (q) {
      sql += " AND (o.numero LIKE ? OR o.clientenome LIKE ? OR o.servico LIKE ?)";
      const search = `%${q}%`;
      p.push(search, search, search);
    }

    sql += " ORDER BY o.id DESC";
    res.json(getAll(sql, p));
  } catch(e) { next(e); }
});

// GET /api/ordens/:id
router.get("/:id", auth(), (req, res, next) => {
  try {
    const o = getOne(SEL_ORDEM + " WHERE o.id=?", [req.params.id]);
    if (!o) return res.status(404).json({ error: "Nao encontrado" });

    const logs = getAll(
      "SELECT sl.*, u.name AS usuarionome FROM statuslog sl LEFT JOIN users u ON u.id=sl.usuarioid WHERE sl.ordemid=? ORDER BY sl.createdat ASC",
      [req.params.id]
    );

    res.json({ ...o, logs });
  } catch(e) { next(e); }
});

// POST /api/ordens
router.post("/", auth(["admin","caixa"]), (req, res, next) => {
  const {
    clienteid, clientenome, clientetelefone, clientecpf,
    servico, descricao, valortotal, valorentrada,
    prazoentrega, prioridade, pagamento, observacoes
  } = req.body ?? {};

  if (!clientenome || !servico || valortotal == null)
    return res.status(400).json({ error: "clientenome, servico e valortotal sao obrigatorios" });

  const total = toNumber(valortotal);
  const entrada = toNumber(valorentrada);

  const erroEntrada = validarEntradaOS(total, entrada);
  if (erroEntrada) return res.status(400).json({ error: erroEntrada });

  const erroPrazo = validarPrazo(prazoentrega);
  if (erroPrazo) return res.status(400).json({ error: erroPrazo });

  let cidResolvido = clienteid || null;
  if (!cidResolvido && clientenome) {
    const cli = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [clientenome]);
    if (cli) cidResolvido = cli.id;
  }

  const { telefone: telFinal, cpf: cpfFinal } = resolveClienteData(
    cidResolvido, clientenome, clientetelefone, clientecpf
  );

  try {
    const result = transaction(() => {
      const numero = nextNumero();
      const id = runInsert(
        `INSERT INTO ordens (numero,clienteid,clientenome,clientetelefone,clientecpf,servico,descricao,
        valortotal,valorentrada,prazoentrega,prioridade,pagamento,observacoes,status,criadopor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero, cidResolvido, clientenome, telFinal, cpfFinal, servico, descricao||null, total, entrada,
         prazoentrega||null, prioridade||"Normal", pagamento||"Pix", observacoes||null, "Aguardando", req.user.id]
      );

      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [id, null, "Aguardando", req.user.id, "Ordem criada"]
      );

      const desc = descricaoEntradaOS(numero, clientenome, servico, total, entrada);
      runInsert(
        `INSERT INTO lancamentos (data,tipo,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?)`,
        [hoje(), servico||"Diversos", desc, pagamento||"Pix", entrada, 1, id, req.user.id, "entradaos"]
      );

      return { id, numero };
    });

    res.json(result);
  } catch(e) {
    console.error("[POST /api/ordens]", e.message);
    if (e.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "Conflito ao gerar numero da OS. Tente novamente." });
    }
    next(e);
  }
});

// PUT /api/ordens/:id
router.put("/:id", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const old = getOne("SELECT * FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado ou OS cancelada" });

    const {
      status, descricao, valortotal, valorentrada,
      prazoentrega, prioridade, pagamento, observacoes,
      clientenome, clientetelefone, clientecpf, servico, clienteid
    } = req.body ?? {};

    if (req.user.role === "oficina") {
      if (!status) return res.status(400).json({ error: "Informe o status" });
      const erroStatus = validarStatus(status, old.status);
      if (erroStatus) return res.status(400).json({ error: erroStatus });

      transaction(() => {
        run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
        if (status !== old.status)
          runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid) VALUES (?,?,?,?)", [req.params.id, old.status, status, req.user.id]);
      });

      maybeNotifyPronto(req.params.id, old.status, status);
      return res.json({ ok: true });
    }

    const total = toNumber(valortotal ?? old.valortotal);
    const entrada = toNumber(valorentrada ?? old.valorentrada);

    const erroEntrada = validarEntradaOS(total, entrada);
    if (erroEntrada) return res.status(400).json({ error: erroEntrada });

    const novoPrazo = (prazoentrega !== undefined && prazoentrega !== '')
      ? prazoentrega
      : (prazoentrega === '' ? null : old.prazoentrega);
    const erroPrazo = validarPrazo(novoPrazo !== old.prazoentrega ? novoPrazo : null);
    if (erroPrazo) return res.status(400).json({ error: erroPrazo });

    const ns = status || old.status;
    const novoCliente = clientenome || old.clientenome;
    const novoServico = servico || old.servico;
    const novoPagamento = pagamento || old.pagamento || "Pix";

    if (status && status !== old.status) {
      const erroStatus = validarStatus(status, old.status);
      if (erroStatus) return res.status(400).json({ error: erroStatus });
    }

    let novoCid = clienteid !== undefined ? (clienteid || null) : old.clienteid;
    if (!novoCid && novoCliente) {
      const cli = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [novoCliente]);
      if (cli) novoCid = cli.id;
    }

    const telInput = clientetelefone !== undefined ? clientetelefone : old.clientetelefone;
    const cpfInput = clientecpf !== undefined ? clientecpf : old.clientecpf;

    const { telefone: telFinal, cpf: cpfFinal } = resolveClienteData(
      novoCid, novoCliente, telInput, cpfInput
    );

    transaction(() => {
      run(
        `UPDATE ordens SET clienteid=?,clientenome=?,clientetelefone=?,clientecpf=?,servico=?,descricao=?,
        valortotal=?,valorentrada=?,prazoentrega=?,prioridade=?,pagamento=?,
        observacoes=?,status=?,updatedat=datetime('now','localtime') WHERE id=?`,
        [novoCid, novoCliente, telFinal, cpfFinal, novoServico, descricao !== undefined ? descricao : old.descricao,
         total, entrada, novoPrazo, prioridade||old.prioridade, novoPagamento,
         observacoes !== undefined ? observacoes : old.observacoes, ns, req.params.id]
      );

      if (ns !== old.status)
        runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid) VALUES (?,?,?,?)", [req.params.id, old.status, ns, req.user.id]);

      const entradaOS = getEntradaOS(req.params.id);
      const entradaDesc = descricaoEntradaOS(old.numero, novoCliente, novoServico, total, entrada);

      if (entradaOS) {
        run("UPDATE lancamentos SET tipo=?,descricao=?,pagamento=?,valor=?,pago=1 WHERE id=?", [novoServico||"Diversos", entradaDesc, novoPagamento, entrada, entradaOS.id]);
      } else {
        runInsert(
          `INSERT INTO lancamentos (data,tipo,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?)`,
          [hoje(), novoServico||"Diversos", entradaDesc, novoPagamento, entrada, 1, req.params.id, req.user.id, "entradaos"]
        );
      }
    });

    maybeNotifyPronto(req.params.id, old.status, ns);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// PATCH /api/ordens/:id/status
router.patch("/:id/status", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const { status, obs } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status obrigatorio" });

    const old = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado" });

    const erroStatus = validarStatus(status, old.status);
    if (erroStatus) return res.status(400).json({ error: erroStatus });

    // fix: bloqueia entrega com saldo aberto
    if (status === 'Entregue') {
      const { getResumoFinanceiroOS } = require('../domain/financeiroRules');
      const resumo = getResumoFinanceiroOS(req.params.id);
      if (resumo && resumo.saldo > 0.01) {
        return res.status(400).json({
          error: `OS possui saldo aberto de R$ ${resumo.saldo.toFixed(2)}. Quite antes de entregar.`
        });
      }
    }

    transaction(() => {
      run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, old.status, status, req.user.id, obs||null]
      );
    });

    maybeNotifyPronto(req.params.id, old.status, status);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// POST /api/ordens/:id/whatsapp-confirmacao
router.post("/:id/whatsapp-confirmacao", auth(["admin","caixa"]), async (req, res, next) => {
  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    if (!os.clientetelefone && !os.clientecontato && os.clienteid) {
      const cli = getOne("SELECT phone FROM clientes WHERE id=? LIMIT 1", [os.clienteid]);
      if (cli?.phone) os.clientetelefone = cli.phone;
    }

    const result = await sendWhatsAppConfirmacao(os);
    if (result.ok) {
      res.json({ ok: true, phone: result.phone });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch(e) { next(e); }
});

// DELETE /api/ordens/:id
router.delete("/:id", auth(["admin"]), (req, res, next) => {
  try {
    const os = getOne("SELECT id,numero,status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada ou ja excluida." });

    const reason = req.body?.reason || null;

    transaction(() => {
      run(
        `UPDATE ordens SET deletedat=datetime('now','localtime'), deletedpor=?, deletedreason=?, updatedat=datetime('now','localtime') WHERE id=?`,
        [req.user.id, reason, req.params.id]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, os.status || null, "Excluida", req.user.id, reason || "Exclusao pelo administrador"]
      );
    });

    res.json({ ok: true, numero: os.numero });
  } catch(e) { next(e); }
});

// POST /api/ordens/:id/restaurar
router.post("/:id/restaurar", auth(["admin"]), (req, res, next) => {
  try {
    const os = getOne("SELECT id,numero,status FROM ordens WHERE id=? AND deletedat IS NOT NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada na lixeira." });

    transaction(() => {
      run(
        `UPDATE ordens SET deletedat=NULL, deletedpor=NULL, deletedreason=NULL, updatedat=datetime('now','localtime') WHERE id=?`,
        [req.params.id]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, "Excluida", os.status, req.user.id, "OS restaurada da lixeira"]
      );
    });

    res.json({ ok: true, numero: os.numero });
  } catch(e) { next(e); }
});

module.exports = router;
