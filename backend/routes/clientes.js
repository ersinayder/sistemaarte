const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");

const SEL_CLIENTE = `
  SELECT c.*,
    (SELECT COUNT(*) FROM ordens WHERE clienteid=c.id) AS totalordens,
    (SELECT COALESCE(SUM(valortotal),0) FROM ordens WHERE clienteid=c.id) AS gastototal
  FROM clientes c
`;

router.get("/", auth(), (req, res, next) => {
  try {
    const q = req.query.q;
    if (q) {
      const lk = `%${q}%`;
      return res.json(getAll(
        SEL_CLIENTE + " WHERE c.name LIKE ? OR c.phone LIKE ? OR c.cpf LIKE ? OR c.ie LIKE ? OR c.cidade LIKE ? ORDER BY c.name LIMIT 20",
        [lk,lk,lk,lk,lk]
      ));
    }
    res.json(getAll(SEL_CLIENTE + " ORDER BY c.name"));
  } catch(e) { next(e); }
});

router.get("/:id", auth(), (req, res, next) => {
  try {
    const id = req.params.id;
    const c = getOne("SELECT * FROM clientes WHERE id=?", [id]);
    if (!c) return res.status(404).json({ error: "Cliente nao encontrado" });

    // Busca ordens sem datafinalizado (campo inexistente) — usa prazoentrega
    const ordens = getAll(
      "SELECT id, numero, status, servico, valortotal, createdat, prazoentrega FROM ordens WHERE clienteid=? ORDER BY createdat DESC",
      [id]
    );

    const total = ordens.reduce((s, o) => s + Number(o.valortotal || 0), 0);
    const ticketMedio = ordens.length ? total / ordens.length : 0;

    const hoje = new Date().toISOString().slice(0, 10);
    const statusAberto = ['Recebido', 'Em Produção', 'Pronto'];
    const osEmAberto = ordens.filter(o => statusAberto.includes(o.status)).length;

    // Corrigido: era o.datafinalizado (campo inexistente) → o.prazoentrega
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

router.get("/:id/ordens", auth(), (req, res, next) => {
  try {
    res.json(getAll(
      "SELECT * FROM ordens WHERE clienteid=? ORDER BY createdat DESC",
      [req.params.id]
    ));
  } catch(e) { next(e); }
});

router.post("/", auth(["admin","caixa"]), (req, res, next) => {
  try {
    const { name, phone, email, cpf, ie, address, cidade, uf, cep, notes } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Nome obrigatorio" });
    const id = runInsert(
      "INSERT INTO clientes (name,phone,email,cpf,ie,address,cidade,uf,cep,notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [name, phone||null, email||null, cpf||null, ie||null, address||null, cidade||null, uf||null, cep||null, notes||null]
    );
    res.json({ id, name });
  } catch(e) { next(e); }
});

router.put("/:id", auth(["admin","caixa"]), (req, res, next) => {
  try {
    const { name, phone, email, cpf, ie, address, cidade, uf, cep, notes } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Nome obrigatorio" });
    if (!getOne("SELECT id FROM clientes WHERE id=?", [req.params.id]))
      return res.status(404).json({ error: "Cliente nao encontrado" });
    run(
      "UPDATE clientes SET name=?,phone=?,email=?,cpf=?,ie=?,address=?,cidade=?,uf=?,cep=?,notes=? WHERE id=?",
      [name, phone||null, email||null, cpf||null, ie||null, address||null, cidade||null, uf||null, cep||null, notes||null, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.delete("/:id", auth(["admin"]), (req, res, next) => {
  try {
    const c = getOne("SELECT id,name FROM clientes WHERE id=?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Cliente nao encontrado" });
    transaction(() => {
      run("UPDATE ordens SET clienteid=NULL WHERE clienteid=?", [req.params.id]);
      run("DELETE FROM clientes WHERE id=?", [req.params.id]);
    });
    res.json({ ok: true, nome: c.name });
  } catch(e) { next(e); }
});

module.exports = router;
