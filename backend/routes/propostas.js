const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const {
  normalizarStatusProposta,
  validarStatusProposta,
  podeGerarOS,
  normalizarItensProposta,
  validarDadosProposta,
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
  return normalizarItensProposta(produtos);
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

function prazoOSFromProposta(prazo) {
  const value = String(prazo || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function observacoesOSFromProposta(proposta) {
  const obs = String(proposta.observacoes || "").trim();
  const prazo = String(proposta.prazoentrega || "").trim();
  if (!prazo || prazoOSFromProposta(prazo)) return obs || null;
  return [obs, `Prazo previsto na proposta: ${prazo}`].filter(Boolean).join("\n\n");
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
    const dados = validarDadosProposta(req.body || {});
    if (!dados.ok) return res.status(400).json({ error: dados.error });

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
          dados.clientenome,
          req.body?.clientetelefone || req.body?.telefone || null,
          req.body?.clientecpf || req.body?.cpf || null,
          dados.status,
          req.body?.origem || "balcao",
          req.body?.descricao || null,
          dados.valortotal,
          dados.prazoentrega,
          req.body?.observacoes || null,
          req.user.id,
        ]
      );
      salvarItens(propostaId, dados.itens);
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
      const claim = run(
        "UPDATE propostas SET updatedat=datetime('now','localtime') WHERE id=? AND ordemid IS NULL",
        [proposta.id]
      );
      if (claim.changes === 0) {
        const err = new Error("Esta proposta ja gerou uma OS.");
        err.status = 409;
        throw err;
      }

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
          prazoOSFromProposta(proposta.prazoentrega),
          "Normal",
          "Pix",
          observacoesOSFromProposta(proposta),
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
      const link = run(
        "UPDATE propostas SET ordemid=?, updatedat=datetime('now','localtime') WHERE id=? AND ordemid IS NULL",
        [id, proposta.id]
      );
      if (link.changes === 0) {
        const err = new Error("Esta proposta ja gerou uma OS.");
        err.status = 409;
        throw err;
      }
      return id;
    });

    res.status(201).json({ ok: true, ordemid: ordemId, ordem: getOne("SELECT * FROM ordens WHERE id=?", [ordemId]) });
  } catch (e) { next(e); }
});

module.exports = router;
