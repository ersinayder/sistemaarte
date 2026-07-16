const router = require("express").Router();
const { getAll, getOne, run, runInsert, transaction } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const {
  PERMISSIONS,
  DEFAULT_PROFILES,
  DEFAULT_PROFILE_PERMISSIONS,
  assertKnownPermissions,
  getPermissionCatalog,
  normalizePermissions,
  sortPermissionsByCatalog,
} = require("../domain/permissionRules");

const SECURITY_PROFILE_PERMISSIONS = ["usuarios.ver", "usuarios.editar", "usuarios.restaurar", "configuracoes.seguranca"];
const ROLES_VALIDOS = ["admin", "caixa", "oficina"];
const PROFILE_KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

function normalizarPermissoesCsv(row) {
  return sortPermissionsByCatalog(
    String(row?.permissions_csv || "")
      .split(",")
      .map((permission) => permission.trim())
      .filter(Boolean)
  );
}

function normalizarTexto(value) {
  return String(value ?? "").trim();
}

function normalizarPermissoesEntrada(permissions) {
  const normalized = normalizePermissions(permissions).map((permission) => String(permission).trim()).filter(Boolean);
  assertKnownPermissions(normalized);
  return sortPermissionsByCatalog(normalized);
}

function perfilPublico(row) {
  return {
    key: row.key,
    name: row.name,
    description: row.description || "",
    base_role: row.base_role || row.key,
    system: Number(row.system) === 1,
    active: Number(row.active) === 1,
    createdat: row.createdat,
    updatedat: row.updatedat,
    user_count: Number(row.user_count || 0),
    active_user_count: Number(row.active_user_count || 0),
    permissions: normalizarPermissoesCsv(row),
    default_permissions: sortPermissionsByCatalog(DEFAULT_PROFILE_PERMISSIONS[row.key] || []),
  };
}

function buscarPerfil(key) {
  return getOne(
    `SELECT
       p.id,
       p.key,
       p.name,
       p.description,
       p.base_role,
       p.system,
       p.active,
       p.createdat,
       p.updatedat,
       COUNT(DISTINCT u.id) AS user_count,
       COUNT(DISTINCT CASE WHEN u.active=1 AND u.deletedat IS NULL THEN u.id END) AS active_user_count,
       GROUP_CONCAT(DISTINCT pp.permission) AS permissions_csv
     FROM permission_profiles p
     LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
     LEFT JOIN users u ON COALESCE(u.profile_key, u.role) = p.key
     WHERE p.key=?
     GROUP BY p.id`,
    [key]
  );
}

function listarPerfis() {
  return getAll(
    `SELECT
       p.id,
       p.key,
       p.name,
       p.description,
       p.base_role,
       p.system,
       p.active,
       p.createdat,
       p.updatedat,
       COUNT(DISTINCT u.id) AS user_count,
       COUNT(DISTINCT CASE WHEN u.active=1 AND u.deletedat IS NULL THEN u.id END) AS active_user_count,
       GROUP_CONCAT(DISTINCT pp.permission) AS permissions_csv
     FROM permission_profiles p
     LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
     LEFT JOIN users u ON COALESCE(u.profile_key, u.role) = p.key
     GROUP BY p.id
     ORDER BY p.system DESC, p.name COLLATE NOCASE`
  ).map(perfilPublico);
}

function listarPermissoesPorPerfil({ targetKey, targetPermissions, targetActive }) {
  const rows = getAll(
    `SELECT p.key, p.active, GROUP_CONCAT(pp.permission) AS permissions_csv
     FROM permission_profiles p
     LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
     GROUP BY p.id`
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.key, {
      active: Number(row.active) === 1,
      permissions: normalizarPermissoesCsv(row),
    });
  }
  if (targetKey) {
    map.set(targetKey, {
      active: Number(targetActive) === 1,
      permissions: sortPermissionsByCatalog(targetPermissions || []),
    });
  }
  return map;
}

