# RBAC Fase 1 Fundacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a fundacao RBAC sem migrar rotas de negocio, mantendo `admin`, `caixa` e `oficina` funcionando como hoje.

**Architecture:** Esta fase adiciona permissoes canonicas, perfis de sistema e resolucao de permissoes no backend. `role` continua existindo como compatibilidade; `profile_key` passa a ser a fonte nova de perfil. O JWT fica minimo e a cada request o backend revalida usuario, perfil, arquivamento e `access_version` no banco.

**Tech Stack:** Node.js 22, Express 4, CommonJS, better-sqlite3, Vitest 4.1, React 18/Vite apenas para leitura posterior de `/auth/me`.

---

## Scope

Implementar somente a Fase 1 do spec aprovado em `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`.

Nao migrar rotas como `ordens`, `caixa`, `nfe`, `financeiro`, `configuracoes` ou `users` para `authPermission` nesta fase. Elas continuam com `auth(["admin"])` e similares. O objetivo e preparar a base sem mudar comportamento operacional.

## File Structure

Create:

- `backend/domain/permissionRules.js`: lista canonica de permissoes, perfis default, validadores e helpers puros.
- `backend/__tests__/permissionRules.test.js`: testes unitarios da matriz de permissoes.
- `backend/__tests__/authRoutes.test.js`: teste focado da forma publica de login e token.

Modify:

- `backend/database.js`: schema, migrations, seed idempotente de perfis/permissoes, backfill de `users.profile_key`.
- `backend/domain/userRules.js`: validacao de sessao com arquivamento, perfil ativo e `access_version`.
- `backend/middlewares/auth.js`: lookup enriquecido, `req.user` montado do banco, permissoes efetivas, compatibilidade com roles.
- `backend/routes/auth.js`: login com token minimo e resposta publica com permissoes.
- `backend/__tests__/userRules.test.js`: novas regras de sessao.
- `backend/__tests__/auth.test.js`: middleware usando dados atuais do banco.
- `backend/__tests__/databaseMigrations.test.js`: contratos de fonte para schema/migrations RBAC.

Do not modify:

- `backend/routes/ordens.js`
- `backend/routes/caixa.js`
- `backend/routes/nfe.js`
- `frontend/src/App.jsx`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/pages/Usuarios.jsx`

Esses arquivos entram em fases posteriores.

## Permission Matrix For Phase 1

Use these exact permission keys in `backend/domain/permissionRules.js`:

```js
const PERMISSIONS = [
  "dashboard.ver",
  "dashboard.integridade",
  "atendimento.ver",
  "ordens.ver",
  "ordens.criar",
  "ordens.editar",
  "ordens.alterar_status",
  "ordens.cancelar",
  "ordens.excluir",
  "ordens.restaurar",
  "ordens.excluir_permanente",
  "ordens.imprimir",
  "ordens.whatsapp",
  "oficina.ver",
  "oficina.alterar_status",
  "caixa.ver",
  "caixa.criar_lancamento",
  "caixa.editar_lancamento",
  "caixa.excluir_lancamento",
  "caixa.fechamento",
  "clientes.ver",
  "clientes.criar",
  "clientes.editar",
  "clientes.excluir",
  "clientes.consultar_documentos",
  "produtos.ver",
  "produtos.criar",
  "produtos.editar",
  "produtos.excluir",
  "propostas.ver",
  "propostas.criar",
  "propostas.editar_status",
  "propostas.gerar_os",
  "propostas.imprimir",
  "financeiro.ver",
  "financeiro.contas_pagar.ver",
  "financeiro.contas_pagar.editar",
  "financeiro.contas_pagar.pagar",
  "financeiro.relatorios",
  "nfe.ver",
  "nfe.emitir",
  "nfe.cancelar",
  "nfe.cce",
  "nfe.xml",
  "nfe.danfe",
  "nfe.lixeira",
  "nfe.inutilizar",
  "nfe.integridade",
  "nfe.exportar",
  "nfe.conciliar",
  "relatorios.ver",
  "relatorios.producao",
  "usuarios.ver",
  "usuarios.criar",
  "usuarios.editar",
  "usuarios.arquivar",
  "usuarios.restaurar",
  "usuarios.excluir_permanente",
  "usuarios.resetar_senha",
  "configuracoes.ver",
  "configuracoes.editar_empresa",
  "configuracoes.editar_fiscal",
  "configuracoes.editar_whatsapp",
  "configuracoes.editar_impressao",
  "configuracoes.seguranca",
  "backups.ver",
  "backups.executar",
];
```

Default profiles:

- `admin`: all permissions.
- `caixa`: atendimento, dashboard, ordens operational, caixa operational, clientes, produtos, propostas, NF-e operational XML/DANFE/status/export, relatorios summary. No usuarios, configuracoes, backups, financeiro admin, permanent deletes, NF-e lixeira/inutilizacao.
- `oficina`: `oficina.ver`, `oficina.alterar_status`, `ordens.ver`, `ordens.alterar_status`, `ordens.whatsapp`. No financial, fiscal, delete, cancel, customers, products, proposals, users or configuration permissions.

## Task 1: Permission Rules

**Files:**

- Create: `backend/domain/permissionRules.js`
- Create: `backend/__tests__/permissionRules.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/permissionRules.test.js`:

```js
import { describe, expect, it } from "vitest";

