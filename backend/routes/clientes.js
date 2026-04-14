
const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth } = require("../middlewares/auth");

const SEL_CLIENTE = `
  SELECT c.*,
    (SELECT COUNT(*) FROM ordens WHERE clienteid=c.id) AS totalordens,
    (SELECT COALESCE(SUM(valortotal),0) FROM ordens WHERE clienteid=c.id) AS gastototal
  FROM clientes c
`;

router.get("/", auth(), (req, res) => {
  const q = req.query.q;
  if (q) {
    const lk = `%${q}%`;
    return res.json(getAll(
      SEL_CLIENTE + " WHERE c.name LIKE ? OR c.phone LIKE ? OR c.cpf LIKE ? OR c.ie LIKE ? OR c.cidade LIKE ? ORDER BY c.name LIMIT 20",
      [lk,lk,lk,lk,lk]
    ));
  }
  res.json(getAll(SEL_CLIENTE + " ORDER BY c.name"));
});

router.get("/:id", auth(), (req, res) => {
  const c = getOne("SELECT * FROM clientes WHERE id=?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Cliente não encontrado" });
  res.json(c);
});

router.get("/:id/ordens", auth(), (req, res) => {
  res.json(getAll(
    "SELECT * FROM ordens WHERE clienteid=? ORDER BY createdat DESC",
    [req.params.id]
  ));
});

router.post("/", auth(["admin","caixa"]), (req, res) => {
  const { name, phone, email, cpf, ie, address, cidade, uf, cep, notes } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "Nome obrigatório" });
  const id = runInsert(
    "INSERT INTO clientes (name,phone,email,cpf,ie,address,cidade,uf,cep,notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [name, phone||null, email||null, cpf||null, ie||null, address||null, cidade||null, uf||null, cep||null, notes||null]
  );
  res.json({ id, name });
});

router.put("/:id", auth(["admin","caixa"]), (req, res) => {
  const { name, phone, email, cpf, ie, address, cidade, uf, cep, notes } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "Nome obrigatório" });
  if (!getOne("SELECT id FROM clientes WHERE id=?", [req.params.id]))
    return res.status(404).json({ error: "Cliente não encontrado" });
  run(
    "UPDATE clientes SET name=?,phone=?,email=?,cpf=?,ie=?,address=?,cidade=?,uf=?,cep=?,notes=? WHERE id=?",
    [name, phone||null, email||null, cpf||null, ie||null, address||null, cidade||null, uf||null, cep||null, notes||null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete("/:id", auth(["admin"]), (req, res) => {
  try {
    const c = getOne("SELECT id,name FROM clientes WHERE id=?", [req.params.id]);
    if (!c) return res.status(404).json({ error: "Cliente não encontrado" });
    transaction(() => {
      run("UPDATE ordens SET clienteid=NULL WHERE clienteid=?", [req.params.id]);
      run("DELETE FROM clientes WHERE id=?", [req.params.id]);
    });
    res.json({ ok: true, nome: c.name });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