function validarCoberturaAdministrativa({ targetKey, targetPermissions, targetActive }) {
  const permissionsByProfile = listarPermissoesPorPerfil({ targetKey, targetPermissions, targetActive });
  const users = getAll(
    "SELECT id, COALESCE(profile_key, role) AS profile_key FROM users WHERE active=1 AND deletedat IS NULL"
  );
  const total = users.filter((user) => {
    const profile = permissionsByProfile.get(user.profile_key);
    if (!profile?.active) return false;
    return SECURITY_PROFILE_PERMISSIONS.every((permission) => profile.permissions.includes(permission));
  }).length;

  if (total < 1) {
    return {
      ok: false,
      error: "Nao e possivel deixar o sistema sem um usuario ativo com permissao para gerenciar usuarios",
    };
  }

  return { ok: true };
}

function validarPerfilAdmin(perfil, permissions, active) {
  if (perfil.key !== "admin") return { ok: true };
  if (Number(active) !== 1) {
    return { ok: false, error: "O perfil Administrador nao pode ser desativado" };
  }
  const missing = PERMISSIONS.filter((permission) => !permissions.includes(permission));
  if (missing.length > 0) {
    return { ok: false, error: "O perfil Administrador deve manter todas as permissoes" };
  }
  return { ok: true };
}

function substituirPermissoesPerfil(profileId, permissions) {
  run("DELETE FROM profile_permissions WHERE profile_id=?", [profileId]);
  for (const permission of permissions) {
    run(
      "INSERT INTO profile_permissions (profile_id, permission) VALUES (?, ?)",
      [profileId, permission]
    );
  }
}

function invalidarSessoesDoPerfil(profileKey) {
  run(
    "UPDATE users SET access_version=access_version+1, updatedat=datetime('now','localtime') WHERE COALESCE(profile_key, role)=? AND deletedat IS NULL",
    [profileKey]
  );
}

function responderValidacao(res, validacao) {
  if (validacao.ok) return false;
  res.status(400).json({ error: validacao.error });
  return true;
}

function responderPermissaoDesconhecida(res, error) {
  const message = String(error?.message || "");
  if (!message.startsWith("Permissao desconhecida:")) return false;
  res.status(400).json({ error: message });
  return true;
}

function catalogoResposta() {
  return {
    permissions: PERMISSIONS,
    permissionGroups: getPermissionCatalog(),
  };
}

