const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const {
  normalizarStatusProposta,
  validarStatusProposta,
  podeGerarOS,
} = require("../domain/propostasRules");
const { renderPropostaHtml } = require("../utils/propostaPdf");
const { sendPrintHtml } = require("../utils/print/base");

const SEL_PROPOSTA = `
  SELECT p.*,
    (SELECT COUNT(*) FROM proposta_itens pi WHERE pi.propostaid=p.id) AS totalitens
  FROM propostas p
`;

function gerarNumeroSequencia(nome, prefixo) {
  run("INSERT OR IGNORE INTO sequencias (nome, ultimo) VALUES (?, 0)", [nome]);
  const row = getOne(
    "UPDATE sequencias SET ultimo=ultimo+1 WHERE nome=? RETURNING ultimo",
    [nome]
  );
  return `${prefixo}-${String(row.ultimo).padStart(4, "0")}`;
}

function gerarNumeroProposta() {
  return gerarNumeroSequencia("proposta", "PROP");
}

function gerarNumeroOS() {
  return gerarNumeroSequencia("os", "OS");
}

function normalizarItens(produtos = []) {
  return (Array.isArray(produtos) ? produtos : [])
    .map((p) => ({
      produto_id: p.produto_id || p.id || null,
      nome: String(p.nome || p.name || "").trim(),
      quantidade: Math.max(1, Number(p.quantidade || p.qty || 1)),
      preco_unitario: Math.max(0, Number(p.preco_unitario ?? p.preco ?? p.valor ?? 0)),
      avulso: p.avulso ? 1 : 0,
    }))
    .filter((p) => p.nome);
}

function salvarItens(propostaId, produtos) {
  run("DELETE FROM proposta_itens WHERE propostaid=?", [propostaId]);
  for (const p of normalizarItens(produtos)) {
    runInsert(
      `INSERT INTO proposta_itens (propostaid, produto_id, nome, quantidade, preco_unitario, avulso)
       VALUES (?,?,?,?,?,?)`,
      [propostaId, p.produto_id, p.nome, p.quantidade, p.preco_unitario, p.avulso]
    );
  }
}

function itensProposta(id) {
  return getAll("SELECT * FROM proposta_itens WHERE propostaid=? ORDER BY id ASC", [id]);
}

function totalItens(produtos) {
  return normalizarItens(produtos).reduce((acc, p) => acc + p.quantidade * p.preco_unitario, 0);
}

router.get("/", auth(["admin", "caixa"]), (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = [];
    const params = [];
    if (status && status !== "todos") {
      where.push("p.status=?");
      params.push(normalizarStatusProposta(status));
    }
    if (q) {
      const s = `%${q}%`;
      where.push("(p.numero LIKE ? OR p.clientenome LIKE ? OR p.descricao LIKE ? OR p.observacoes LIKE ?)");
      params.push(s, s, s, s);
    }
    const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    res.json(getAll(`${SEL_PROPOSTA}${whereSql} ORDER BY p.id DESC`, params));
  } catch (e) { next(e); }
});

router.get("/:id", auth(["admin", "caixa"]), (req, res, next) => {
  try {
    const proposta = getOne(`${SEL_PROPOSTA} WHERE p.id=?`, [req.params.id]);
    if (!proposta) return res.status(404).json({ error: "Proposta nao encontrada" });
    res.json({ ...proposta, itens: itensProposta(req.params.id) });
  } catch (e) { next(e); }
});

router.get("/:id/pdf", auth(["admin", "caixa"]), (req, res, next) => {
  try {
    const proposta = getOne(`${SEL_PROPOSTA} WHERE p.id=?`, [req.params.id]);
    if (!proposta) return res.status(404).json({ error: "Proposta nao encontrada" });
    const html = renderPropostaHtml({ proposta, itens: itensProposta(req.params.id) });
    sendPrintHtml(res, `proposta-${proposta.numero || proposta.id}.html`, html);
  } catch (e) { next(e); }
});

