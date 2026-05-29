const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const { toNumber } = require("../utils/numbers");
const { hoje } = require("../utils/dates");
const {
  validarEntradaOS, validarStatus, validarPrazo, normalizarStatus,
  descricaoEntradaOS, descricaoRestanteOS
} = require("../domain/ordensRules");
const { sendWhatsAppConfirmacao } = require("../utils/whatsapp");
const { getResumoFinanceiroOS } = require('../domain/financeiroRules');
const { normalizarPaginacao, montarMetaPaginacao } = require("../domain/paginationRules");
const {
  normalizarTipoAviso,
  normalizarStatusAviso,
  normalizarTelefoneWhatsapp,
  podeUsarAviso,
  avisoDisponivelParaOrdem,
  montarMensagemAviso,
  validarTransicaoAviso,
} = require("../domain/whatsappAvisosRules");

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
    COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0) AS valorrecebido,
    CASE
      WHEN (o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0)) < 0
      THEN 0.0
      ELSE CAST(o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0) AS REAL)
    END AS saldoaberto,
    COALESCE((SELECT GROUP_CONCAT(oi.nome, ', ') FROM ordem_itens oi WHERE oi.ordemid=o.id ORDER BY oi.id), '') AS itens_resumo
  FROM ordens o
  LEFT JOIN users u ON u.id=o.criadopor
