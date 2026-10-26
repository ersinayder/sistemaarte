const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth, authAnyPermission, authPermission } = require("../middlewares/auth");
const { hasAnyPermission, hasPermission } = require("../domain/permissionRules");
const { toNumber } = require("../utils/numbers");
const { hoje } = require("../utils/dates");
const {
  validarEntradaOS, validarStatus, validarPrazo, normalizarStatus,
  descricaoEntradaOS, descricaoRestanteOS
} = require("../domain/ordensRules");
const { sendWhatsAppConfirmacao } = require("../utils/whatsapp");
const { marcarAvisoParaEnvio } = require("../utils/whatsappQueue");
const { getWhatsappRuntimeConfig } = require("../utils/whatsappConfig");
const { getResumoFinanceiroOS } = require('../domain/financeiroRules');
const { validarEntregaComSaldo } = require('../domain/clienteFiadoRules');
const { createClienteCreditoService } = require('../services/clienteCreditoService');

function validarExclusaoOrdem(ordemId) {
  const mov = getOne("SELECT 1 FROM cliente_credito_movimentos WHERE ordemid=? LIMIT 1", [ordemId]);
  const lanc = getOne(
    "SELECT 1 FROM lancamentos WHERE ordemid=? AND deletedat IS NULL AND (origem LIKE 'credito_%' OR acerto_id IS NOT NULL) LIMIT 1",
    [ordemId]
  );
  const ordem = getOne("SELECT id, status FROM ordens WHERE id=?", [ordemId]);
  const resumo = getResumoFinanceiroOS(ordemId);
  const debitoFiado = ordem?.status === 'Entregue' && resumo && resumo.saldo > 0.01;

  if (mov || lanc || debitoFiado) {
    return {
      ok: false,
      error: "Não é possível excluir OS com movimentações de crédito ou débitos de fiado. Cancele a OS primeiro.",
    };
  }
  return { ok: true };
}

function calcularDividaEntregueCliente(clienteId) {
  if (!clienteId) return 0;
  const ordens = getAll(
    "SELECT id, valortotal FROM ordens WHERE clienteid=? AND status='Entregue' AND deletedat IS NULL",
    [clienteId]
  );
  let dividaTotal = 0;
  for (const o of ordens) {
    const res = getResumoFinanceiroOS(o.id);
    if (res && res.saldo > 0.01) {
      dividaTotal += res.saldo;
    }
  }
  return Math.round(dividaTotal * 100) / 100;
}

function checarEntregaComSaldo({ ordem, saldoOrdem, clienteId, usuario, confirmarAcimaLimite }) {
  if (saldoOrdem <= 0.01) return { ok: true };
  const cid = clienteId || ordem?.clienteid;
  const cliente = cid ? getOne("SELECT id, fiado_ativo, fiado_limite FROM clientes WHERE id=? AND deletedat IS NULL", [cid]) : null;
  const dividaAtual = calcularDividaEntregueCliente(cid);
  return validarEntregaComSaldo({
    ordem,
    saldoOrdem,
    cliente,
    dividaAtualCliente: dividaAtual,
    usuario,
    confirmarAcimaLimite,
  });
}
const { calcularDescontoOS } = require('../domain/descontoRules');
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
    COALESCE((
      SELECT sl.createdat
      FROM statuslog sl
      WHERE sl.ordemid=o.id AND sl.statusnovo=o.status
      ORDER BY sl.createdat DESC, sl.id DESC
      LIMIT 1
    ), o.updatedat, o.createdat) AS statusalteradoem,
    COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0) AS valorrecebido,
    CASE
      WHEN (o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0)) < 0
      THEN 0.0
      ELSE CAST(o.valortotal - COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.ordemid=o.id AND l.pago=1 AND l.deletedat IS NULL),0) AS REAL)
    END AS saldoaberto,
    COALESCE((SELECT GROUP_CONCAT(oi.nome, ', ') FROM ordem_itens oi WHERE oi.ordemid=o.id ORDER BY oi.id), '') AS itens_resumo,
    nn.status AS nfe_status,
    nn.chave AS nfe_chave,
    nn.protocolo AS nfe_protocolo,
    nn.numero AS nfe_numero,
    nn.serie AS nfe_serie,
    nn.createdat AS nfe_emitida_em,
    NULL AS nfe_xml,
    nn.rejeicao_motivo AS nfe_rejeicao_motivo,
    nn.cancelado_em AS nfe_cancelado_em,
    nn.cancel_protocolo AS nfe_cancel_protocolo,
    nn.cancel_motivo AS nfe_cancel_motivo
  FROM ordens o
  LEFT JOIN users u ON u.id=o.criadopor
  LEFT JOIN nfe_notas nn ON nn.id = (
    SELECT n2.id
    FROM nfe_notas n2
    WHERE n2.origem = 'ordem'
      AND n2.ordemid = o.id
      AND n2.deletedat IS NULL
    ORDER BY
      CASE n2.status
        WHEN 'autorizado' THEN 1
        WHEN 'emitindo' THEN 2
        WHEN 'rejeitado' THEN 3
        WHEN 'cancelado' THEN 4
        ELSE 5
      END,
      n2.id DESC
    LIMIT 1
  )
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
    `INSERT OR IGNORE INTO whatsapp_avisos (ordemid, tipo, status, auto_status, updatedat)
     VALUES (?, ?, 'pendente', 'pendente', datetime('now','localtime'))`,
    [ordemId, tipo]
  );
}

