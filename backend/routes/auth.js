const router    = require("express").Router();
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { getOne } = require("../database");
const { auth, JWT_SECRET, normalizarUsuarioSessao } = require("../middlewares/auth");
const {
  criarEstadoLockout,
  registrarFalhaLogin,
  registrarSucessoLogin,
  verificarLockoutLogin,
} = require("../domain/loginLockoutRules");

const IS_PROD = process.env.NODE_ENV === "production";
const DUMMY_PASSWORD_HASH = "$2a$10$S.4ZIqKrMoR1gFmTBUCPG.rEU3spWl7WSzB5fsH/5ekhyXRcPXk5K";

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
    `SELECT
       u.*,
       COALESCE(u.profile_key, u.role) AS profile_key,
       p.name AS profile_name,
       p.active AS profile_active,
       GROUP_CONCAT(pp.permission) AS permissions_csv
     FROM users u
     LEFT JOIN permission_profiles p ON p.key = COALESCE(u.profile_key, u.role)
     LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
     WHERE u.username=? AND u.active=1 AND u.deletedat IS NULL
     GROUP BY u.id`,
    [username]
  );
  const senhaValida = bcrypt.compareSync(password, user?.password || DUMMY_PASSWORD_HASH);
  if (!user || !senhaValida) {
    registrarFalhaLogin(loginLockoutState, username);
    return res.status(401).json({ error: "Usuario ou senha invalidos" });
  }

  const sessionUser = normalizarUsuarioSessao(user);
  if (!sessionUser || Number(sessionUser.profile_active) !== 1) {
    registrarFalhaLogin(loginLockoutState, username);
    return res.status(401).json({ error: "Usuario ou senha invalidos" });
  }

  registrarSucessoLogin(loginLockoutState, username);

  const payload = {
    id: sessionUser.id,
    accessVersion: Number(sessionUser.access_version || 1),
  };
  const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });

  res.cookie("token", token, COOKIE_OPTS);
  res.json({ user: sessionUser });
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  res.clearCookie("token", { path: "/" });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", auth(), (req, res) => res.json(req.user));

module.exports = router;