function normalizarChavePerfil(value) {
  return normalizarTexto(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function validarBaseRole(baseRole) {
  return ROLES_VALIDOS.includes(baseRole);
}

router.get("/", auth(), authPermission("usuarios.ver"), (_req, res, next) => {
  try {
    res.json({
      profiles: listarPerfis(),
      defaults: DEFAULT_PROFILE_PERMISSIONS,
      defaultProfiles: DEFAULT_PROFILES,
      ...catalogoResposta(),
    });
  } catch (e) { next(e); }
});

router.get("/:key", auth(), authPermission("usuarios.ver"), (req, res, next) => {
  try {
    const perfil = buscarPerfil(req.params.key);
    if (!perfil) return res.status(404).json({ error: "Perfil nao encontrado" });
    res.json({
      profile: perfilPublico(perfil),
      ...catalogoResposta(),
    });
  } catch (e) { next(e); }
});

router.post("/", auth(), authPermission("configuracoes.seguranca"), (req, res, next) => {
  try {
    const key = normalizarChavePerfil(req.body?.key || req.body?.name);
    const name = normalizarTexto(req.body?.name);
    const description = normalizarTexto(req.body?.description);
    const baseRole = normalizarTexto(req.body?.base_role);
    const sourceKey = normalizarChavePerfil(req.body?.source_profile_key || baseRole);

    if (!key || !name || !baseRole) return res.status(400).json({ error: "Chave, nome e tipo estrutural sao obrigatorios" });
    if (!PROFILE_KEY_RE.test(key)) return res.status(400).json({ error: "Chave do perfil invalida" });
    if (DEFAULT_PROFILE_PERMISSIONS[key]) return res.status(400).json({ error: "Chave reservada para perfil de sistema" });
    if (!validarBaseRole(baseRole)) return res.status(400).json({ error: "Tipo estrutural invalido" });
    if (getOne("SELECT id FROM permission_profiles WHERE key=?", [key])) {
      return res.status(409).json({ error: "Perfil ja existe" });
    }

    const sourceProfile = buscarPerfil(sourceKey);
    if (!sourceProfile) return res.status(400).json({ error: "Perfil base nao encontrado" });
    if (Number(sourceProfile.active) !== 1) return res.status(400).json({ error: "Perfil base inativo" });
    if ((sourceProfile.base_role || sourceProfile.key) !== baseRole) {
      return res.status(400).json({ error: "Perfil base incompativel com o tipo estrutural" });
    }

    const permissions = Array.isArray(req.body?.permissions)
      ? normalizarPermissoesEntrada(req.body.permissions)
      : normalizarPermissoesCsv(sourceProfile);
    let profileId;

    transaction(() => {
      profileId = runInsert(
        "INSERT INTO permission_profiles (key,name,description,base_role,system,active) VALUES (?,?,?,?,0,1)",
        [key, name, description, baseRole]
      );
      substituirPermissoesPerfil(profileId, permissions);
    });

    res.json({ ok: true, profile: perfilPublico(buscarPerfil(key)) });
  } catch (e) {
    if (responderPermissaoDesconhecida(res, e)) return;
    next(e);
  }
});

router.put("/:key", auth(), authPermission("configuracoes.seguranca"), (req, res, next) => {
  try {
    const perfil = buscarPerfil(req.params.key);
    if (!perfil) return res.status(404).json({ error: "Perfil nao encontrado" });

    const name = normalizarTexto(req.body?.name);
    const description = normalizarTexto(req.body?.description);
    const active = req.body?.active == null ? Number(perfil.active) : (req.body.active ? 1 : 0);
    const permissions = normalizarPermissoesEntrada(req.body?.permissions);

    if (!name) return res.status(400).json({ error: "Nome do perfil e obrigatorio" });
    if (responderValidacao(res, validarPerfilAdmin(perfil, permissions, active))) return;
    if (responderValidacao(res, validarCoberturaAdministrativa({
      targetKey: perfil.key,
      targetPermissions: permissions,
      targetActive: active,
    }))) return;

    transaction(() => {
      run(
        "UPDATE permission_profiles SET name=?, description=?, active=?, updatedat=datetime('now','localtime') WHERE id=?",
        [name, description, active, perfil.id]
      );
      substituirPermissoesPerfil(perfil.id, permissions);
      invalidarSessoesDoPerfil(perfil.key);
    });

    res.json({ ok: true, profile: perfilPublico(buscarPerfil(perfil.key)) });
  } catch (e) {
    if (responderPermissaoDesconhecida(res, e)) return;
    next(e);
  }
});

router.post("/:key/restore-defaults", auth(), authPermission("configuracoes.seguranca"), (req, res, next) => {
  try {
    const perfil = buscarPerfil(req.params.key);
    if (!perfil) return res.status(404).json({ error: "Perfil nao encontrado" });
    if (!DEFAULT_PROFILE_PERMISSIONS[perfil.key]) {
      return res.status(400).json({ error: "Este perfil nao possui padrao de restauracao" });
    }

    const defaultProfile = DEFAULT_PROFILES.find((item) => item.key === perfil.key);
    const permissions = sortPermissionsByCatalog(DEFAULT_PROFILE_PERMISSIONS[perfil.key] || []);
    if (responderValidacao(res, validarCoberturaAdministrativa({
      targetKey: perfil.key,
      targetPermissions: permissions,
      targetActive: 1,
    }))) return;

    transaction(() => {
      run(
        "UPDATE permission_profiles SET name=?, description=?, active=1, system=1, updatedat=datetime('now','localtime') WHERE id=?",
        [defaultProfile?.name || perfil.name, defaultProfile?.description || perfil.description || "", perfil.id]
      );
      substituirPermissoesPerfil(perfil.id, permissions);
      invalidarSessoesDoPerfil(perfil.key);
    });

    res.json({ ok: true, profile: perfilPublico(buscarPerfil(perfil.key)) });
  } catch (e) { next(e); }
});

module.exports = router;