`;

function nextNumero() {
  run("INSERT OR IGNORE INTO sequencias (nome, ultimo) VALUES ('os', 0)");
  const row = getOne(
    "UPDATE sequencias SET ultimo=ultimo+1 WHERE nome='os' RETURNING ultimo"
  );
  if (!row) throw new Error("Falha ao gerar numero da OS.");
  return `OS-${String(row.ultimo).padStart(4, "0")}`;
}

function getEntradaOS(ordemId) {
  return getOne(
    "SELECT * FROM lancamentos WHERE ordemid=? AND origem='entradaos' AND deletedat IS NULL ORDER BY id DESC LIMIT 1",
    [ordemId]
  );
}

function normalizarNomeClienteBusca(clientenome) {
  return String(clientenome ?? "").trim().slice(0, 200);
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
  const nomeBusca = normalizarNomeClienteBusca(clientenome);
  if ((!telefone || !cpf) && nomeBusca) {
    const cli = getOne("SELECT phone, cpf FROM clientes WHERE name=? LIMIT 1", [nomeBusca]);
    if (cli) {
      if (!telefone && cli.phone) telefone = cli.phone;
      if (!cpf && cli.cpf) cpf = cli.cpf;
    }
  }
  return { telefone, cpf };
}

function garantirAvisoPendente(ordemId, tipo) {
  run(
    `INSERT OR IGNORE INTO whatsapp_avisos (ordemid, tipo, status, updatedat)
     VALUES (?, ?, 'pendente', datetime('now','localtime'))`,
    [ordemId, tipo]
  );
}

function garantirAvisoPronto(ordemId, statusAnterior, statusNovo) {
  if (statusAnterior === statusNovo || statusNovo !== 'Pronto') return;
  garantirAvisoPendente(ordemId, 'pedido_pronto');
}

function maybeNotifyPronto(ordemId, statusAnterior, statusNovo) {
  garantirAvisoPronto(ordemId, statusAnterior, statusNovo);
}

function isValidDate(d) {
  if (!d || typeof d !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function saveItens(ordemId, produtos) {
  run("DELETE FROM ordem_itens WHERE ordemid=?", [ordemId]);
  if (!Array.isArray(produtos) || produtos.length === 0) return;
  for (const p of produtos) {
    const nome = (p.nome || '').trim();
    if (!nome) continue;
    const qty   = Number(p.quantidade || 1);
    const preco = Math.max(0, Number(p.preco_unitario || p.preco || 0));
    const avulso = p.avulso ? 1 : 0;
    const pid = p.produto_id ? Number(p.produto_id) : null;
    runInsert(
      `INSERT INTO ordem_itens (ordemid, produto_id, nome, quantidade, preco_unitario, avulso) VALUES (?,?,?,?,?,?)`,
      [ordemId, pid, nome, qty, preco, avulso]
    );
  }
}

function buscarOrdemAviso(ordemId) {
  return getOne(`${SEL_ORDEM} WHERE o.id=? AND o.deletedat IS NULL`, [ordemId]);
}

function buscarAviso(ordemId, tipo) {
  return getOne(
    `SELECT * FROM whatsapp_avisos WHERE ordemid=? AND tipo=? LIMIT 1`,
    [ordemId, tipo]
  );
}

function listarAvisos(ordemIds) {
  if (!ordemIds.length) return [];
  const placeholders = ordemIds.map(() => '?').join(',');
  return getAll(
    `SELECT * FROM whatsapp_avisos WHERE ordemid IN (${placeholders})`,
    ordemIds
  );
}

function projetarAviso(row) {
  if (!row) return null;
  return {
    id: row.id,
    ordemid: row.ordemid,
    tipo: row.tipo,
    status: row.status || 'pendente',
    aberto_em: row.aberto_em || null,
    enviado_em: row.enviado_em || null,
    ignorado_em: row.ignorado_em || null,
    updatedat: row.updatedat || null,
  };
}

function avisoVirtual(ordem, tipo, role, avisosPorChave) {
  const existente = avisosPorChave.get(`${ordem.id}:${tipo}`);
  if (!podeUsarAviso(role, tipo)) return null;
  if (existente) {
    const projetado = projetarAviso(existente);
    if (['enviado', 'ignorado'].includes(projetado.status)) return projetado;
    const disponibilidade = avisoDisponivelParaOrdem(ordem, tipo, role);
    return disponibilidade.ok ? projetado : null;
  }
  const disponibilidade = avisoDisponivelParaOrdem(ordem, tipo, role);
  if (!disponibilidade.ok) return null;
  return { ordemid: ordem.id, tipo, status: 'pendente', virtual: true };
}

function redactOrdemForRole(row, role) {
  if (role !== 'oficina') return row;
  const {
    clientetelefone,
    clientecontato,
    clientecpf,
    valortotal,
    valorentrada,
    valor,
    entrada,
    valorrecebido,
    saldoaberto,
    pagamento,
    nfe_status,
    nfe_chave,
    nfe_protocolo,
    nfe_numero,
    nfe_serie,
    nfe_emitida_em,
    nfe_xml,
    nfe_rejeicao_motivo,
    nfe_cancelado_em,
    nfe_cancel_protocolo,
    nfe_cancel_motivo,
    ...safe
  } = row;
  return safe;
}

function redactItensForRole(itens, role) {
  if (role !== 'oficina') return itens;
  return itens.map(({ preco_unitario, subtotal, ...item }) => item);
}

function anexarAvisosWhatsApp(rows, role) {
  const ordemIds = rows.map((row) => row.id).filter(Boolean);
  const avisos = listarAvisos(ordemIds);
  const avisosPorChave = new Map(avisos.map((aviso) => [`${aviso.ordemid}:${aviso.tipo}`, aviso]));

  return rows.map((row) => {
    const confirmacao = avisoVirtual(row, 'confirmacao_pedido', role, avisosPorChave);
    const pronto = avisoVirtual(row, 'pedido_pronto', role, avisosPorChave);
    const whatsappAvisos = {
      confirmacao_pedido: confirmacao,
      pedido_pronto: pronto,
    };
    const whatsappAvisoPrincipal = pronto && ['pendente', 'aberto'].includes(pronto.status)
      ? pronto
      : confirmacao && ['pendente', 'aberto'].includes(confirmacao.status)
        ? confirmacao
        : pronto || confirmacao;
    return { ...redactOrdemForRole(row, role), whatsappAvisos, whatsappAvisoPrincipal };
  });
}

function salvarAvisoAberto(ordemId, tipo, phone, text, userId) {
  run(
    `INSERT INTO whatsapp_avisos
       (ordemid, tipo, status, telefone_snapshot, mensagem_snapshot, aberto_por, aberto_em, updatedat)
     VALUES (?, ?, 'aberto', ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
     ON CONFLICT(ordemid, tipo) DO UPDATE SET
       status=CASE
         WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.status
         ELSE 'aberto'
       END,
       telefone_snapshot=excluded.telefone_snapshot,
       mensagem_snapshot=excluded.mensagem_snapshot,
       aberto_por=excluded.aberto_por,
       aberto_em=COALESCE(whatsapp_avisos.aberto_em, excluded.aberto_em),
       updatedat=datetime('now','localtime')`,
    [ordemId, tipo, phone, text, userId]
  );
  return buscarAviso(ordemId, tipo);
}

// GET /api/ordens
router.get("/", auth(), (req, res, next) => {
  try {
    const { status, q, vencidas, lixeira, tipo } = req.query;
    const querPaginacao = req.query.page !== undefined || req.query.limit !== undefined;
    const { page, limit, offset } = normalizarPaginacao(req.query, { defaultLimit: 14, maxLimit: 100 });
    const isLixeira = lixeira === "1" && req.user.role === "admin";
    const where = [isLixeira ? "o.deletedat IS NOT NULL" : "o.deletedat IS NULL"];
    const p = [];
    if (!isLixeira) {
      if (status && status !== "todos") { where.push("o.status=?"); p.push(status); }
      if (tipo && tipo !== "todos") { where.push("o.servico=?"); p.push(tipo); }
      if (vencidas == "1") {
        where.push("o.prazoentrega < ? AND o.status NOT IN ('Pronto','Entregue','Cancelado')");
        p.push(hoje());
      }
    }
    if (q) {
      where.push(`(o.numero LIKE ? OR o.clientenome LIKE ? OR o.servico LIKE ? OR o.observacoes LIKE ? OR o.descricao LIKE ?
        OR EXISTS (SELECT 1 FROM ordem_itens oi WHERE oi.ordemid=o.id AND oi.nome LIKE ?))`);
      const s = `%${q}%`;
      p.push(s, s, s, s, s, s);
    }
    const whereSql = ` WHERE ${where.join(" AND ")}`;
    if (!querPaginacao) {
      const rows = getAll(`${SEL_ORDEM}${whereSql} ORDER BY o.id DESC`, p);
      return res.json(anexarAvisosWhatsApp(rows, req.user.role));
    }
    const total = getOne(`SELECT COUNT(*) AS total FROM ordens o${whereSql}`, p)?.total ?? 0;
    const rows = getAll(`${SEL_ORDEM}${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
    res.json({
      data: anexarAvisosWhatsApp(rows, req.user.role),
      meta: montarMetaPaginacao({ page, limit, total }),
    });
  } catch(e) { next(e); }
});

