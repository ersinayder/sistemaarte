const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const { toNumber } = require("../utils/numbers");
const { hoje } = require("../utils/dates");
const { validarEntradaOS, validarStatus, descricaoEntradaOS } = require("../domain/ordensRules");
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
    CAST(o.valortotal - o.valorentrada AS REAL) AS valorrestante,
    COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0),0) AS valorrecebido,
    CAST(o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.valor>0),0) AS REAL) AS saldoaberto
  FROM ordens o
  LEFT JOIN users u ON u.id=o.criadopor
`;

function nextNumero() {
  const row = getOne("SELECT MAX(CAST(SUBSTR(numero,4) AS INTEGER)) AS maxn FROM ordens");
  const n = (row?.maxn ?? 0) + 1;
  return `OS-${String(n).padStart(4, "0")}`;
}

function getEntradaOS(ordemId) {
  return getOne(
    "SELECT * FROM lancamentos WHERE ordemid=? AND origem='entradaos' ORDER BY id DESC LIMIT 1",
    [ordemId]
  );
}

function maybeNotifyPronto(ordemId, statusAnterior, statusNovo) {
  if (statusAnterior === statusNovo) return;
  if (statusNovo !== 'Pronto') return;
  const os = getOne(SEL_ORDEM + " WHERE o.id=?", [ordemId]);
  if (!os) return;
  sendWhatsApp(os).catch(err => console.error('[WhatsApp] erro inesperado:', err.message));
}

// GET /api/ordens
router.get("/", auth(), (req, res) => {
  const { status, q, vencidas, lixeira } = req.query;
  const isLixeira = lixeira === "1" && req.user.role === "admin";

  let sql = SEL_ORDEM + (isLixeira
    ? " WHERE o.deletedat IS NOT NULL"
    : " WHERE o.deletedat IS NULL");
  const p = [];

  if (!isLixeira) {
    if (status && status !== "todos") { sql += " AND o.status=?"; p.push(status); }
    if (vencidas == "1") { sql += " AND o.prazoentrega<? AND o.status NOT IN ('Entregue','Cancelado','Pronto')"; p.push(hoje()); }
  }
  if (q) {
    sql += " AND (o.clientenome LIKE ? OR o.numero LIKE ? OR o.servico LIKE ? OR COALESCE(o.descricao,'') LIKE ?)";
    const lk = `%${q}%`; p.push(lk,lk,lk,lk);
  }
  sql += " ORDER BY o.createdat DESC, o.id DESC";
  res.json(getAll(sql, p));
});

// GET /api/ordens/:id
router.get("/:id", auth(), (req, res) => {
  const o = getOne(SEL_ORDEM + " WHERE o.id=?", [req.params.id]);
  if (!o) return res.status(404).json({ error: "Nao encontrado" });
  const logs = getAll(
    "SELECT sl.*, u.name AS usuarionome FROM statuslog sl LEFT JOIN users u ON u.id=sl.usuarioid WHERE sl.ordemid=? ORDER BY sl.createdat ASC",
    [req.params.id]
  );
  res.json({ ...o, logs });
});

// POST /api/ordens
router.post("/", auth(["admin","caixa"]), (req, res) => {
  const { clienteid, clientenome, clientetelefone, clientecpf, servico,
          descricao, valortotal, valorentrada, prazoentrega,
          prioridade, pagamento, observacoes } = req.body ?? {};

  if (!clientenome || !servico || valortotal == null)
    return res.status(400).json({ error: "clientenome, servico e valortotal sao obrigatorios" });

  const total   = toNumber(valortotal);
  const entrada = toNumber(valorentrada);
  const erroEntrada = validarEntradaOS(total, entrada);
  if (erroEntrada) return res.status(400).json({ error: erroEntrada });

  let cidResolvido = clienteid || null;
  if (!cidResolvido && clientenome) {
    const cli = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [clientenome]);
    if (cli) cidResolvido = cli.id;
  }

  try {
    const result = transaction(() => {
      const numero = nextNumero();
      const id = runInsert(
        `INSERT INTO ordens
          (numero,clienteid,clientenome,clientetelefone,clientecpf,servico,descricao,
           valortotal,valorentrada,prazoentrega,prioridade,pagamento,observacoes,status,criadopor)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero, cidResolvido, clientenome, clientetelefone||null, clientecpf||null,
         servico, descricao||null, total, entrada,
         prazoentrega||null, prioridade||"Normal", pagamento||"Pix", observacoes||null,
         "Aguardando", req.user.id]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [id, null, "Aguardando", req.user.id, "Ordem criada"]
      );
      const desc = descricaoEntradaOS(numero, clientenome, servico, total, entrada);
      runInsert(
        `INSERT INTO lancamentos (data,tipo,descricao,pagamento,valor,pago,ordemid,criadopor,origem)
         VALUES (?,?,?,?,?,?,?,?,?)`,
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
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/ordens/:id
router.put("/:id", auth(["admin","caixa","oficina"]), (req, res) => {
  try {
    const old = getOne("SELECT * FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado ou OS cancelada" });

    const { status, descricao, valortotal, valorentrada, prazoentrega,
            prioridade, pagamento, observacoes, clientenome, clientetelefone,
            clientecpf, servico, clienteid } = req.body ?? {};

    if (req.user.role === "oficina") {
      if (!status) return res.status(400).json({ error: "Informe o status" });
      const erroStatus = validarStatus(status);
      if (erroStatus) return res.status(400).json({ error: erroStatus });
      transaction(() => {
        run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
        if (status !== old.status)
          runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid) VALUES (?,?,?,?)",
            [req.params.id, old.status, status, req.user.id]);
      });
      maybeNotifyPronto(req.params.id, old.status, status);
      return res.json({ ok: true });
    }

    const total   = toNumber(valortotal ?? old.valortotal);
    const entrada = toNumber(valorentrada ?? old.valorentrada);
    const erroEntrada = validarEntradaOS(total, entrada);
    if (erroEntrada) return res.status(400).json({ error: erroEntrada });

    const ns            = status || old.status;
    const novoCliente   = clientenome || old.clientenome;
    const novoServico   = servico || old.servico;
    const novoPagamento = pagamento || old.pagamento || "Pix";

    let novoCid = clienteid !== undefined ? (clienteid || null) : old.clienteid;
    if (!novoCid && novoCliente) {
      const cli = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [novoCliente]);
      if (cli) novoCid = cli.id;
    }

    transaction(() => {
      run(
        `UPDATE ordens SET
          clienteid=?,clientenome=?,clientetelefone=?,clientecpf=?,servico=?,descricao=?,
          valortotal=?,valorentrada=?,prazoentrega=?,prioridade=?,pagamento=?,
          observacoes=?,status=?,updatedat=datetime('now','localtime')
         WHERE id=?`,
        [novoCid, novoCliente, clientetelefone||old.clientetelefone, clientecpf||old.clientecpf,
         novoServico, descricao !== undefined ? descricao : old.descricao,
         total, entrada, prazoentrega||old.prazoentrega, prioridade||old.prioridade,
         novoPagamento, observacoes !== undefined ? observacoes : old.observacoes,
         ns, req.params.id]
      );
      if (ns !== old.status)
        runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid) VALUES (?,?,?,?)",
          [req.params.id, old.status, ns, req.user.id]);

      const entradaOS = getEntradaOS(req.params.id);
      const entradaDesc = descricaoEntradaOS(old.numero, novoCliente, novoServico, total, entrada);
      if (entradaOS) {
        run("UPDATE lancamentos SET tipo=?,descricao=?,pagamento=?,valor=?,pago=1 WHERE id=?",
          [novoServico||"Diversos", entradaDesc, novoPagamento, entrada, entradaOS.id]);
      } else {
        runInsert(
          `INSERT INTO lancamentos (data,tipo,descricao,pagamento,valor,pago,ordemid,criadopor,origem)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [hoje(), novoServico||"Diversos", entradaDesc, novoPagamento, entrada, 1, req.params.id, req.user.id, "entradaos"]
        );
      }
    });
    maybeNotifyPronto(req.params.id, old.status, ns);
    res.json({ ok: true });
  } catch(e) {
    console.error("[PUT /api/ordens/:id]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/ordens/:id/status
router.patch("/:id/status", auth(["admin","caixa","oficina"]), (req, res) => {
  try {
    const { status, obs } = req.body ?? {};
    if (!status) return res.status(400).json({ error: "status obrigatorio" });
    const erroStatus = validarStatus(status);
    if (erroStatus) return res.status(400).json({ error: erroStatus });
    const old = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado" });
    transaction(() => {
      run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, old.status, status, req.user.id, obs||null]
      );
    });
    maybeNotifyPronto(req.params.id, old.status, status);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ordens/:id/whatsapp-confirmacao
router.post("/:id/whatsapp-confirmacao", auth(["admin","caixa"]), async (req, res) => {
  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });
    const result = await sendWhatsAppConfirmacao(os);
    if (result.ok) {
      res.json({ ok: true, phone: result.phone });
    } else {
      res.status(400).json({ ok: false, error: result.error });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/ordens/:id  — SOFT DELETE (admin only)
router.delete("/:id", auth(["admin"]), (req, res) => {
  try {
    const os = getOne("SELECT id,numero,status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada ou ja excluida." });
    const reason = req.body?.reason || null;
    transaction(() => {
      run(
        `UPDATE ordens SET
          deletedat=datetime('now','localtime'),
          deletedpor=?,
          deletedreason=?,
          updatedat=datetime('now','localtime')
         WHERE id=?`,
        [req.user.id, reason, req.params.id]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, os.status || null, "Excluida", req.user.id, reason || "Exclusao pelo administrador"]
      );
    });
    res.json({ ok: true, numero: os.numero });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ordens/:id/restaurar
router.post("/:id/restaurar", auth(["admin"]), (req, res) => {
  try {
    const os = getOne("SELECT id,numero,status FROM ordens WHERE id=? AND deletedat IS NOT NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada na lixeira." });
    transaction(() => {
      run(
        `UPDATE ordens SET deletedat=NULL, deletedpor=NULL, deletedreason=NULL,
          updatedat=datetime('now','localtime') WHERE id=?`,
        [req.params.id]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, "Excluida", os.status, req.user.id, "OS restaurada da lixeira"]
      );
    });
    res.json({ ok: true, numero: os.numero });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
