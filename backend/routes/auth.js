const router  = require("express").Router();
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");
const { getOne } = require("../database");
const { auth, JWT_SECRET } = require("../middlewares/auth");

const IS_PROD = process.env.NODE_ENV === "production";

const COOKIE_OPTS = {
  httpOnly: true,          // inacessível via JS — bloqueia XSS
  secure:   IS_PROD,       // HTTPS only em produção
  sameSite: "lax",         // protege contra CSRF em navegações normais
  maxAge:   12 * 60 * 60 * 1000, // 12h em ms
  path:     "/",
};

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

  const payload = { id: user.id, name: user.name, username: user.username, role: user.role };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });

  res.cookie("token", token, COOKIE_OPTS);
  res.json({ user: payload });
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", auth(), (req, res) => res.json(req.user));

module.exports = router;