// GET /api/ordens/:id
router.get("/:id", auth(), (req, res, next) => {
  try {
    const o = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!o) return res.status(404).json({ error: "Nao encontrado" });
    const logs = getAll(
      "SELECT sl.*, u.name AS usuarionome FROM statuslog sl LEFT JOIN users u ON u.id=sl.usuarioid WHERE sl.ordemid=? ORDER BY sl.createdat ASC",
      [req.params.id]
    );
    const itens = getAll(
      "SELECT * FROM ordem_itens WHERE ordemid=? ORDER BY id ASC",
      [req.params.id]
    );
    const lancamentos = getAll(
      `SELECT l.*, u.name AS usuarionome FROM lancamentos l
       LEFT JOIN users u ON u.id=l.criadopor
       WHERE l.ordemid=? AND l.deletedat IS NULL
       ORDER BY l.createdat ASC, l.id ASC`,
      [req.params.id]
    );
    res.json({
      ...redactOrdemForRole(o, req.user.role),
      logs,
      itens: redactItensForRole(itens, req.user.role),
      lancamentos: req.user.role === 'oficina' ? [] : lancamentos,
    });
  } catch(e) { next(e); }
});

// POST /api/ordens
router.post("/", auth(["admin","caixa"]), (req, res, next) => {
  const {
    clienteid, clientenome, clientetelefone, clientecpf,
    servico, descricao, valortotal, valorentrada,
    prazoentrega, prioridade, pagamento, observacoes, dataEntrada,
    produtos,
  } = req.body ?? {};

  if (!clientenome || !servico || valortotal == null)
    return res.status(400).json({ error: "clientenome, servico e valortotal sao obrigatorios" });

  const total = toNumber(valortotal);
  const entrada = toNumber(valorentrada);

  const erroEntrada = validarEntradaOS(total, entrada);
  if (erroEntrada) return res.status(400).json({ error: erroEntrada });

  const erroPrazo = validarPrazo(prazoentrega);
  if (erroPrazo) return res.status(400).json({ error: erroPrazo });

  const dataLanc = (dataEntrada && isValidDate(dataEntrada)) ? dataEntrada : hoje();
  const createdatOS = `${dataLanc} 00:00:00`;

  let cidResolvido = clienteid || null;
  const nomeBusca = normalizarNomeClienteBusca(clientenome);
  if (!cidResolvido && nomeBusca) {
    const cli = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [nomeBusca]);
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
        valortotal,valorentrada,prazoentrega,prioridade,pagamento,observacoes,status,criadopor,createdat) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero, cidResolvido, clientenome, telFinal, cpfFinal, servico, descricao||null, total, entrada,
         prazoentrega||null, prioridade||"Normal", pagamento||"Pix", observacoes||null, "Aguardando", req.user.id, createdatOS]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [id, null, "Aguardando", req.user.id, "Ordem criada"]
      );
      garantirAvisoPendente(id, 'confirmacao_pedido');
      saveItens(id, produtos);
      if (entrada > 0) {
        const desc = descricaoEntradaOS(numero, clientenome, servico, total, entrada);
        runInsert(
          `INSERT INTO lancamentos (data,tipo,categoria,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [dataLanc, "Entrada", servico||"Diversos", desc, pagamento||"Pix", entrada, 1, id, req.user.id, "entradaos"]
        );
      }
      return { id, numero };
    });
    res.json(result);
  } catch(e) {
    console.error("[POST /api/ordens]", e.message);
    if (e.message?.includes("UNIQUE"))
      return res.status(409).json({ error: "Conflito ao gerar numero da OS. Tente novamente." });
    next(e);
  }
});

// PUT /api/ordens/:id
router.put("/:id", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const old = getOne("SELECT * FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado ou OS cancelada" });

    const {
      descricao, valortotal, valorentrada,
      prazoentrega, prioridade, pagamento, observacoes,
      clientenome, clientetelefone, clientecpf, servico, clienteid,
      produtos,
    } = req.body ?? {};

    const statusRaw = req.body?.status;
    const status = statusRaw ? normalizarStatus(statusRaw) : null;

    if (req.user.role === "oficina") {
      if (!status) return res.status(400).json({ error: "Informe o status" });
      if (status === 'Cancelado') return res.status(403).json({ error: "Oficina nao pode cancelar OS." });
      const erroStatus = validarStatus(status, old.status);
      if (erroStatus) return res.status(400).json({ error: erroStatus });
      if (status === 'Entregue') {
        const resumo = getResumoFinanceiroOS(req.params.id);
        if (resumo && resumo.saldo > 0.01)
          return res.status(400).json({ error: `Saldo aberto: R$ ${resumo.saldo.toFixed(2)}. Quite antes de entregar.` });
      }
      transaction(() => {
        const current = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
        if (!current) throw new Error("OS nao encontrada");
        run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
        if (status !== current.status)
          runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid) VALUES (?,?,?,?)",
            [req.params.id, current.status, status, req.user.id]);
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
    if (novoPrazo !== null) {
      const erroPrazo = validarPrazo(novoPrazo);
      if (erroPrazo) return res.status(400).json({ error: erroPrazo });
    }

    const ns = status || old.status;
    const novoCliente = clientenome || old.clientenome;
    const novoServico = servico || old.servico;
    const novoPagamento = pagamento || old.pagamento || "Pix";

    if (status && status !== old.status) {
      const erroStatus = validarStatus(status, old.status);
      if (erroStatus) return res.status(400).json({ error: erroStatus });
    }

    let novoCid = clienteid !== undefined ? (clienteid || null) : old.clienteid;
    const nomeBusca = normalizarNomeClienteBusca(novoCliente);
    if (!novoCid && nomeBusca) {
      const cli = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [nomeBusca]);
      if (cli) novoCid = cli.id;
    }

    const telInput = clientetelefone !== undefined ? clientetelefone : old.clientetelefone;
    const cpfInput = clientecpf !== undefined ? clientecpf : old.clientecpf;
    const { telefone: telFinal, cpf: cpfFinal } = resolveClienteData(novoCid, novoCliente, telInput, cpfInput);

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
        runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid) VALUES (?,?,?,?)",
          [req.params.id, old.status, ns, req.user.id]);
      if (Array.isArray(produtos)) saveItens(req.params.id, produtos);
      const entradaOS = getEntradaOS(req.params.id);
      const entradaDesc = descricaoEntradaOS(old.numero, novoCliente, novoServico, total, entrada);
      if (entradaOS) {
        if (entrada > 0) {
          run("UPDATE lancamentos SET tipo='Entrada',categoria=?,descricao=?,pagamento=?,valor=?,pago=1 WHERE id=?",
            [novoServico||"Diversos", entradaDesc, novoPagamento, entrada, entradaOS.id]);
        } else {
          run("UPDATE lancamentos SET deletedat=datetime('now','localtime') WHERE id=?", [entradaOS.id]);
        }
      } else if (entrada > 0) {
        runInsert(
          `INSERT INTO lancamentos (data,tipo,categoria,descricao,pagamento,valor,pago,ordemid,criadopor,origem) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [hoje(), "Entrada", novoServico||"Diversos", entradaDesc, novoPagamento, entrada, 1, req.params.id, req.user.id, "entradaos"]
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
    const { obs } = req.body ?? {};
    const status = normalizarStatus(req.body?.status);
    if (!status) return res.status(400).json({ error: "status obrigatorio" });

    const existe = getOne("SELECT id FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!existe) return res.status(404).json({ error: "Nao encontrado" });

    if (req.user.role === 'oficina' && status === 'Cancelado') {
      return res.status(403).json({ error: "Oficina nao pode cancelar OS." });
    }

    if (status === 'Entregue') {
      const resumo = getResumoFinanceiroOS(req.params.id);
      if (resumo && resumo.saldo > 0.01)
        return res.status(400).json({ error: `OS possui saldo aberto de R$ ${resumo.saldo.toFixed(2)}. Quite antes de entregar.` });
    }

    let statusAnterior;
    transaction(() => {
      const current = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
      if (!current) throw new Error("OS nao encontrada");
      const erroStatus = validarStatus(status, current.status);
      if (erroStatus) throw new Error(erroStatus);
      statusAnterior = current.status;
      run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, current.status, status, req.user.id, obs||null]
      );
    });

    maybeNotifyPronto(req.params.id, statusAnterior, status);
    res.json({ ok: true });
  } catch(e) {
    if (e.message && !e.message.includes('SQLITE')) {
      return res.status(400).json({ error: e.message });
    }
    next(e);
  }
});

