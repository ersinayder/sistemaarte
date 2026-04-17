const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("FATAL: JWT_SECRET não definido. Configure a variável de ambiente.");
}
const JWT_SECRET = SECRET || "oficina-dev-secret-troque-em-producao";

/**
 * Lê o token do cookie HttpOnly (preferencial) ou do header Authorization (fallback).
 * Middleware de autenticação e autorização por roles.
 * @param {string[]} roles - Roles permitidas (vazio = qualquer autenticado)
 */
function auth(roles = []) {
  return (req, res, next) => {
    // 1. Cookie HttpOnly (produção)
    let token = req.cookies?.token;

    // 2. Fallback: header Authorization: Bearer <token> (dev / chamadas diretas)
    if (!token) {
      const header = req.headers.authorization;
      token = header?.startsWith("Bearer ") ? header.slice(7) : header;
    }

    if (!token) return res.status(401).json({ error: "Token necessário" });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ error: "Sem permissão" });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }
  };
}

module.exports = { auth, JWT_SECRET };