router.post("/", auth(["admin", "caixa"]), (req, res, next) => {
  try {
    const produtos = normalizarItens(req.body?.produtos);
    const clientenome = String(req.body?.clientenome || "").trim();
    if (!clientenome) return res.status(400).json({ error: "Cliente obrigatorio" });
    if (produtos.length === 0) return res.status(400).json({ error: "Informe ao menos um item" });

    const status = normalizarStatusProposta(req.body?.status || "Novo lead");
    const erroStatus = validarStatusProposta(status);
    if (erroStatus) return res.status(400).json({ error: erroStatus });

    const total = Number(req.body?.valortotal ?? totalItens(produtos));
    const id = transaction(() => {
      const numero = gerarNumeroProposta();
      const propostaId = runInsert(
        `INSERT INTO propostas
          (numero, clienteid, clientenome, clientetelefone, clientecpf, status, origem, descricao,
           valortotal, prazoentrega, observacoes, criadopor)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          numero,
          req.body?.cliente_id || req.body?.clienteid || null,
          clientenome,
          req.body?.clientetelefone || req.body?.telefone || null,
          req.body?.clientecpf || req.body?.cpf || null,
          status,
          req.body?.origem || "balcao",
          req.body?.descricao || null,
          total,
          req.body?.prazoentrega || null,
          req.body?.observacoes || null,
          req.user.id,
        ]
      );
      salvarItens(propostaId, produtos);
      return propostaId;
    });

    const proposta = getOne(`${SEL_PROPOSTA} WHERE p.id=?`, [id]);
    res.status(201).json({ ...proposta, itens: itensProposta(id) });
  } catch (e) { next(e); }
});

router.patch("/:id/status", auth(["admin", "caixa"]), (req, res, next) => {
  try {
    const proposta = getOne("SELECT * FROM propostas WHERE id=?", [req.params.id]);
    if (!proposta) return res.status(404).json({ error: "Proposta nao encontrada" });

    const status = normalizarStatusProposta(req.body?.status);
    const erroStatus = validarStatusProposta(status);
    if (erroStatus) return res.status(400).json({ error: erroStatus });

    const extra = [];
    if (status === "Orcamento enviado" && !proposta.enviadoem) extra.push("enviadoem=datetime('now','localtime')");
    if (status === "Aprovado" && !proposta.aprovadoem) extra.push("aprovadoem=datetime('now','localtime')");
    if (status === "Perdido" && !proposta.perdidoem) extra.push("perdidoem=datetime('now','localtime')");

    run(
      `UPDATE propostas SET status=?, updatedat=datetime('now','localtime')${extra.length ? `, ${extra.join(", ")}` : ""} WHERE id=?`,
      [status, req.params.id]
    );
    res.json({ ...getOne(`${SEL_PROPOSTA} WHERE p.id=?`, [req.params.id]), itens: itensProposta(req.params.id) });
  } catch (e) { next(e); }
});

router.post("/:id/gerar-os", auth(["admin", "caixa"]), (req, res, next) => {
  try {
    const proposta = getOne("SELECT * FROM propostas WHERE id=?", [req.params.id]);
    if (!proposta) return res.status(404).json({ error: "Proposta nao encontrada" });

    const check = podeGerarOS(proposta);
    if (!check.ok) return res.status(400).json({ error: check.error });

    const itens = itensProposta(req.params.id);
    if (itens.length === 0) return res.status(400).json({ error: "Proposta sem itens" });

    const ordemId = transaction(() => {
      const numero = gerarNumeroOS();
      const id = runInsert(
        `INSERT INTO ordens
          (numero, clienteid, clientenome, clientetelefone, clientecpf, servico, descricao,
           valortotal, valorentrada, prazoentrega, prioridade, pagamento, observacoes, status, criadopor, createdat)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))`,
        [
          numero,
          proposta.clienteid || null,
          proposta.clientenome,
          proposta.clientetelefone || null,
          proposta.clientecpf || null,
          "Diversos",
          proposta.descricao || "Proposta aprovada",
          proposta.valortotal,
          0,
          proposta.prazoentrega || null,
          "Normal",
          "Pix",
          proposta.observacoes || null,
          "Aguardando",
          req.user.id,
        ]
      );
      for (const item of itens) {
        runInsert(
          `INSERT INTO ordem_itens (ordemid, produto_id, nome, quantidade, preco_unitario, avulso)
           VALUES (?,?,?,?,?,?)`,
          [id, item.produto_id || null, item.nome, item.quantidade, item.preco_unitario, item.avulso || 0]
        );
      }
      runInsert(
        "INSERT INTO statuslog (ordemid,statusanterior,statusnovo,usuarioid,obs) VALUES (?,?,?,?,?)",
        [id, null, "Aguardando", req.user.id, `Gerada pela proposta ${proposta.numero}`]
      );
      run("UPDATE propostas SET ordemid=?, updatedat=datetime('now','localtime') WHERE id=?", [id, proposta.id]);
      return id;
    });

    res.status(201).json({ ok: true, ordemid: ordemId, ordem: getOne("SELECT * FROM ordens WHERE id=?", [ordemId]) });
  } catch (e) { next(e); }
});

module.exports = router;