// POST /api/ordens/:id/whatsapp-avisos/:tipo/abrir
router.post("/:id/whatsapp-avisos/:tipo/abrir", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const tipo = normalizarTipoAviso(req.params.tipo);
    if (!tipo) return res.status(400).json({ error: "Tipo de aviso invalido." });
    if (!podeUsarAviso(req.user.role, tipo)) {
      return res.status(403).json({ error: "Aviso nao permitido para este usuario." });
    }

    const os = buscarOrdemAviso(req.params.id);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const disponibilidade = avisoDisponivelParaOrdem(os, tipo, req.user.role);
    if (!disponibilidade.ok) {
      return res.status(409).json({ error: "Aviso indisponivel para o status atual da OS." });
    }

    const phone = normalizarTelefoneWhatsapp(os.clientetelefone || os.clientecontato);
    const message = montarMensagemAviso(os, tipo, { role: req.user.role });
    if (!message.ok) return res.status(403).json({ error: "Aviso nao permitido para este usuario." });

    const aviso = salvarAvisoAberto(os.id, tipo, phone, message.text, req.user.id);
    res.json({
      aviso: projetarAviso(aviso),
      whatsapp: {
        mode: "web",
        phone,
        text: message.text,
      },
    });
  } catch(e) { next(e); }
});

