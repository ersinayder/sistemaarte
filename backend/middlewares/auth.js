const jwt = require("jsonwebtoken");
const { getOne } = require("../database");
const { validarSessaoUsuario } = require("../domain/userRules");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET nao definido. Configure a variavel de ambiente.");
}

let lookupUsuarioAtual = (payload) => getOne(
  "SELECT id, role, active FROM users WHERE id=?",
  [payload.id]
);

function setSessionUserLookupForTests(fn) {
  lookupUsuarioAtual = fn;
}

/**
 * Le o token do cookie HttpOnly (preferencial) ou do header Authorization (fallback).
 * Middleware de autenticacao e autorizacao por roles.
 * @param {string[]} roles - Roles permitidas (vazio = qualquer autenticado)
 */
function auth(roles = []) {
  const middleware = (req, res, next) => {
    let token = req.cookies?.token;

    if (!token) {
      const header = req.headers.authorization;
      token = header?.startsWith("Bearer ") ? header.slice(7) : header;
    }

    if (!token) return res.status(401).json({ error: "Token necessario" });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const usuarioAtual = lookupUsuarioAtual(payload);
      const sessao = validarSessaoUsuario(payload, usuarioAtual);
      if (!sessao.ok) {
        return res.status(sessao.status || 401).json({ error: sessao.error });
      }

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Sem permissao" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Token invalido ou expirado" });
    }
  };

  middleware._roles = roles;
  return middleware;
}

module.exports = { auth, JWT_SECRET, setSessionUserLookupForTests };
