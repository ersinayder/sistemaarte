const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { getAll, getOne, run, runInsert } = require("../database");
const { auth } = require("../middlewares/auth");
const {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
} = require("../domain/userRules");

const ROLES_VALIDOS = ["admin","caixa","oficina"];

router.get("/", auth(["admin"]), (_req, res, next) => {
  try {
    res.json(getAll("SELECT id,name,username,role,active,createdat FROM users ORDER BY id"));
  } catch(e) { next(e); }
});

router.post("/", auth(["admin"]), (req, res, next) => {
  try {
    const { name, username, password, role } = req.body ?? {};
    if (!name || !username || !password || !role)
      return res.status(400).json({ error: "Todos os campos sao obrigatorios" });
    if (!ROLES_VALIDOS.includes(role))
      return res.status(400).json({ error: "Perfil invalido" });
    const senhaValidacao = validarSenhaUsuario(password, { required: true });
    if (!senhaValidacao.ok)
      return res.status(400).json({ error: senhaValidacao.error });
    const id = runInsert(
      "INSERT INTO users (name,username,password,role) VALUES (?,?,?,?)",
      [name, username, bcrypt.hashSync(password, 10), role]
    );
    res.json({ id, name, username, role });
  } catch(e) { next(e); }
});

router.put("/:id", auth(["admin"]), (req, res, next) => {
  try {
    const { name, role, active, password } = req.body ?? {};
    if (!ROLES_VALIDOS.includes(role))
      return res.status(400).json({ error: "Perfil invalido" });

    const atual = getOne("SELECT id, role, active FROM users WHERE id = ?", [req.params.id]);
    if (!atual) return res.status(404).json({ error: "Usuario nao encontrado" });

    const selfCheck = validarAlteracaoProprioUsuario({
      requesterId: req.user?.id,
      targetId: req.params.id,
      currentRole: atual.role,
      nextRole: role,
      nextActive: active ? 1 : 0,
    });
    if (!selfCheck.ok) return res.status(400).json({ error: selfCheck.error });

    const senhaValidacao = validarSenhaUsuario(password, { required: false });
    if (!senhaValidacao.ok)
      return res.status(400).json({ error: senhaValidacao.error });

    if (password) {
      run(
        "UPDATE users SET name=?,role=?,active=?,password=? WHERE id=?",
        [name, role, active ? 1 : 0, bcrypt.hashSync(password, 10), req.params.id]
      );
    } else {
      run(
        "UPDATE users SET name=?,role=?,active=? WHERE id=?",
        [name, role, active ? 1 : 0, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