// PATCH /api/ordens/:id/whatsapp-avisos/:tipo/status
router.patch("/:id/whatsapp-avisos/:tipo/status", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const tipo = normalizarTipoAviso(req.params.tipo);
    const status = normalizarStatusAviso(req.body?.status);
    if (!tipo) return res.status(400).json({ error: "Tipo de aviso invalido." });
    if (!status || !['enviado', 'ignorado'].includes(status)) {
      return res.status(400).json({ error: "Status de aviso invalido." });
    }
    if (!podeUsarAviso(req.user.role, tipo)) {
      return res.status(403).json({ error: "Aviso nao permitido para este usuario." });
    }

    const os = buscarOrdemAviso(req.params.id);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const disponibilidade = avisoDisponivelParaOrdem(os, tipo, req.user.role);
    if (!disponibilidade.ok) {
      return res.status(409).json({ error: "Aviso indisponivel para o status atual da OS." });
    }

    const atual = buscarAviso(os.id, tipo) || { status: 'pendente' };
    const transicao = validarTransicaoAviso(atual.status, status);
    if (!transicao.ok) return res.status(409).json({ error: "Transicao de aviso invalida." });

    if (!atual.id) garantirAvisoPendente(os.id, tipo);

    const fieldPor = status === 'enviado' ? 'enviado_por' : 'ignorado_por';
    const fieldEm = status === 'enviado' ? 'enviado_em' : 'ignorado_em';
    run(
      `UPDATE whatsapp_avisos
       SET status=?, ${fieldPor}=?, ${fieldEm}=datetime('now','localtime'), updatedat=datetime('now','localtime')
       WHERE ordemid=? AND tipo=?`,
      [status, req.user.id, os.id, tipo]
    );

    res.json({ aviso: projetarAviso(buscarAviso(os.id, tipo)) });
  } catch(e) { next(e); }
});

