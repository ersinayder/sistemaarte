
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { getAll, getOne, run, runInsert } = require("../database");
const { auth } = require("../middlewares/auth");

const ROLES_VALIDOS = ["admin","caixa","oficina"];

router.get("/",    auth(["admin"]), (_req, res) =>
  res.json(getAll("SELECT id,name,username,role,active,createdat FROM users ORDER BY id"))
);

router.post("/", auth(["admin"]), (req, res) => {
  const { name, username, password, role } = req.body ?? {};
  if (!name || !username || !password || !role)
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  if (!ROLES_VALIDOS.includes(role))
    return res.status(400).json({ error: "Perfil inválido" });
  try {
    const id = runInsert(
      "INSERT INTO users (name,username,password,role) VALUES (?,?,?,?)",
      [name, username, bcrypt.hashSync(password,10), role]
    );
    res.json({ id, name, username, role });
  } catch {
    res.status(400).json({ error: "Usuário já existe" });
  }
});

router.put("/:id", auth(["admin"]), (req, res) => {
  const { name, role, active, password } = req.body ?? {};
  if (password && password.length >= 4) {
    run(
      "UPDATE users SET name=?,role=?,active=?,password=? WHERE id=?",
      [name, role, active ? 1 : 0, bcrypt.hashSync(password,10), req.params.id]
    );
  } else {
    run(
      "UPDATE users SET name=?,role=?,active=? WHERE id=?",
      [name, role, active ? 1 : 0, req.params.id]
    );
  }
  res.json({ ok: true });
});

module.exports = router;
