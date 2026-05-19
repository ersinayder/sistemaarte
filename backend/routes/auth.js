const router    = require("express").Router();
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { getOne } = require("../database");
const { auth, JWT_SECRET } = require("../middlewares/auth");
const {
  criarEstadoLockout,
  registrarFalhaLogin,
  registrarSucessoLogin,
  verificarLockoutLogin,
} = require("../domain/loginLockoutRules");

const IS_PROD = process.env.NODE_ENV === "production";

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: "lax",
  maxAge:   12 * 60 * 60 * 1000,
  path:     "/",
};

const loginLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: "Muitas tentativas. Tente novamente em 15 minutos." },
  skipSuccessfulRequests: true,
});

const loginLockoutState = criarEstadoLockout();

// POST /api/auth/login
router.post("/login", loginLimiter, (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password)
    return res.status(400).json({ error: "Usuario e senha obrigatorios" });

  const lock = verificarLockoutLogin(loginLockoutState, username);
  if (lock.locked) {
    const minutos = Math.max(1, Math.ceil(lock.retryAfterMs / 60000));
    return res.status(429).json({ error: `Usuario bloqueado temporariamente. Tente novamente em ${minutos} minuto(s).` });
  }

  const user = getOne(
    "SELECT * FROM users WHERE username=? AND active=1",
    [username]
  );
  if (!user || !bcrypt.compareSync(password, user.password)) {
    registrarFalhaLogin(loginLockoutState, username);
    return res.status(401).json({ error: "Usuario ou senha invalidos" });
  }

  registrarSucessoLogin(loginLockoutState, username);

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