// POST /api/ordens/:id/whatsapp-confirmacao
router.post("/:id/whatsapp-confirmacao", auth(["admin","caixa"]), async (req, res, next) => {
  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });
    await sendWhatsAppConfirmacao(os);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// DELETE /api/ordens/:id  (soft delete — move para lixeira)
router.delete("/:id", auth(["admin"]), (req, res, next) => {
  try {
    const { reason } = req.body ?? {};
    const old = getOne("SELECT id FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado" });
    run(
      "UPDATE ordens SET deletedat=datetime('now','localtime'),deletedpor=?,deletedreason=? WHERE id=?",
      [req.user.id, reason||null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// POST /api/ordens/:id/restore  (restaurar da lixeira)
router.post("/:id/restore", auth(["admin"]), (req, res, next) => {
  try {
    const old = getOne("SELECT id FROM ordens WHERE id=? AND deletedat IS NOT NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado na lixeira" });
    run("UPDATE ordens SET deletedat=NULL,deletedpor=NULL,deletedreason=NULL WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// DELETE /api/ordens/:id/permanente  (exclusao definitiva — somente admin)
router.delete("/:id/permanente", auth(["admin"]), (req, res, next) => {
  try {
    const old = getOne("SELECT id FROM ordens WHERE id=?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado" });
    transaction(() => {
      run("DELETE FROM statuslog   WHERE ordemid=?", [req.params.id]);
      run("DELETE FROM ordem_itens WHERE ordemid=?", [req.params.id]);
      run("DELETE FROM lancamentos WHERE ordemid=?", [req.params.id]);
      run("DELETE FROM ordens      WHERE id=?",      [req.params.id]);
    });
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