function garantirAvisoPronto(ordemId, statusAnterior, statusNovo) {
  if (statusAnterior === statusNovo || statusNovo !== 'Pronto') return;
  garantirAvisoPendente(ordemId, 'pedido_pronto');
}

function getWhatsappMessageTemplates() {
  const runtime = getWhatsappRuntimeConfig();
  return {
    confirmacaoPedido: runtime.mensagemConfirmacao,
    pedidoPronto: runtime.mensagemPronto,
  };
}

function enfileirarAvisoWhatsapp(ordem, tipo) {
  const phone = normalizarTelefoneWhatsapp(ordem.clientetelefone || ordem.clientecontato);
  const message = montarMensagemAviso(ordem, tipo, { canUseNotice: true, templates: getWhatsappMessageTemplates() });
  if (!message.ok) return;
  marcarAvisoParaEnvio({
    ordemId: ordem.id,
    tipo,
    phone,
    text: message.text,
    canal: 'web_local',
  });
}

function maybeNotifyPronto(ordemId, statusAnterior, statusNovo) {
  garantirAvisoPronto(ordemId, statusAnterior, statusNovo);
  if (statusAnterior === statusNovo || statusNovo !== 'Pronto') return;
  const os = buscarOrdemAviso(ordemId);
  if (!os) return;
  enfileirarAvisoWhatsapp(os, 'pedido_pronto');
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

function avisoVirtual(ordem, tipo, canUseNotice, avisosPorChave) {
  const existente = avisosPorChave.get(`${ordem.id}:${tipo}`);
  if (!podeUsarAviso(canUseNotice, tipo)) return null;
  if (existente) {
    const projetado = projetarAviso(existente);
    if (['enviado', 'ignorado'].includes(projetado.status)) return projetado;
    const disponibilidade = avisoDisponivelParaOrdem(ordem, tipo, canUseNotice);
    return disponibilidade.ok ? projetado : null;
  }
  const disponibilidade = avisoDisponivelParaOrdem(ordem, tipo, canUseNotice);
  if (!disponibilidade.ok) return null;
  return { ordemid: ordem.id, tipo, status: 'pendente', virtual: true };
}

function deveRedigirDadosOperacionais(user) {
  const isStructuralWorkshop = user?.role === "oficina";
  const isWorkshopPermissionContext = hasPermission(user, "oficina.ver");
  return (isStructuralWorkshop || isWorkshopPermissionContext) && !hasAnyPermission(user, [
    "atendimento.ver",
    "caixa.ver",
    "financeiro.ver",
    "nfe.ver",
  ]);
}

function podeUsarAvisosWhatsapp(user) {
  return hasPermission(user, "ordens.whatsapp") && !deveRedigirDadosOperacionais(user);
}

function redactOrdemForPermissions(row, shouldRedact) {
  if (!shouldRedact) return row;
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
    descontoinput,
    descontovalor,
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

function redactItensForPermissions(itens, shouldRedact) {
  if (!shouldRedact) return itens;
  return itens.map(({ preco_unitario, subtotal, ...item }) => item);
}

function anexarAvisosWhatsApp(rows, user) {
  const canUseNotice = podeUsarAvisosWhatsapp(user);
  const shouldRedact = deveRedigirDadosOperacionais(user);
  const ordemIds = rows.map((row) => row.id).filter(Boolean);
  const avisos = listarAvisos(ordemIds);
  const avisosPorChave = new Map(avisos.map((aviso) => [`${aviso.ordemid}:${aviso.tipo}`, aviso]));

  return rows.map((row) => {
    const confirmacao = avisoVirtual(row, 'confirmacao_pedido', canUseNotice, avisosPorChave);
    const pronto = avisoVirtual(row, 'pedido_pronto', canUseNotice, avisosPorChave);
    const whatsappAvisos = {
      confirmacao_pedido: confirmacao,
      pedido_pronto: pronto,
    };
    // pronto sempre tem prioridade: se existe (pendente, aberto, enviado ou ignorado),
    // é mais relevante para a oficina do que confirmacao_pedido.
    const whatsappAvisoPrincipal = pronto || confirmacao;
    return { ...redactOrdemForPermissions(row, shouldRedact), whatsappAvisos, whatsappAvisoPrincipal };
  });
}

function salvarAvisoAberto(ordemId, tipo, phone, text, userId) {
  run(
    `INSERT INTO whatsapp_avisos
       (ordemid, tipo, status, telefone_snapshot, mensagem_snapshot, canal, auto_status, aberto_por, aberto_em, updatedat)
     VALUES (?, ?, 'aberto', ?, ?, 'manual', 'pendente', ?, datetime('now','localtime'), datetime('now','localtime'))
     ON CONFLICT(ordemid, tipo) DO UPDATE SET
       status=CASE
         WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.status
         ELSE 'aberto'
       END,
       telefone_snapshot=excluded.telefone_snapshot,
       mensagem_snapshot=excluded.mensagem_snapshot,
       canal='manual',
       auto_status='pendente',
       aberto_por=excluded.aberto_por,
       aberto_em=COALESCE(whatsapp_avisos.aberto_em, excluded.aberto_em),
       updatedat=datetime('now','localtime')`,
    [ordemId, tipo, phone, text, userId]
  );
  return buscarAviso(ordemId, tipo);
}

// GET /api/ordens
router.get("/", auth(), authAnyPermission(["ordens.ver", "ordens.excluir", "ordens.restaurar", "ordens.excluir_permanente"]), (req, res, next) => {
  try {
    const { status, q, vencidas, lixeira, tipo } = req.query;
    const querPaginacao = req.query.page !== undefined || req.query.limit !== undefined;
    const { page, limit, offset } = normalizarPaginacao(req.query, { defaultLimit: 14, maxLimit: 100 });
    const querLixeira = lixeira === "1";
    if (!querLixeira && !hasPermission(req.user, "ordens.ver")) {
      return res.status(403).json({ error: "Sem permissao" });
    }
    const podeVerLixeira = hasAnyPermission(req.user, ["ordens.excluir", "ordens.restaurar", "ordens.excluir_permanente"]);
    if (querLixeira && !podeVerLixeira) {
      return res.status(403).json({ error: "Sem permissao" });
    }
    const isLixeira = querLixeira && podeVerLixeira;
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
      return res.json(anexarAvisosWhatsApp(rows, req.user));
    }
    const total = getOne(`SELECT COUNT(*) AS total FROM ordens o${whereSql}`, p)?.total ?? 0;
    const rows = getAll(`${SEL_ORDEM}${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
    res.json({
      data: anexarAvisosWhatsApp(rows, req.user),
      meta: montarMetaPaginacao({ page, limit, total }),
    });
  } catch(e) { next(e); }
});

// GET /api/ordens/:id
router.get("/:id", auth(), authPermission("ordens.ver"), (req, res, next) => {
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
      ...redactOrdemForPermissions(o, deveRedigirDadosOperacionais(req.user)),
      logs,
      itens: redactItensForPermissions(itens, deveRedigirDadosOperacionais(req.user)),
      lancamentos: deveRedigirDadosOperacionais(req.user) ? [] : lancamentos,
    });
  } catch(e) { next(e); }
});

// POST /api/ordens
router.post("/", auth(), authPermission("ordens.criar"), (req, res, next) => {
  const {
    clienteid, clientenome, clientetelefone, clientecpf,
    servico, descricao, valortotal, valorentrada, descontoinput,
    prazoentrega, prioridade, pagamento, observacoes, dataEntrada,
    produtos,
  } = req.body ?? {};

  if (!clientenome || !servico || valortotal == null)
    return res.status(400).json({ error: "clientenome, servico e valortotal sao obrigatorios" });

  const desconto = calcularDescontoOS(valortotal, descontoinput);
  const total = desconto.valortotal;
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
        valortotal,descontoinput,descontovalor,valorentrada,prazoentrega,prioridade,pagamento,observacoes,status,criadopor,createdat) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero, cidResolvido, clientenome, telFinal, cpfFinal, servico, descricao||null, total,
         desconto.descontoinput || null, desconto.descontovalor, entrada,
         prazoentrega||null, prioridade||"Normal", pagamento||"Pix", observacoes||null, "Aguardando", req.user.id, createdatOS]
      );
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [id, null, "Aguardando", req.user.id, "Ordem criada"]
      );
      garantirAvisoPendente(id, 'confirmacao_pedido');
      enfileirarAvisoWhatsapp({
        id,
        numero,
        clientenome,
        clientetelefone: telFinal,
        servico,
        status: 'Aguardando',
        valortotal: total,
        valorentrada: entrada,
      }, 'confirmacao_pedido');
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
router.put("/:id", auth(), authAnyPermission(["ordens.editar", "ordens.alterar_status", "oficina.alterar_status"]), (req, res, next) => {
  try {
    const old = getOne("SELECT * FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado ou OS cancelada" });
    const canEditOrdem = hasPermission(req.user, "ordens.editar");
    const canAlterarStatus = hasAnyPermission(req.user, ["ordens.alterar_status", "oficina.alterar_status"]);

    const {
      descricao, valortotal, valorentrada, descontoinput,
      prazoentrega, prioridade, pagamento, observacoes,
      clientenome, clientetelefone, clientecpf, servico, clienteid,
      produtos,
    } = req.body ?? {};

    const statusRaw = req.body?.status;
    const status = statusRaw ? normalizarStatus(statusRaw) : null;

    if (!canEditOrdem) {
      if (!canAlterarStatus) return res.status(403).json({ error: "Sem permissao" });
      if (!status) return res.status(400).json({ error: "Informe o status" });
      if (status === 'Cancelado' && !hasPermission(req.user, "ordens.cancelar")) return res.status(403).json({ error: "Sem permissao para cancelar OS." });
      const erroStatus = validarStatus(status, old.status, { isAdmin: req.user?.role === 'admin' });
      if (erroStatus) return res.status(400).json({ error: erroStatus });

      let resolucaoCancelamentoStatusOnly = null;
      if (status === 'Cancelado' && old.status !== 'Cancelado') {
        const resumoCancel = getResumoFinanceiroOS(req.params.id);
        const recebidoCancel = Math.round(toNumber(resumoCancel?.recebido, 0) * 100) / 100;
        if (recebidoCancel > 0.01) {
          if (!req.body.destino_excedente) {
            return res.status(409).json({
              code: "EXCEDENTE_PAGAMENTO",
              error: "Esta OS possui pagamentos registrados. Defina o destino do valor antes de cancelar.",
              excedente: recebidoCancel,
            });
          }
          resolucaoCancelamentoStatusOnly = {
            tipo: req.body.destino_excedente,
            valor: recebidoCancel,
            clienteId: old.clienteid,
            pagamentoDevolucao: req.body.pagamento_devolucao || "Dinheiro",
          };
        }
      }

      let checagemFiado = null;
      if (status === 'Entregue') {
        const resumo = getResumoFinanceiroOS(req.params.id);
        checagemFiado = checarEntregaComSaldo({
          ordem: old,
          saldoOrdem: resumo?.saldo || 0,
          clienteId: old.clienteid,
          usuario: req.user,
          confirmarAcimaLimite: req.body?.confirmar_acima_limite,
        });
        if (!checagemFiado.ok) {
          return res.status(400).json({ error: checagemFiado.error, code: checagemFiado.code, ...checagemFiado });
        }
      }
      transaction(() => {
        const current = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
        if (!current) throw new Error("OS nao encontrada");

        if (resolucaoCancelamentoStatusOnly) {
          const credService = createClienteCreditoService({ db: getDB() });
          if (resolucaoCancelamentoStatusOnly.tipo === "credito") {
            if (!resolucaoCancelamentoStatusOnly.clienteId) {
              throw new Error("Para gerar Crédito Loja, a OS deve estar vinculada a um cliente cadastrado.");
            }
            credService.gerarCreditoPorExcedente({
              ordemId: req.params.id,
              clienteId: resolucaoCancelamentoStatusOnly.clienteId,
              valor: resolucaoCancelamentoStatusOnly.valor,
              criadopor: req.user.id,
            });
          } else if (resolucaoCancelamentoStatusOnly.tipo === "devolver") {
            if (!hasPermission(req.user, "clientes.credito.devolver")) {
              throw new Error("Sem permissão para devolver valores em dinheiro.");
            }
            credService.devolverExcedente({
              ordemId: req.params.id,
              clienteId: resolucaoCancelamentoStatusOnly.clienteId,
              valor: resolucaoCancelamentoStatusOnly.valor,
              pagamento: resolucaoCancelamentoStatusOnly.pagamentoDevolucao,
              criadopor: req.user.id,
            });
          }
        }
        run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
        if (status !== current.status) {
          let obsLog = null;
          if (status === 'Entregue') {
            const resumo = getResumoFinanceiroOS(req.params.id);
            if (resumo?.saldo > 0.01) {
              obsLog = `Entregue em débito (fiado): saldo R$ ${resumo.saldo.toFixed(2)}`;
              if (checagemFiado?.acimaLimite) {
                obsLog += ` (liberado acima do limite R$ ${toNumber(checagemFiado.limite).toFixed(2)})`;
              }
            }
          }
          runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
            [req.params.id, current.status, status, req.user.id, obsLog]);
        }
      });
      maybeNotifyPronto(req.params.id, old.status, status);
      return res.json({ ok: true });
    }

    const desconto = descontoinput !== undefined
      ? calcularDescontoOS(valortotal ?? old.valortotal, descontoinput)
      : {
          valortotal: toNumber(valortotal ?? old.valortotal),
          descontoinput: old.descontoinput || null,
          descontovalor: toNumber(old.descontovalor),
        };
    const total = desconto.valortotal;
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

    const resumoAtualOS = getResumoFinanceiroOS(req.params.id);
    const entradaAtualRow = getEntradaOS(req.params.id);
    const entradaAtualNum = entradaAtualRow ? toNumber(entradaAtualRow.valor) : 0;
    const recebidoSemEntradaCalc = Math.max(0, toNumber(resumoAtualOS?.recebido) - entradaAtualNum);
    const recebidoProjetadoCalc = recebidoSemEntradaCalc + (entrada > 0 ? entrada : 0);

    let resolucaoExcedenteFull = null;
    if (status === 'Cancelado' && old.status !== 'Cancelado') {
      const valorParaCancelar = Math.round(recebidoProjetadoCalc * 100) / 100;
      if (valorParaCancelar > 0.01) {
        if (!req.body.destino_excedente) {
          return res.status(409).json({
            code: "EXCEDENTE_PAGAMENTO",
            error: "Esta OS possui pagamentos registrados. Defina o destino do valor antes de cancelar.",
            excedente: valorParaCancelar,
          });
        }
        resolucaoExcedenteFull = {
          tipo: req.body.destino_excedente,
          valor: valorParaCancelar,
          pagamentoDevolucao: req.body.pagamento_devolucao || "Dinheiro",
        };
      }
    } else if (recebidoProjetadoCalc - total > 0.01) {
      const valorExcedente = Math.round((recebidoProjetadoCalc - total) * 100) / 100;
      if (!req.body.destino_excedente) {
        return res.status(409).json({
          code: "EXCEDENTE_PAGAMENTO",
          error: "O valor recebido é superior ao novo total da OS.",
          excedente: valorExcedente,
        });
      }
      resolucaoExcedenteFull = {
        tipo: req.body.destino_excedente,
        valor: valorExcedente,
        pagamentoDevolucao: req.body.pagamento_devolucao || "Dinheiro",
      };
    }

    const ns = status || old.status;
    const novoCliente = clientenome || old.clientenome;
    const novoServico = servico || old.servico;
    const novoPagamento = pagamento || old.pagamento || "Pix";

    if (status === 'Cancelado' && status !== old.status && !hasPermission(req.user, "ordens.cancelar")) {
      return res.status(403).json({ error: "Sem permissao para cancelar OS." });
    }

    if (status && status !== old.status) {
      const erroStatus = validarStatus(status, old.status, { isAdmin: req.user?.role === 'admin' });
      if (erroStatus) return res.status(400).json({ error: erroStatus });
    }

    let checagemFiadoFull = null;
    let saldoProjetadoFull = 0;
    if (ns === 'Entregue') {
      const resumo = getResumoFinanceiroOS(req.params.id);
      const entradaOS = getEntradaOS(req.params.id);
      const entradaAtual = entradaOS ? toNumber(entradaOS.valor) : 0;
      const recebidoSemEntrada = Math.max(0, toNumber(resumo?.recebido) - entradaAtual);
      const recebidoProjetado = recebidoSemEntrada + (entrada > 0 ? entrada : 0);
      saldoProjetadoFull = Math.max(0, Math.round((total - recebidoProjetado) * 100) / 100);

      let targetCid = clienteid !== undefined ? (clienteid || null) : old.clienteid;
      const nBusca = normalizarNomeClienteBusca(clientenome || old.clientenome);
      if (!targetCid && nBusca) {
        const cliRow = getOne("SELECT id FROM clientes WHERE name=? LIMIT 1", [nBusca]);
        if (cliRow) targetCid = cliRow.id;
      }

      checagemFiadoFull = checarEntregaComSaldo({
        ordem: { ...old, clienteid: targetCid },
        saldoOrdem: saldoProjetadoFull,
        clienteId: targetCid,
        usuario: req.user,
        confirmarAcimaLimite: req.body?.confirmar_acima_limite,
      });
      if (!checagemFiadoFull.ok) {
        return res.status(400).json({ error: checagemFiadoFull.error, code: checagemFiadoFull.code, ...checagemFiadoFull });
      }
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
      if (resolucaoExcedenteFull) {
        const credService = createClienteCreditoService({ db: getDB() });
        if (resolucaoExcedenteFull.tipo === "credito") {
          if (!novoCid) throw new Error("Para gerar Crédito Loja, a OS deve estar vinculada a um cliente cadastrado.");
          credService.gerarCreditoPorExcedente({
            ordemId: req.params.id,
            clienteId: novoCid,
            valor: resolucaoExcedenteFull.valor,
            criadopor: req.user.id,
          });
        } else if (resolucaoExcedenteFull.tipo === "devolver") {
          if (!hasPermission(req.user, "clientes.credito.devolver")) {
            throw new Error("Sem permissão para devolver valores em dinheiro.");
          }
          credService.devolverExcedente({
            ordemId: req.params.id,
            clienteId: novoCid,
            valor: resolucaoExcedenteFull.valor,
            pagamento: resolucaoExcedenteFull.pagamentoDevolucao,
            criadopor: req.user.id,
          });
        }
      }

      run(
        `UPDATE ordens SET clienteid=?,clientenome=?,clientetelefone=?,clientecpf=?,servico=?,descricao=?,
        valortotal=?,descontoinput=?,descontovalor=?,valorentrada=?,prazoentrega=?,prioridade=?,pagamento=?,
        observacoes=?,status=?,updatedat=datetime('now','localtime') WHERE id=?`,
        [novoCid, novoCliente, telFinal, cpfFinal, novoServico, descricao !== undefined ? descricao : old.descricao,
         total, desconto.descontoinput || null, desconto.descontovalor, entrada, novoPrazo, prioridade||old.prioridade, novoPagamento,
         observacoes !== undefined ? observacoes : old.observacoes, ns, req.params.id]
      );
      if (ns !== old.status) {
        let obsLog = null;
        if (ns === 'Entregue' && saldoProjetadoFull > 0.01) {
          obsLog = `Entregue em débito (fiado): saldo R$ ${saldoProjetadoFull.toFixed(2)}`;
          if (checagemFiadoFull?.acimaLimite) {
            obsLog += ` (liberado acima do limite R$ ${toNumber(checagemFiadoFull.limite).toFixed(2)})`;
          }
        }
        runInsert("INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
          [req.params.id, old.status, ns, req.user.id, obsLog]);
      }
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
router.patch("/:id/status", auth(), authAnyPermission(["ordens.alterar_status", "oficina.alterar_status"]), (req, res, next) => {
  try {
    const { obs } = req.body ?? {};
    const status = normalizarStatus(req.body?.status);
    if (!status) return res.status(400).json({ error: "status obrigatorio" });

    const existe = getOne("SELECT id FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!existe) return res.status(404).json({ error: "Nao encontrado" });

    if (status === 'Cancelado' && !hasPermission(req.user, "ordens.cancelar")) {
      return res.status(403).json({ error: "Sem permissao para cancelar OS." });
    }

    let resolucaoCancelPatch = null;
    if (status === 'Cancelado') {
      const currentOrdem = getOne("SELECT * FROM ordens WHERE id=?", [req.params.id]);
      if (currentOrdem && currentOrdem.status !== 'Cancelado') {
        const resumoCancel = getResumoFinanceiroOS(req.params.id);
        const recebidoCancel = Math.round(toNumber(resumoCancel?.recebido, 0) * 100) / 100;
        if (recebidoCancel > 0.01) {
          if (!req.body.destino_excedente) {
            return res.status(409).json({
              code: "EXCEDENTE_PAGAMENTO",
              error: "Esta OS possui pagamentos registrados. Defina o destino do valor antes de cancelar.",
              excedente: recebidoCancel,
            });
          }
          resolucaoCancelPatch = {
            tipo: req.body.destino_excedente,
            valor: recebidoCancel,
            clienteId: currentOrdem.clienteid,
            pagamentoDevolucao: req.body.pagamento_devolucao || "Dinheiro",
          };
        }
      }
    }

    let checagemPatch = null;
    let saldoPatch = 0;
    if (status === 'Entregue') {
      const resumo = getResumoFinanceiroOS(req.params.id);
      saldoPatch = resumo?.saldo || 0;
      const ordemRow = getOne("SELECT * FROM ordens WHERE id=?", [req.params.id]);
      checagemPatch = checarEntregaComSaldo({
        ordem: ordemRow,
        saldoOrdem: saldoPatch,
        clienteId: ordemRow?.clienteid,
        usuario: req.user,
        confirmarAcimaLimite: req.body?.confirmar_acima_limite,
      });
      if (!checagemPatch.ok) {
        return res.status(400).json({ error: checagemPatch.error, code: checagemPatch.code, ...checagemPatch });
      }
    }

    let statusAnterior;
    transaction(() => {
      const current = getOne("SELECT status FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
      if (!current) throw new Error("OS nao encontrada");

      if (resolucaoCancelPatch) {
        const credService = createClienteCreditoService({ db: getDB() });
        if (resolucaoCancelPatch.tipo === "credito") {
          if (!resolucaoCancelPatch.clienteId) {
            throw new Error("Para gerar Crédito Loja, a OS deve estar vinculada a um cliente cadastrado.");
          }
          credService.gerarCreditoPorExcedente({
            ordemId: req.params.id,
            clienteId: resolucaoCancelPatch.clienteId,
            valor: resolucaoCancelPatch.valor,
            criadopor: req.user.id,
          });
        } else if (resolucaoCancelPatch.tipo === "devolver") {
          if (!hasPermission(req.user, "clientes.credito.devolver")) {
            throw new Error("Sem permissão para devolver valores em dinheiro.");
          }
          credService.devolverExcedente({
            ordemId: req.params.id,
            clienteId: resolucaoCancelPatch.clienteId,
            valor: resolucaoCancelPatch.valor,
            pagamento: resolucaoCancelPatch.pagamentoDevolucao,
            criadopor: req.user.id,
          });
        }
      }
      const erroStatus = validarStatus(status, current.status, { isAdmin: req.user?.role === 'admin' });
      if (erroStatus) throw new Error(erroStatus);
      statusAnterior = current.status;
      run("UPDATE ordens SET status=?,updatedat=datetime('now','localtime') WHERE id=?", [status, req.params.id]);
      let obsFinal = obs || null;
      if (status === 'Entregue' && saldoPatch > 0.01) {
        const fiadoObs = `Entregue em débito (fiado): saldo R$ ${saldoPatch.toFixed(2)}${checagemPatch?.acimaLimite ? ` (liberado acima do limite R$ ${toNumber(checagemPatch.limite).toFixed(2)})` : ''}`;
        obsFinal = obsFinal ? `${obsFinal} | ${fiadoObs}` : fiadoObs;
      }
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [req.params.id, current.status, status, req.user.id, obsFinal]
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
router.post("/:id/whatsapp-avisos/:tipo/abrir", auth(), authPermission("ordens.whatsapp"), (req, res, next) => {
  try {
    const tipo = normalizarTipoAviso(req.params.tipo);
    if (!tipo) return res.status(400).json({ error: "Tipo de aviso invalido." });
    const canUseNotice = podeUsarAvisosWhatsapp(req.user);
    if (!podeUsarAviso(canUseNotice, tipo)) {
      return res.status(403).json({ error: "Aviso nao permitido para este usuario." });
    }

    const os = buscarOrdemAviso(req.params.id);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const disponibilidade = avisoDisponivelParaOrdem(os, tipo, canUseNotice);
    if (!disponibilidade.ok) {
      return res.status(409).json({ error: "Aviso indisponivel para o status atual da OS." });
    }

    const phone = normalizarTelefoneWhatsapp(os.clientetelefone || os.clientecontato);
    const message = montarMensagemAviso(os, tipo, { canUseNotice, templates: getWhatsappMessageTemplates() });
    if (!message.ok) return res.status(403).json({ error: "Aviso nao permitido para este usuario." });

    const aviso = salvarAvisoAberto(os.id, tipo, phone, message.text, req.user.id);
    res.json({
      aviso: projetarAviso(aviso),
      whatsapp: {
        mode: "desktop",
        phone,
        text: message.text,
      },
    });
  } catch(e) { next(e); }
});

// PATCH /api/ordens/:id/whatsapp-avisos/:tipo/status
router.patch("/:id/whatsapp-avisos/:tipo/status", auth(), authPermission("ordens.whatsapp"), (req, res, next) => {
  try {
    const tipo = normalizarTipoAviso(req.params.tipo);
    const status = normalizarStatusAviso(req.body?.status);
    if (!tipo) return res.status(400).json({ error: "Tipo de aviso invalido." });
    if (!status || !['enviado', 'ignorado'].includes(status)) {
      return res.status(400).json({ error: "Status de aviso invalido." });
    }
    const canUseNotice = podeUsarAvisosWhatsapp(req.user);
    if (!podeUsarAviso(canUseNotice, tipo)) {
      return res.status(403).json({ error: "Aviso nao permitido para este usuario." });
    }

    const os = buscarOrdemAviso(req.params.id);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const disponibilidade = avisoDisponivelParaOrdem(os, tipo, canUseNotice);
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
router.post("/:id/whatsapp-confirmacao", auth(), authPermission("ordens.whatsapp"), async (req, res, next) => {
  try {
    const os = getOne(SEL_ORDEM + " WHERE o.id=? AND o.deletedat IS NULL", [req.params.id]);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });
    await sendWhatsAppConfirmacao(os);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// DELETE /api/ordens/:id  (soft delete — move para lixeira)
router.delete("/:id", auth(), authPermission("ordens.excluir"), (req, res, next) => {
  try {
    const { reason } = req.body ?? {};
    const old = getOne("SELECT id FROM ordens WHERE id=? AND deletedat IS NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado" });

    const checkDel = validarExclusaoOrdem(req.params.id);
    if (!checkDel.ok) {
      return res.status(400).json({ error: checkDel.error });
    }
    run(
      "UPDATE ordens SET deletedat=datetime('now','localtime'),deletedpor=?,deletedreason=? WHERE id=?",
      [req.user.id, reason||null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// POST /api/ordens/:id/restore  (restaurar da lixeira)
router.post("/:id/restore", auth(), authPermission("ordens.restaurar"), (req, res, next) => {
  try {
    const old = getOne("SELECT id FROM ordens WHERE id=? AND deletedat IS NOT NULL", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado na lixeira" });
    run("UPDATE ordens SET deletedat=NULL,deletedpor=NULL,deletedreason=NULL WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

// DELETE /api/ordens/:id/permanente  (exclusao definitiva — somente admin)
router.delete("/:id/permanente", auth(), authPermission("ordens.excluir_permanente"), (req, res, next) => {
  try {
    const old = getOne("SELECT id FROM ordens WHERE id=?", [req.params.id]);
    if (!old) return res.status(404).json({ error: "Nao encontrado" });

    const checkDel = validarExclusaoOrdem(req.params.id);
    if (!checkDel.ok) {
      return res.status(400).json({ error: checkDel.error });
    }
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
