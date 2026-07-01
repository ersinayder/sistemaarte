const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");
const { normalizarPaginacao, montarMetaPaginacao } = require("../domain/paginationRules");
const { consultarCnpj } = require("../services/cnpjLookupService");

const SEL_CLIENTE = `
  SELECT c.*,
    (SELECT COUNT(*) FROM ordens WHERE clienteid=c.id AND deletedat IS NULL) AS totalordens,
    (SELECT COALESCE(SUM(valortotal),0) FROM ordens WHERE clienteid=c.id AND deletedat IS NULL) AS gastototal
  FROM clientes c
  WHERE c.deletedat IS NULL
`;

router.get("/", auth(["admin","caixa"]), (req, res, next) => {
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

router.get("/cnpj/:cnpj", auth(["admin","caixa"]), async (req, res, next) => {
  try {
    res.json(await consultarCnpj(req.params.cnpj));
  } catch(e) {
    next(e);
  }
});

router.get("/:id", auth(["admin","caixa"]), (req, res, next) => {
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

    const hoje = new Date().toISOString().slice(0, 10);
    const statusAberto = ['Aguardando', 'Em Produção', 'Pronto'];
    const osEmAberto = ordens.filter(o => statusAberto.includes(o.status)).length;

    const osVencidas = ordens.filter(o =>
      statusAberto.includes(o.status) &&
      o.prazoentrega &&
      o.prazoentrega.slice(0, 10) < hoje
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
      },
    });
  } catch(e) { next(e); }
});

router.get("/:id/ordens", auth(["admin","caixa"]), (req, res, next) => {
  try {
    res.json(getAll(
      "SELECT * FROM ordens WHERE clienteid=? AND deletedat IS NULL ORDER BY createdat DESC",
      [req.params.id]
    ));
  } catch(e) { next(e); }
});

router.post("/", auth(["admin","caixa"]), (req, res, next) => {
  try {
    const { name, phone, email, cpf, ie, logradouro, numero, bairro, cidade, uf, cep, notes } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Nome obrigatorio" });
    const id = runInsert(
      `INSERT INTO clientes
        (name, phone, email, cpf, ie, logradouro, numero, bairro, cidade, uf, cep, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name, phone||null, email||null, cpf||null, ie||null,
       logradouro||null, numero||null, bairro||null,
       cidade||null, uf||null, cep||null, notes||null]
    );
    res.json({ id, name });
  } catch(e) { next(e); }
});

router.put("/:id", auth(["admin","caixa"]), (req, res, next) => {
  try {
    const { name, phone, email, cpf, ie, logradouro, numero, bairro, cidade, uf, cep, notes } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Nome obrigatorio" });
    if (!getOne("SELECT id FROM clientes WHERE id=? AND deletedat IS NULL", [req.params.id]))
      return res.status(404).json({ error: "Cliente nao encontrado" });
    run(
      `UPDATE clientes
       SET name=?, phone=?, email=?, cpf=?, ie=?,
           logradouro=?, numero=?, bairro=?,
           cidade=?, uf=?, cep=?, notes=?
       WHERE id=?`,
      [name, phone||null, email||null, cpf||null, ie||null,
       logradouro||null, numero||null, bairro||null,
       cidade||null, uf||null, cep||null, notes||null,
       req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.delete("/:id", auth(["admin"]), (req, res, next) => {
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

module.exports = router;
