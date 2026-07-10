const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { getAll, getOne, run, runInsert } = require("../database");
const { auth, authPermission } = require("../middlewares/auth");
const {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
  validarAcaoProprioUsuario,
  validarUltimoAdminDisponivel,
} = require("../domain/userRules");
const { hasPermission } = require("../domain/permissionRules");
const {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  canPermanentlyDeleteUser,
} = require("../domain/userDeletionRules");

const ROLES_VALIDOS = ["admin", "caixa", "oficina"];

function normalizarPermissoes(row) {
  return String(row?.permissions_csv || "")
    .split(",")
    .map((permission) => permission.trim())
    .filter(Boolean);
}

function usuarioPublico(row) {
  if (!row) return null;
  const profileKey = row.profile_key || row.role;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    profile_key: profileKey,
    profile_name: row.profile_name || row.role,
    active: row.active,
    deletedat: row.deletedat,
    deletedpor: row.deletedpor,
    deletedreason: row.deletedreason,
    createdat: row.createdat,
    updatedat: row.updatedat,
    access_version: row.access_version,
    permissions: normalizarPermissoes(row),
  };
}

function buscarUsuario(id) {
  return getOne(
    `SELECT
       u.id,
       u.name,
       u.username,
       u.role,
       COALESCE(u.profile_key, u.role) AS profile_key,
       u.active,
       u.deletedat,
       u.deletedpor,
       u.deletedreason,
       u.createdat,
       u.updatedat,
       u.access_version,
       p.name AS profile_name,
       GROUP_CONCAT(pp.permission) AS permissions_csv
     FROM users u
     LEFT JOIN permission_profiles p ON p.key = COALESCE(u.profile_key, u.role)
     LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
     WHERE u.id=?
     GROUP BY u.id`,
    [id]
  );
}

function contarAdminsAtivos() {
  return Number(getOne(
    "SELECT COUNT(*) AS total FROM users WHERE role='admin' AND active=1 AND deletedat IS NULL"
  )?.total || 0);
}