const {
  PERMISSIONS,
  DEFAULT_PROFILE_PERMISSIONS,
  isKnownPermission,
  getDefaultPermissionsForProfile,
  hasPermission,
  hasAnyPermission,
  assertKnownPermissions,
} = await import("../domain/permissionRules.js");

describe("permissionRules", () => {
  it("keeps admin as the complete permission set", () => {
    expect(getDefaultPermissionsForProfile("admin")).toEqual(PERMISSIONS);
  });

  it("keeps caixa operational but not administrative", () => {
    const caixa = getDefaultPermissionsForProfile("caixa");

    expect(caixa).toContain("atendimento.ver");
    expect(caixa).toContain("ordens.criar");
    expect(caixa).toContain("caixa.criar_lancamento");
    expect(caixa).toContain("clientes.editar");
    expect(caixa).toContain("produtos.editar");
    expect(caixa).toContain("propostas.gerar_os");
    expect(caixa).toContain("nfe.emitir");
    expect(caixa).toContain("nfe.danfe");
    expect(caixa).not.toContain("usuarios.editar");
    expect(caixa).not.toContain("configuracoes.editar_fiscal");
    expect(caixa).not.toContain("financeiro.relatorios");
    expect(caixa).not.toContain("nfe.inutilizar");
  });

  it("keeps oficina restricted to redacted workshop workflow", () => {
    const oficina = getDefaultPermissionsForProfile("oficina");

    expect(oficina).toEqual([
      "ordens.ver",
      "ordens.alterar_status",
      "ordens.whatsapp",
      "oficina.ver",
      "oficina.alterar_status",
    ]);
    expect(oficina).not.toContain("ordens.cancelar");
    expect(oficina).not.toContain("caixa.ver");
    expect(oficina).not.toContain("nfe.ver");
  });

  it("validates unknown permissions", () => {
    expect(isKnownPermission("usuarios.ver")).toBe(true);
    expect(isKnownPermission("usuarios.voar")).toBe(false);
    expect(() => assertKnownPermissions(["usuarios.ver", "usuarios.voar"])).toThrow(/Permissao desconhecida: usuarios.voar/);
  });

  it("checks one or any permission safely", () => {
    const user = { permissions: ["clientes.ver", "clientes.editar"] };

    expect(hasPermission(user, "clientes.ver")).toBe(true);
    expect(hasPermission(user, "clientes.excluir")).toBe(false);
    expect(hasPermission(null, "clientes.ver")).toBe(false);
    expect(hasPermission({ permissions: ["*"] }, "qualquer.coisa")).toBe(true);
    expect(hasAnyPermission(user, ["produtos.ver", "clientes.editar"])).toBe(true);
    expect(hasAnyPermission(user, ["produtos.ver", "clientes.excluir"])).toBe(false);
    expect(hasAnyPermission(user, [])).toBe(false);
  });

  it("does not duplicate permissions inside default profiles", () => {
    for (const [profileKey, permissions] of Object.entries(DEFAULT_PROFILE_PERMISSIONS)) {
      expect(new Set(permissions).size, profileKey).toBe(permissions.length);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- permissionRules.test.js
```

Expected: FAIL because `../domain/permissionRules.js` does not exist.

- [ ] **Step 3: Implement permission rules**

Create `backend/domain/permissionRules.js`:

```js
const PERMISSIONS = [
  "dashboard.ver",
  "dashboard.integridade",
  "atendimento.ver",
  "ordens.ver",
  "ordens.criar",
  "ordens.editar",
  "ordens.alterar_status",
  "ordens.cancelar",
  "ordens.excluir",
  "ordens.restaurar",
  "ordens.excluir_permanente",
  "ordens.imprimir",
  "ordens.whatsapp",
  "oficina.ver",
  "oficina.alterar_status",
  "caixa.ver",
  "caixa.criar_lancamento",
  "caixa.editar_lancamento",
  "caixa.excluir_lancamento",
  "caixa.fechamento",
  "clientes.ver",
  "clientes.criar",
  "clientes.editar",
  "clientes.excluir",
  "clientes.consultar_documentos",
  "produtos.ver",
  "produtos.criar",
  "produtos.editar",
  "produtos.excluir",
  "propostas.ver",
  "propostas.criar",
  "propostas.editar_status",
  "propostas.gerar_os",
  "propostas.imprimir",
  "financeiro.ver",
  "financeiro.contas_pagar.ver",
  "financeiro.contas_pagar.editar",
  "financeiro.contas_pagar.pagar",
  "financeiro.relatorios",
  "nfe.ver",
  "nfe.emitir",
  "nfe.cancelar",
  "nfe.cce",
  "nfe.xml",
  "nfe.danfe",
  "nfe.lixeira",
  "nfe.inutilizar",
  "nfe.integridade",
  "nfe.exportar",
  "nfe.conciliar",
  "relatorios.ver",
  "relatorios.producao",
  "usuarios.ver",
  "usuarios.criar",
  "usuarios.editar",
  "usuarios.arquivar",
  "usuarios.restaurar",
  "usuarios.excluir_permanente",
  "usuarios.resetar_senha",
  "configuracoes.ver",
  "configuracoes.editar_empresa",
  "configuracoes.editar_fiscal",
  "configuracoes.editar_whatsapp",
  "configuracoes.editar_impressao",
  "configuracoes.seguranca",
  "backups.ver",
  "backups.executar",
];

const DEFAULT_PROFILE_PERMISSIONS = {
  admin: [...PERMISSIONS],
  caixa: [
    "dashboard.ver",
    "atendimento.ver",
    "ordens.ver",
    "ordens.criar",
    "ordens.editar",
    "ordens.alterar_status",
    "ordens.cancelar",
    "ordens.imprimir",
    "ordens.whatsapp",
    "caixa.ver",
    "caixa.criar_lancamento",
    "caixa.editar_lancamento",
    "caixa.fechamento",
    "clientes.ver",
    "clientes.criar",
    "clientes.editar",
    "clientes.consultar_documentos",
    "produtos.ver",
    "produtos.criar",
    "produtos.editar",
    "propostas.ver",
    "propostas.criar",
    "propostas.editar_status",
    "propostas.gerar_os",
    "propostas.imprimir",
    "nfe.ver",
    "nfe.emitir",
    "nfe.cancelar",
    "nfe.cce",
    "nfe.xml",
    "nfe.danfe",
    "nfe.exportar",
    "relatorios.ver",
  ],
  oficina: [
    "ordens.ver",
    "ordens.alterar_status",
    "ordens.whatsapp",
    "oficina.ver",
    "oficina.alterar_status",
  ],
};

const DEFAULT_PROFILES = [
  {
    key: "admin",
    name: "Administrador",
    description: "Acesso total ao sistema.",
    system: 1,
    active: 1,
  },
  {
    key: "caixa",
    name: "Caixa",
    description: "Atendimento, OS, clientes, produtos, propostas, caixa operacional e NF-e operacional.",
    system: 1,
    active: 1,
  },
  {
    key: "oficina",
    name: "Oficina",
    description: "Fila da oficina com dados sensiveis redigidos e atualizacao controlada de status.",
    system: 1,
    active: 1,
  },
];

const PERMISSION_SET = new Set(PERMISSIONS);

function isKnownPermission(permission) {
  return PERMISSION_SET.has(permission);
}

function assertKnownPermissions(permissions) {
  for (const permission of permissions || []) {
    if (!isKnownPermission(permission)) {
      throw new Error(`Permissao desconhecida: ${permission}`);
    }
  }
}

function getDefaultPermissionsForProfile(profileKey) {
  return [...(DEFAULT_PROFILE_PERMISSIONS[profileKey] || [])];
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  return Array.from(new Set(permissions.filter(Boolean)));
}

function hasPermission(user, permission) {
  if (!permission) return false;
  const permissions = normalizePermissions(user?.permissions);
  return permissions.includes("*") || permissions.includes(permission);
}

function hasAnyPermission(user, permissions) {
  return normalizePermissions(permissions).some((permission) => hasPermission(user, permission));
}

module.exports = {
  PERMISSIONS,
  DEFAULT_PROFILES,
  DEFAULT_PROFILE_PERMISSIONS,
  isKnownPermission,
  assertKnownPermissions,
  getDefaultPermissionsForProfile,
  normalizePermissions,
  hasPermission,
  hasAnyPermission,
};
```

- [ ] **Step 4: Run the test to verify GREEN**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- permissionRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/permissionRules.js backend/__tests__/permissionRules.test.js
git commit -m "feat: define rbac permission rules"
```

## Task 2: Database Schema, Migrations, And Seed

**Files:**

- Modify: `backend/database.js`
- Modify: `backend/__tests__/databaseMigrations.test.js`

- [ ] **Step 1: Write failing migration tests**

Append these tests to `backend/__tests__/databaseMigrations.test.js`:

```js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

it("documents RBAC schema objects in the database source", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "database.js"), "utf8");

  expect(source).toMatch(/CREATE TABLE IF NOT EXISTS permission_profiles/);
  expect(source).toMatch(/CREATE TABLE IF NOT EXISTS profile_permissions/);
  expect(source).toMatch(/ALTER TABLE users ADD COLUMN profile_key TEXT/);
  expect(source).toMatch(/ALTER TABLE users ADD COLUMN access_version INTEGER NOT NULL DEFAULT 1/);
  expect(source).toMatch(/UPDATE users SET profile_key=role WHERE profile_key IS NULL/);
});

it("exports a seed helper for default permission profiles", () => {
  expect(typeof database.seedPermissionProfiles).toBe("function");
});
```

Place the new imports at the top of the file. Do not duplicate imports that already exist after editing.

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- databaseMigrations.test.js
```

Expected: FAIL because RBAC schema and `seedPermissionProfiles` do not exist.

- [ ] **Step 3: Add schema imports**

At the top of `backend/database.js`, add:

```js
const {
  DEFAULT_PROFILES,
  DEFAULT_PROFILE_PERMISSIONS,
  assertKnownPermissions,
} = require("./domain/permissionRules");
```

- [ ] **Step 4: Add tables to `SCHEMA`**

Inside the `SCHEMA` string in `backend/database.js`, immediately after the `users` table, add:

```sql
CREATE TABLE IF NOT EXISTS permission_profiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT    UNIQUE NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT,
  system      INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  createdat   TEXT    DEFAULT (datetime('now','localtime')),
  updatedat   TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS profile_permissions (
  profile_id INTEGER NOT NULL,
  permission TEXT    NOT NULL,
  createdat  TEXT    DEFAULT (datetime('now','localtime')),
  UNIQUE(profile_id, permission),
  FOREIGN KEY(profile_id) REFERENCES permission_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_profile_permissions_permission ON profile_permissions(permission);
```

In the `users` table definition, add these columns before `createdat`:

```sql
  profile_key    TEXT,
  deletedat      TEXT    DEFAULT NULL,
  deletedpor     INTEGER DEFAULT NULL,
  deletedreason  TEXT,
  updatedat      TEXT    DEFAULT (datetime('now','localtime')),
  access_version INTEGER NOT NULL DEFAULT 1,
```

- [ ] **Step 5: Add migrations**

In the `migrations` array in `backend/database.js`, append:

```js
    // v19 - fundacao RBAC de perfis e permissoes
    "ALTER TABLE users ADD COLUMN profile_key TEXT",
    "ALTER TABLE users ADD COLUMN deletedat TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN deletedpor INTEGER DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN deletedreason TEXT",
    "ALTER TABLE users ADD COLUMN updatedat TEXT DEFAULT (datetime('now','localtime'))",
    "ALTER TABLE users ADD COLUMN access_version INTEGER NOT NULL DEFAULT 1",
    "UPDATE users SET profile_key=role WHERE profile_key IS NULL",
    `CREATE TABLE IF NOT EXISTS permission_profiles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT    UNIQUE NOT NULL,
      name        TEXT    NOT NULL,
      description TEXT,
      system      INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1,
      createdat   TEXT    DEFAULT (datetime('now','localtime')),
      updatedat   TEXT    DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS profile_permissions (
      profile_id INTEGER NOT NULL,
      permission TEXT    NOT NULL,
      createdat  TEXT    DEFAULT (datetime('now','localtime')),
      UNIQUE(profile_id, permission),
      FOREIGN KEY(profile_id) REFERENCES permission_profiles(id) ON DELETE CASCADE
    )`,
    "CREATE INDEX IF NOT EXISTS idx_profile_permissions_permission ON profile_permissions(permission)",
```

- [ ] **Step 6: Add seed helper**

In `backend/database.js`, before `initDB()`, add:

```js
function seedPermissionProfiles(targetDb) {
  const insertProfile = targetDb.prepare(`
    INSERT INTO permission_profiles (key, name, description, system, active, updatedat)
    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET
      name=excluded.name,
      description=excluded.description,
      system=excluded.system,
      active=excluded.active,
      updatedat=datetime('now','localtime')
  `);
  const getProfile = targetDb.prepare("SELECT id FROM permission_profiles WHERE key=?");
  const deletePermissions = targetDb.prepare(`
    DELETE FROM profile_permissions
    WHERE profile_id = ?
  `);
  const insertPermission = targetDb.prepare(`
    INSERT OR IGNORE INTO profile_permissions (profile_id, permission)
    VALUES (?, ?)
  `);

  const tx = targetDb.transaction(() => {
    for (const profile of DEFAULT_PROFILES) {
      const permissions = DEFAULT_PROFILE_PERMISSIONS[profile.key] || [];
      assertKnownPermissions(permissions);
      insertProfile.run(profile.key, profile.name, profile.description, profile.system, profile.active);
      const row = getProfile.get(profile.key);
      deletePermissions.run(row.id);
      for (const permission of permissions) {
        insertPermission.run(row.id, permission);
      }
    }
  });

  tx();
}
```

- [ ] **Step 7: Call seed and backfill after migrations**

In `initDB()`, immediately after `applyMigrations(db, migrations);`, add:

```js
  db.prepare("UPDATE users SET profile_key=role WHERE profile_key IS NULL").run();
  seedPermissionProfiles(db);
```

In the dev seed insert, change:

```js
const stmt = db.prepare("INSERT INTO users (name,username,password,role) VALUES (?,?,?,?)");
```

to:

```js
const stmt = db.prepare("INSERT INTO users (name,username,password,role,profile_key) VALUES (?,?,?,?,?)");
```

And change:

```js
for (const [name,username,pw,role] of seed) stmt.run(name, username, bcrypt.hashSync(pw,10), role);
```

to:

```js
for (const [name,username,pw,role] of seed) stmt.run(name, username, bcrypt.hashSync(pw,10), role, role);
```

- [ ] **Step 8: Export seed helper**

In `module.exports`, add:

```js
  seedPermissionProfiles,
```

- [ ] **Step 9: Run tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- databaseMigrations.test.js permissionRules.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add backend/database.js backend/__tests__/databaseMigrations.test.js
git commit -m "feat: seed rbac profiles"
```

## Task 3: Session Rules

**Files:**

- Modify: `backend/domain/userRules.js`
- Modify: `backend/__tests__/userRules.test.js`

- [ ] **Step 1: Write failing session tests**

Append to `backend/__tests__/userRules.test.js`:

```js
  it("rejects sessions for archived users, inactive profiles, and stale access versions", () => {
    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 2 },
      { id: 1, role: "admin", active: 1, deletedat: null, profile_active: 1, access_version: 2 }
    )).toEqual({ ok: true });

    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 2 },
      { id: 1, role: "admin", active: 1, deletedat: "2026-07-09 10:00:00", profile_active: 1, access_version: 2 }
    )).toEqual({
      ok: false,
      status: 401,
      error: "Usuario arquivado",
    });

    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 2 },
      { id: 1, role: "admin", active: 1, deletedat: null, profile_active: 0, access_version: 2 }
    )).toEqual({
      ok: false,
      status: 401,
      error: "Perfil inativo",
    });

    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 1 },
      { id: 1, role: "admin", active: 1, deletedat: null, profile_active: 1, access_version: 2 }
    )).toEqual({
      ok: false,
      status: 401,
      error: "Sessao desatualizada. Entre novamente.",
    });
  });
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- userRules.test.js
```

Expected: FAIL because archived/profile/access version checks are missing.

- [ ] **Step 3: Update `validarSessaoUsuario`**

Replace `validarSessaoUsuario` in `backend/domain/userRules.js` with:

```js
function validarSessaoUsuario(payload, usuarioAtual) {
  if (!usuarioAtual) {
    return { ok: false, status: 401, error: "Usuario nao encontrado" };
  }

  if (Number(usuarioAtual.active) !== 1) {
    return { ok: false, status: 401, error: "Usuario inativo" };
  }

  if (usuarioAtual.deletedat) {
    return { ok: false, status: 401, error: "Usuario arquivado" };
  }

  if (usuarioAtual.profile_active != null && Number(usuarioAtual.profile_active) !== 1) {
    return { ok: false, status: 401, error: "Perfil inativo" };
  }

  if (payload?.accessVersion != null && usuarioAtual.access_version != null
    && Number(payload.accessVersion) !== Number(usuarioAtual.access_version)) {
    return { ok: false, status: 401, error: "Sessao desatualizada. Entre novamente." };
  }

  if (payload?.role && usuarioAtual.role !== payload.role) {
    return { ok: false, status: 401, error: "Sessao desatualizada. Entre novamente." };
  }

  return { ok: true };
}
```

This keeps temporary compatibility with old tokens that still include `role`.

- [ ] **Step 4: Run tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- userRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/userRules.js backend/__tests__/userRules.test.js
git commit -m "feat: validate rbac session state"
```

## Task 4: Auth Middleware Enrichment

**Files:**

- Modify: `backend/middlewares/auth.js`
- Modify: `backend/__tests__/auth.test.js`

- [ ] **Step 1: Write failing middleware tests**

In `backend/__tests__/auth.test.js`, add or update tests so these behaviors are asserted:

```js
it("sets req.user from current database state with effective permissions", () => {
  const token = makeToken({ id: 5, role: "caixa" });
  const req = makeReq({ cookies: { token } });
  const next = vi.fn();

  setSessionUserLookupForTests(() => ({
    id: 5,
    name: "Operador",
    username: "caixa",
    role: "admin",
    profile_key: "admin",
    active: 1,
    deletedat: null,
    access_version: 3,
    profile_active: 1,
    permissions: ["usuarios.ver", "usuarios.editar"],
  }));

  auth(["admin"])(req, makeRes(), next);

  expect(next).toHaveBeenCalled();
  expect(req.user).toMatchObject({
    id: 5,
    name: "Operador",
    username: "caixa",
    role: "admin",
    profile_key: "admin",
    permissions: ["usuarios.ver", "usuarios.editar"],
  });
});

it("rejects role authorization using the current database role, not the token role", () => {
  const token = makeToken({ id: 6, role: "admin" });
  const req = makeReq({ cookies: { token } });
  const res = makeRes();
  const next = vi.fn();

  setSessionUserLookupForTests(() => ({
    id: 6,
    name: "Caixa",
    username: "caixa",
    role: "caixa",
    profile_key: "caixa",
    active: 1,
    deletedat: null,
    access_version: 1,
    profile_active: 1,
    permissions: [],
  }));

  auth(["admin"])(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});
```

Use the existing `makeRes` and `makeToken` helpers in `backend/__tests__/auth.test.js`. Add this helper near them:

```js
function makeReq({ cookies = {}, headers = {} } = {}) {
  return { cookies, headers };
}
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- auth.test.js
```

Expected: FAIL because `req.user` is currently payload-based and authorization checks `payload.role`.

- [ ] **Step 3: Update lookup query**

In `backend/middlewares/auth.js`, replace `lookupUsuarioAtual` with:

```js
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
```

- [ ] **Step 4: Add user normalization helper**

In `backend/middlewares/auth.js`, add:

```js
function normalizarUsuarioSessao(row) {
  if (!row) return null;
  const permissions = Array.isArray(row.permissions)
    ? row.permissions
    : String(row.permissions_csv || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    profile_key: row.profile_key || row.role,
    profile: {
      key: row.profile_key || row.role,
      name: row.profile_name || row.role,
      active: row.profile_active == null ? 1 : Number(row.profile_active),
    },
    active: row.active,
    deletedat: row.deletedat,
    access_version: row.access_version,
    profile_active: row.profile_active == null ? 1 : row.profile_active,
    permissions,
  };
}
```

- [ ] **Step 5: Use normalized current user**

Inside `auth()`, after `jwt.verify`, replace the current user/session/role block with:

```js
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
```

Export `normalizarUsuarioSessao` for tests:

```js
module.exports = { auth, JWT_SECRET, setSessionUserLookupForTests, normalizarUsuarioSessao };
```

- [ ] **Step 6: Run tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- auth.test.js userRules.test.js permissionRules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/middlewares/auth.js backend/__tests__/auth.test.js
git commit -m "feat: resolve session permissions in auth"
```

## Task 5: Login And `/auth/me` Public Shape

**Files:**

- Modify: `backend/routes/auth.js`
- Create: `backend/__tests__/authRoutes.test.js`

- [ ] **Step 1: Write failing route expectation**

Create `backend/__tests__/authRoutes.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-rbac-routes";
process.env.JWT_SECRET = TEST_SECRET;

const dbMock = {
  getOne: vi.fn(),
};

vi.mock("../database", () => dbMock);
vi.mock("../database.js", () => dbMock);

const authRoutesModule = await import("../routes/auth.js");
const router = authRoutesModule.default || authRoutesModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

function getRouteHandler(method, routePath) {
  const layer = router.stack.find((entry) => entry.route?.path === routePath && entry.route.methods?.[method]);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe("auth routes", () => {
  beforeEach(() => {
    dbMock.getOne.mockReset();
  });

  it("returns public user permissions and signs a minimal token on login", () => {
    const passwordHash = bcrypt.hashSync("senha-segura", 10);
    dbMock.getOne.mockReturnValue({
      id: 1,
      name: "Administrador",
      username: "admin",
      password: passwordHash,
      role: "admin",
      profile_key: "admin",
      active: 1,
      deletedat: null,
      access_version: 4,
      profile_name: "Administrador",
      profile_active: 1,
      permissions_csv: "usuarios.ver,usuarios.editar",
    });
    const req = { body: { username: "admin", password: "senha-segura" } };
    const res = makeRes();

    getRouteHandler("post", "/login")(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith("token", expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.json).toHaveBeenCalledWith({
      user: expect.objectContaining({
        id: 1,
        name: "Administrador",
        username: "admin",
        role: "admin",
        profile_key: "admin",
        permissions: ["usuarios.ver", "usuarios.editar"],
      }),
    });
    expect(res.json.mock.calls[0][0].user).not.toHaveProperty("password");

    const token = res.cookie.mock.calls[0][1];
    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded).toMatchObject({ id: 1, accessVersion: 4 });
    expect(decoded).not.toHaveProperty("permissions");
    expect(decoded).not.toHaveProperty("role");
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- authRoutes.test.js
```

Expected: FAIL because login currently signs `{ id, name, username, role }`.

- [ ] **Step 3: Update login lookup**

In `backend/routes/auth.js`, change the login query from:

```js
"SELECT * FROM users WHERE username=? AND active=1"
```

to:

```js
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
 GROUP BY u.id`
```

- [ ] **Step 4: Import and use session normalizer**

In `backend/routes/auth.js`, replace:

```js
const { auth, JWT_SECRET } = require("../middlewares/auth");
```

with:

```js
const { auth, JWT_SECRET, normalizarUsuarioSessao } = require("../middlewares/auth");
```

After password validation, add:

```js
  const sessionUser = normalizarUsuarioSessao(user);
  if (!sessionUser || Number(sessionUser.profile_active) !== 1) {
    registrarFalhaLogin(loginLockoutState, username);
    return res.status(401).json({ error: "Usuario ou senha invalidos" });
  }
```

Replace token payload:

```js
  const payload = {
    id: sessionUser.id,
    accessVersion: Number(sessionUser.access_version || 1),
  };
```

Replace JSON response:

```js
  res.json({ user: sessionUser });
```

- [ ] **Step 5: Keep `/auth/me` behavior**

Do not change:

```js
router.get("/me", auth(), (req, res) => res.json(req.user));
```

This now returns the normalized public user. Verify it contains no password.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- authRoutes.test.js auth.test.js userRules.test.js permissionRules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/routes/auth.js backend/__tests__/authRoutes.test.js
git commit -m "feat: return effective permissions on auth"
```

## Task 6: Compatibility Verification

**Files:**

- Read-only unless tests reveal a regression.

- [ ] **Step 1: Run route contract tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- routeContracts.test.js
```

Expected: PASS. This confirms routes still expose role contracts in this phase.

- [ ] **Step 2: Run core RBAC/auth tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test -- permissionRules.test.js userRules.test.js auth.test.js databaseMigrations.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full backend suite**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

No frontend code should change in this phase, but build once because `/auth/me` response shape becomes richer.

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\frontend"
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 5: Commit verification-only fixes when verification changes files**

When verification required small compatibility fixes, commit them:

```powershell
git add backend frontend
git commit -m "fix: preserve auth compatibility"
```

When no fixes were needed, do not create an empty commit.

## Task 7: Phase 1 Documentation Note

**Files:**

- Modify: `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`

- [ ] **Step 1: Add status note to spec**

Append this section to `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`:

```md
## Status de Implementacao

- Fase 1 implementa a fundacao RBAC, perfis de sistema, permissoes efetivas em `/auth/me` e token minimo com `accessVersion`.
- Rotas de negocio continuam usando roles durante esta fase.
- A migracao de `/usuarios`, arquivamento e exclusao segura fica para a Fase 2.
```

- [ ] **Step 2: Commit docs**

```powershell
git add docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md
git commit -m "docs: note rbac phase one status"
```

## Final Verification

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\backend"
npm.cmd test
cd ..\frontend
npm.cmd run build
```

Expected:

- Backend suite passes.
- Frontend build passes.
- No route behavior changes outside `/auth/login` and `/auth/me` public user shape.

## Handoff To Phase 2

After Fase 1 is green, create the next plan for:

- `/api/users` with `authPermission("usuarios.*")`;
- user archive/restore/permanent delete checks;
- `usersRoutes.test.js`;
- `/usuarios` table UI with filters and safe delete actions;
- `AuthContext` frontend `can/canAny` helpers.
