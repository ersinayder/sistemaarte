
const router  = require("express").Router();
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");
const { getOne } = require("../database");
const { auth, JWT_SECRET } = require("../middlewares/auth");

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: "Usuário e senha obrigatórios" });

  const user = getOne(
    "SELECT * FROM users WHERE username=? AND active=1",
    [username]
  );
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Usuário ou senha inválidos" });

  const token = jwt.sign(
    { id: user.id, name: user.name, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
  res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

// GET /api/auth/me
router.get("/me", auth(), (req, res) => res.json(req.user));

module.exports = router;