function responderValidacao(res, validacao) {
  if (validacao.ok) return false;
  res.status(400).json({ error: validacao.error });
  return true;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hasOwn(body, field) {
  return Object.prototype.hasOwnProperty.call(body || {}, field);
}

function isDuplicateUsernameError(error) {
  const message = String(error?.message || "");
  return message.includes("users.username")
    && (message.includes("UNIQUE constraint failed") || message.includes("SQLITE_CONSTRAINT"));
}

function responderUsernameDuplicado(res, error) {
  if (!isDuplicateUsernameError(error)) return false;
  res.status(409).json({ error: "Nome de usuario ja em uso." });
  return true;
}

function isMissingReferenceError(error) {
  const message = String(error?.message || "");
  return message.includes("no such table") || message.includes("no such column");
}

function contarReferenciasHistoricas(userId) {
  return USER_HISTORY_REFERENCES.map((reference) => {
    try {
      const row = getOne(
        `SELECT COUNT(*) AS total FROM ${reference.table} WHERE ${reference.column}=?`,
        [userId]
      );
      return { ...reference, total: Number(row?.total || 0) };
    } catch (error) {
      if (isMissingReferenceError(error)) {
        return { ...reference, total: 0 };
      }
      throw error;
    }
  });
}

function validarRemocaoUltimoAdmin(res, usuario, action) {
  return responderValidacao(res, validarUltimoAdminDisponivel({
    targetRole: usuario.role,
    targetActive: usuario.active,
    targetDeletedat: usuario.deletedat,
    activeAdminCount: contarAdminsAtivos(),
    action,
  }));
}

router.get("/", auth(), authPermission("usuarios.ver"), (req, res, next) => {
  try {
    const requestedStatus = String(req.query?.status || "active");
    const status = ["active", "inactive", "archived", "all"].includes(requestedStatus) ? requestedStatus : "active";
    const role = String(req.query?.role || "");
    const q = String(req.query?.q || "").trim();
    const where = [];
    const params = [];

    if (status === "active") where.push("u.active=1 AND u.deletedat IS NULL");
    else if (status === "inactive") where.push("u.active=0 AND u.deletedat IS NULL");
    else if (status === "archived") where.push("u.deletedat IS NOT NULL");
    else if (status !== "all") where.push("u.active=1 AND u.deletedat IS NULL");

    if (role && ROLES_VALIDOS.includes(role)) {
      where.push("u.role=?");
      params.push(role);
    }

    if (q) {
      where.push("(u.name LIKE ? OR u.username LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    const sql = `SELECT
       u.id,
       u.name,
       u.username,
       u.role,
       COALESCE(u.profile_key, u.role) AS profile_key,
       u.active,
       u.deletedat,
       u.deletedpor,
       u.deletedreason,
       u.createdat,
       u.updatedat,
       u.access_version,
       p.name AS profile_name,
       GROUP_CONCAT(pp.permission) AS permissions_csv
     FROM users u
     LEFT JOIN permission_profiles p ON p.key = COALESCE(u.profile_key, u.role)
     LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY u.id
     ORDER BY u.id`;
    const users = getAll(sql, params).map(usuarioPublico);
    res.json({
      users,
      meta: {
        total: users.length,
        filters: { status, role: role || undefined, q: q || undefined },
      },
    });
  } catch(e) { next(e); }
});

router.post("/", auth(), authPermission("usuarios.criar"), (req, res, next) => {
  try {
    const name = normalizeText(req.body?.name);
    const username = normalizeText(req.body?.username);
    const password = req.body?.password;
    const role = normalizeText(req.body?.role);
    if (!name || !username || !password || !role)
      return res.status(400).json({ error: "Todos os campos sao obrigatorios" });
    if (!ROLES_VALIDOS.includes(role))
      return res.status(400).json({ error: "Perfil invalido" });
    const senhaValidacao = validarSenhaUsuario(password, { required: true });
    if (!senhaValidacao.ok)
      return res.status(400).json({ error: senhaValidacao.error });
    let id;
    try {
      id = runInsert(
        "INSERT INTO users (name,username,password,role,profile_key) VALUES (?,?,?,?,?)",
        [name, username, bcrypt.hashSync(password, 10), role, role]
      );
    } catch (e) {
      if (responderUsernameDuplicado(res, e)) return;
      throw e;
    }
    res.json({ id, name, username, role, profile_key: role });
  } catch(e) { next(e); }
});

router.put("/:id", auth(), authPermission("usuarios.editar"), (req, res, next) => {
  try {
    const body = req.body ?? {};
    const { active, password } = body;
    const atual = buscarUsuario(req.params.id);
    if (!atual) return res.status(404).json({ error: "Usuario nao encontrado" });

    const hasName = hasOwn(body, "name");
    const hasUsername = hasOwn(body, "username");
    const hasRole = hasOwn(body, "role");
    const hasPassword = hasOwn(body, "password") && String(password ?? "") !== "";
    const nextName = hasName ? normalizeText(body.name) : atual.name;
    const nextUsername = hasUsername ? normalizeText(body.username) : atual.username;
    const nextRole = hasRole ? normalizeText(body.role) : atual.role;
    const nextActive = active == null ? Number(atual.active) : (active ? 1 : 0);
    if ((hasName && !nextName) || (hasUsername && !nextUsername))
      return res.status(400).json({ error: "Todos os campos sao obrigatorios" });
    if (!ROLES_VALIDOS.includes(nextRole))
      return res.status(400).json({ error: "Perfil invalido" });
    if (hasPassword && !hasPermission(req.user, "usuarios.resetar_senha")) {
      return res.status(403).json({ error: "Sem permissao" });
    }

    const selfCheck = validarAlteracaoProprioUsuario({
      requesterId: req.user?.id,
      targetId: req.params.id,
      currentRole: atual.role,
      nextRole,
      nextActive,
    });
    if (!selfCheck.ok) return res.status(400).json({ error: selfCheck.error });

    const action = atual.role !== nextRole ? "change_role" : "deactivate";
    if ((atual.role !== nextRole || Number(atual.active) !== nextActive) && validarRemocaoUltimoAdmin(res, atual, action)) return;

    const senhaValidacao = validarSenhaUsuario(password, { required: false });
    if (!senhaValidacao.ok)
      return res.status(400).json({ error: senhaValidacao.error });

    const mustIncrementAccessVersion = atual.role !== nextRole
      || (atual.profile_key || atual.role) !== nextRole
      || Number(atual.active) !== nextActive
      || atual.username !== nextUsername
      || hasPassword;
    const accessVersionSql = mustIncrementAccessVersion ? ", access_version=access_version+1" : "";

    try {
      if (hasPassword) {
        run(
          `UPDATE users SET name=?,username=?,role=?,profile_key=?,active=?,password=?,updatedat=datetime('now','localtime')${accessVersionSql} WHERE id=?`,
          [nextName, nextUsername, nextRole, nextRole, nextActive, bcrypt.hashSync(password, 10), req.params.id]
        );
      } else {
        run(
          `UPDATE users SET name=?,username=?,role=?,profile_key=?,active=?,updatedat=datetime('now','localtime')${accessVersionSql} WHERE id=?`,
          [nextName, nextUsername, nextRole, nextRole, nextActive, req.params.id]
        );
      }
    } catch (e) {
      if (responderUsernameDuplicado(res, e)) return;
      throw e;
    }
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.get("/:id/delete-check", auth(), authPermission("usuarios.excluir_permanente"), (req, res, next) => {
  try {
    const usuario = buscarUsuario(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado" });
    res.json(canPermanentlyDeleteUser(contarReferenciasHistoricas(req.params.id)));
  } catch(e) { next(e); }
});

router.post("/:id/archive", auth(), authPermission("usuarios.arquivar"), (req, res, next) => {
  try {
    const usuario = buscarUsuario(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado" });

    const selfCheck = validarAcaoProprioUsuario({
      requesterId: req.user?.id,
      targetId: req.params.id,
      action: "archive",
    });
    if (responderValidacao(res, selfCheck)) return;
    if (validarRemocaoUltimoAdmin(res, usuario, "archive")) return;

    run(
      "UPDATE users SET active=0, deletedat=datetime('now','localtime'), deletedpor=?, deletedreason=?, updatedat=datetime('now','localtime'), access_version=access_version+1 WHERE id=?",
      [req.user?.id, normalizeArchiveReason(req.body?.reason), req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.post("/:id/restore", auth(), authPermission("usuarios.restaurar"), (req, res, next) => {
  try {
    const usuario = buscarUsuario(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado" });

    const selfCheck = validarAcaoProprioUsuario({
      requesterId: req.user?.id,
      targetId: req.params.id,
      action: "restore",
    });
    if (responderValidacao(res, selfCheck)) return;
    if (!usuario.deletedat) return res.status(400).json({ error: "Usuario nao esta arquivado" });

    run(
      "UPDATE users SET active=1, deletedat=NULL, deletedpor=NULL, deletedreason=NULL, updatedat=datetime('now','localtime'), access_version=access_version+1 WHERE id=?",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.post("/:id/reset-password", auth(), authPermission("usuarios.resetar_senha"), (req, res, next) => {
  try {
    const usuario = buscarUsuario(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado" });

    const selfCheck = validarAcaoProprioUsuario({
      requesterId: req.user?.id,
      targetId: req.params.id,
      action: "reset_password",
    });
    if (responderValidacao(res, selfCheck)) return;

    const senhaValidacao = validarSenhaUsuario(req.body?.password, { required: true });
    if (!senhaValidacao.ok) return res.status(400).json({ error: senhaValidacao.error });

    run(
      "UPDATE users SET password=?, updatedat=datetime('now','localtime'), access_version=access_version+1 WHERE id=?",
      [bcrypt.hashSync(req.body.password, 10), req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { next(e); }
});

router.delete("/:id", auth(), authPermission("usuarios.excluir_permanente"), (req, res, next) => {
  try {
    const usuario = buscarUsuario(req.params.id);
    if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado" });

    const selfCheck = validarAcaoProprioUsuario({
      requesterId: req.user?.id,
      targetId: req.params.id,
      action: "delete_permanent",
    });
    if (responderValidacao(res, selfCheck)) return;
    if (validarRemocaoUltimoAdmin(res, usuario, "delete_permanent")) return;

    const resultado = canPermanentlyDeleteUser(contarReferenciasHistoricas(req.params.id));
    if (!resultado.allowed) {
      return res.status(409).json({
        error: "Usuario possui historico e nao pode ser excluido permanentemente",
        blockers: resultado.blockers,
      });
    }

    run("DELETE FROM users WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { next(e); }
});

module.exports = router;
