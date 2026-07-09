const jwt = require("jsonwebtoken");
const { getOne } = require("../database");
const { validarSessaoUsuario } = require("../domain/userRules");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET nao definido. Configure a variavel de ambiente.");
}

let lookupUsuarioAtual = (payload) => getOne(
  `SELECT
     u.id,
     u.name,
     u.username,
     u.role,
     COALESCE(u.profile_key, u.role) AS profile_key,
     u.active,
     u.deletedat,
     u.access_version,
     p.name AS profile_name,
     p.active AS profile_active,
     GROUP_CONCAT(pp.permission) AS permissions_csv
   FROM users u
   LEFT JOIN permission_profiles p ON p.key = COALESCE(u.profile_key, u.role)
   LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
   WHERE u.id=?
   GROUP BY u.id`,
  [payload.id]
);

function setSessionUserLookupForTests(fn) {
  lookupUsuarioAtual = fn;
}

function normalizarPermissoes(row) {
  if (Array.isArray(row.permissions)) {
    return row.permissions
      .map((permission) => String(permission).trim())
      .filter(Boolean);
  }

  return String(row.permissions_csv || "")
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);
}

function normalizarUsuarioSessao(row) {
  if (!row) return null;

  const profileKey = row.profile_key || row.role;
  const profileActive = row.profile_active == null ? 1 : Number(row.profile_active);

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    profile_key: profileKey,
    profile: {
      key: profileKey,
      name: row.profile_name || row.role,
      active: profileActive,
    },
    active: row.active,
    deletedat: row.deletedat,
    access_version: row.access_version,
    profile_active: profileActive,
    permissions: normalizarPermissoes(row),
  };
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
      const usuarioAtual = normalizarUsuarioSessao(lookupUsuarioAtual(payload));
      const sessao = validarSessaoUsuario(payload, usuarioAtual);
      if (!sessao.ok) {
        return res.status(sessao.status || 401).json({ error: sessao.error });
      }

      if (roles.length && !roles.includes(usuarioAtual.role)) {
        return res.status(403).json({ error: "Sem permissao" });
      }
      req.user = usuarioAtual;
      next();
    } catch {
      return res.status(401).json({ error: "Token invalido ou expirado" });
    }
  };

  middleware._roles = roles;
  return middleware;
}

module.exports = { auth, JWT_SECRET, setSessionUserLookupForTests, normalizarUsuarioSessao };
