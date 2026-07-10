# RBAC Fase 2 Usuarios E Exclusao Segura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar `/api/users` e `/usuarios` em uma gestao operacional segura, com arquivamento/restauracao, reset de senha, filtros, permissoes efetivas e exclusao permanente somente quando nao houver vinculos historicos.

**Architecture:** A Fase 2 preserva `users.id` como identidade auditavel. "Excluir usuario" arquiva por padrao (`active=0`, `deletedat`, `deletedpor`, `deletedreason`, `access_version+1`); exclusao fisica fica separada e bloqueada quando qualquer tabela historica referencia o usuario. A rota de usuarios passa a usar permissao granular sobre a fundacao RBAC, mas o restante do sistema continua com `auth([...roles])`.

**Tech Stack:** Node.js 22, Express 4, CommonJS, better-sqlite3, Vitest 4.1, React 18, Vite 8, React Testing Library, CSS global operacional.

---

## Scope

Implementar somente a Fase 2 do spec `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`.

Included:

- `/api/users` com listagem filtravel, criacao, edicao, arquivamento, restauracao, reset de senha, checagem de exclusao e exclusao permanente segura.
- Protecoes de autopreservacao e ultimo admin ativo.
- Incremento de `access_version` em mudancas de acesso.
- Middleware de permissao reaproveitavel, usado somente na rota de usuarios nesta fase.
- `AuthContext` com `can()` e `canAny()`.
- `/usuarios` redesenhada como tela operacional com tabela desktop, cards mobile, filtros e modais de confirmacao.

Out of scope:

- Editor visual de perfis/permissoes.
- Criacao de perfis customizados.
- Migrar OS, caixa, NF-e, financeiro, configuracoes ou sidebar inteira para permissao.
- Reusar `username` de usuario arquivado.
- Anonimizacao de usuarios historicos.
- Alterar regras de OS, financeiro, NF-e ou WhatsApp.

## File Structure

Create:

- `backend/domain/userDeletionRules.js`: catalogo de referencias historicas, normalizacao de motivo e decisao pura sobre exclusao permanente.
- `backend/__tests__/userDeletionRules.test.js`: testes unitarios de catalogo, motivo e decisao.
- `backend/__tests__/usersRoutes.test.js`: testes de contrato da rota de usuarios.
- `frontend/src/pages/Usuarios.test.jsx`: testes da nova experiencia de gestao.

Modify:

- `backend/middlewares/auth.js`: adicionar `authPermission()` e `authAnyPermission()` usando `req.user.permissions`.
- `backend/__tests__/auth.test.js`: cobrir os novos middlewares sem alterar compatibilidade de `auth([...roles])`.
- `backend/domain/userRules.js`: adicionar regras puras de autoprotecao e ultimo admin usadas pela rota.
- `backend/__tests__/userRules.test.js`: cobrir novas regras de gestao.
- `backend/routes/users.js`: substituir CRUD limitado por rotas seguras.
- `frontend/src/context/AuthContext.jsx`: expor `permissions`, `profile`, `can()` e `canAny()`.
- `frontend/src/App.jsx`: permitir `PrivateRoute permissions={...}` e migrar somente `/usuarios`.
- `frontend/src/components/Sidebar.jsx`: mostrar link de Usuarios quando `can("usuarios.ver")`, preservando fallback de admin.
- `frontend/src/pages/Usuarios.jsx`: redesenhar listagem, filtros, modais e acoes seguras.

Do not modify:

- `backend/routes/ordens.js`
- `backend/routes/caixa.js`
- `backend/routes/nfe.js`
- `backend/routes/financeiro.js`
- `backend/domain/financeiroRules.js`
- qualquer status de OS

## Endpoint Contract

Implementar este contrato:

```txt
GET    /api/users
POST   /api/users
PUT    /api/users/:id
GET    /api/users/:id/delete-check
POST   /api/users/:id/archive
POST   /api/users/:id/restore
POST   /api/users/:id/reset-password
DELETE /api/users/:id
```

Query de listagem:

```txt
status=active|inactive|archived|all
role=admin|caixa|oficina
q=texto
```

Forma publica de usuario:

```js
{
  id: 1,
  name: "Administrador",
  username: "admin",
  role: "admin",
  profile_key: "admin",
  profile_name: "Administrador",
  active: 1,
  deletedat: null,
  deletedpor: null,
  deletedreason: null,
  createdat: "2026-07-10 09:00:00",
  updatedat: "2026-07-10 09:00:00",
  access_version: 3,
  permissions: ["usuarios.ver", "usuarios.editar"]
}
```

## Historical Reference Catalog

`backend/domain/userDeletionRules.js` deve listar pelo menos:

```js
const USER_HISTORY_REFERENCES = [
  { table: "ordens", column: "criadopor", label: "OS criadas" },
  { table: "ordens", column: "deletedpor", label: "OS excluidas" },
  { table: "ordens", column: "nfe_deletedpor", label: "NF-e movidas para lixeira" },
  { table: "lancamentos", column: "criadopor", label: "lancamentos criados" },
  { table: "lancamentos", column: "deletedpor", label: "lancamentos excluidos" },
  { table: "statuslog", column: "usuarioid", label: "mudancas de status" },
  { table: "users", column: "deletedpor", label: "usuarios arquivados" },
  { table: "propostas", column: "criadopor", label: "propostas criadas" },
  { table: "contas_pagar", column: "criadopor", label: "contas a pagar criadas" },
  { table: "contas_pagar", column: "deletedpor", label: "contas a pagar excluidas" },
  { table: "clientes", column: "deletedpor", label: "clientes excluidos" },
  { table: "produtos", column: "deletedpor", label: "produtos excluidos" },
  { table: "whatsapp_avisos", column: "aberto_por", label: "avisos abertos" },
  { table: "whatsapp_avisos", column: "enviado_por", label: "avisos enviados" },
  { table: "whatsapp_avisos", column: "ignorado_por", label: "avisos ignorados" },
  { table: "nfe_notas", column: "criadopor", label: "notas fiscais criadas" },
  { table: "nfe_notas", column: "deletedpor", label: "notas fiscais arquivadas" },
  { table: "nfe_emissao_tentativas", column: "solicitado_por", label: "tentativas de NF-e" },
  { table: "nfe_evento_tentativas", column: "solicitado_por", label: "eventos fiscais" },
  { table: "nfe_inutilizacoes", column: "solicitado_por", label: "inutilizacoes" },
  { table: "nfe_integridade_conciliacoes", column: "createdby", label: "conciliacoes fiscais" },
];
```

If a table is absent in older test schemas, the route-level reference checker must ignore only `no such table` and `no such column` for that specific count query. Other SQLite errors must surface to the error handler.

## Task 1: Permission Middleware For Users

**Files:**

- Modify: `backend/middlewares/auth.js`
- Modify: `backend/__tests__/auth.test.js`

- [ ] **Step 1: Write failing middleware tests**

Append tests to `backend/__tests__/auth.test.js` near the existing auth middleware tests:

```js
it("permite acao quando usuario possui a permissao exigida", () => {
  const req = { user: { permissions: ["usuarios.ver", "usuarios.editar"] } };
  const res = makeRes();
  const next = vi.fn();

  authPermission("usuarios.editar")(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
  expect(res.status).not.toHaveBeenCalled();
});

it("bloqueia acao quando usuario nao possui a permissao exigida", () => {
  const req = { user: { permissions: ["usuarios.ver"] } };
  const res = makeRes();
  const next = vi.fn();

  authPermission("usuarios.editar")(req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ error: "Sem permissao" });
  expect(next).not.toHaveBeenCalled();
});

it("permite acao quando usuario possui qualquer permissao exigida", () => {
  const req = { user: { permissions: ["usuarios.restaurar"] } };
  const res = makeRes();
  const next = vi.fn();

  authAnyPermission(["usuarios.editar", "usuarios.restaurar"])(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
});
```

Update the import/destructure at the top of the test file so it includes:

```js
authPermission,
authAnyPermission,
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- auth.test.js
```

Expected: FAIL because `authPermission` and `authAnyPermission` are not exported.

- [ ] **Step 3: Implement middleware helpers**

In `backend/middlewares/auth.js`, import permission helpers:

```js
const { hasPermission, hasAnyPermission } = require("../domain/permissionRules");
```

Add below `auth()`:

```js
function authPermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ error: "Sem permissao" });
    }
    next();
  };
}

function authAnyPermission(permissions) {
  return (req, res, next) => {
    if (!hasAnyPermission(req.user, permissions)) {
      return res.status(403).json({ error: "Sem permissao" });
    }
    next();
  };
}
```

Update exports:

```js
module.exports = {
  auth,
  authPermission,
  authAnyPermission,
  JWT_SECRET,
  setSessionUserLookupForTests,
  resetSessionUserLookupForTests,
  normalizarUsuarioSessao,
};
```

Preserve any existing exported names exactly.

- [ ] **Step 4: Run middleware tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- auth.test.js permissionRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/middlewares/auth.js backend/__tests__/auth.test.js
git commit -m "feat: add permission auth middleware"
```

## Task 2: User Deletion Domain Rules

**Files:**

- Create: `backend/domain/userDeletionRules.js`
- Create: `backend/__tests__/userDeletionRules.test.js`

- [ ] **Step 1: Write failing domain tests**

Create `backend/__tests__/userDeletionRules.test.js`:

```js
import { describe, expect, it } from "vitest";

const {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  summarizeReferenceCounts,
  canPermanentlyDeleteUser,
} = await import("../domain/userDeletionRules.js");

describe("userDeletionRules", () => {
  it("lists historical references that block physical deletion", () => {
    expect(USER_HISTORY_REFERENCES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "ordens", column: "criadopor" }),
        expect.objectContaining({ table: "lancamentos", column: "criadopor" }),
        expect.objectContaining({ table: "statuslog", column: "usuarioid" }),
        expect.objectContaining({ table: "nfe_inutilizacoes", column: "solicitado_por" }),
      ])
    );
  });

  it("normalizes archive reason safely", () => {
    expect(normalizeArchiveReason("  Saiu da loja  ")).toBe("Saiu da loja");
    expect(normalizeArchiveReason("")).toBe("Arquivado pela gestao de usuarios");
    expect(normalizeArchiveReason("x".repeat(260))).toHaveLength(240);
  });

  it("summarizes only positive reference counts", () => {
    const summary = summarizeReferenceCounts([
      { table: "ordens", column: "criadopor", label: "OS criadas", total: 2 },
      { table: "lancamentos", column: "criadopor", label: "lancamentos criados", total: 0 },
    ]);

    expect(summary).toEqual([
      { table: "ordens", column: "criadopor", label: "OS criadas", total: 2 },
    ]);
  });

  it("allows permanent deletion only when there are no historical links", () => {
    expect(canPermanentlyDeleteUser([])).toEqual({ allowed: true, blockers: [] });
    expect(canPermanentlyDeleteUser([
      { table: "statuslog", column: "usuarioid", label: "mudancas de status", total: 1 },
    ])).toEqual({
      allowed: false,
      blockers: [
        { table: "statuslog", column: "usuarioid", label: "mudancas de status", total: 1 },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- userDeletionRules.test.js
```

Expected: FAIL because `userDeletionRules.js` does not exist.

- [ ] **Step 3: Implement domain module**

Create `backend/domain/userDeletionRules.js`:

```js
const USER_HISTORY_REFERENCES = [
  { table: "ordens", column: "criadopor", label: "OS criadas" },
  { table: "ordens", column: "deletedpor", label: "OS excluidas" },
  { table: "ordens", column: "nfe_deletedpor", label: "NF-e movidas para lixeira" },
  { table: "lancamentos", column: "criadopor", label: "lancamentos criados" },
  { table: "lancamentos", column: "deletedpor", label: "lancamentos excluidos" },
  { table: "statuslog", column: "usuarioid", label: "mudancas de status" },
  { table: "users", column: "deletedpor", label: "usuarios arquivados" },
  { table: "propostas", column: "criadopor", label: "propostas criadas" },
  { table: "contas_pagar", column: "criadopor", label: "contas a pagar criadas" },
  { table: "contas_pagar", column: "deletedpor", label: "contas a pagar excluidas" },
  { table: "clientes", column: "deletedpor", label: "clientes excluidos" },
  { table: "produtos", column: "deletedpor", label: "produtos excluidos" },
  { table: "whatsapp_avisos", column: "aberto_por", label: "avisos abertos" },
  { table: "whatsapp_avisos", column: "enviado_por", label: "avisos enviados" },
  { table: "whatsapp_avisos", column: "ignorado_por", label: "avisos ignorados" },
  { table: "nfe_notas", column: "criadopor", label: "notas fiscais criadas" },
  { table: "nfe_notas", column: "deletedpor", label: "notas fiscais arquivadas" },
  { table: "nfe_emissao_tentativas", column: "solicitado_por", label: "tentativas de NF-e" },
  { table: "nfe_evento_tentativas", column: "solicitado_por", label: "eventos fiscais" },
  { table: "nfe_inutilizacoes", column: "solicitado_por", label: "inutilizacoes" },
  { table: "nfe_integridade_conciliacoes", column: "createdby", label: "conciliacoes fiscais" },
];

function normalizeArchiveReason(reason) {
  const value = String(reason || "").trim();
  return (value || "Arquivado pela gestao de usuarios").slice(0, 240);
}

function summarizeReferenceCounts(counts) {
  return (counts || [])
    .map((item) => ({
      table: item.table,
      column: item.column,
      label: item.label,
      total: Number(item.total || 0),
    }))
    .filter((item) => item.total > 0);
}

function canPermanentlyDeleteUser(counts) {
  const blockers = summarizeReferenceCounts(counts);
  return { allowed: blockers.length === 0, blockers };
}

module.exports = {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  summarizeReferenceCounts,
  canPermanentlyDeleteUser,
};
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- userDeletionRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/userDeletionRules.js backend/__tests__/userDeletionRules.test.js
git commit -m "feat: define safe user deletion rules"
```

## Task 3: User Management Rules

**Files:**

- Modify: `backend/domain/userRules.js`
- Modify: `backend/__tests__/userRules.test.js`

- [ ] **Step 1: Write failing rule tests**

Append to `backend/__tests__/userRules.test.js`:

```js
describe("regras de gestao de usuarios", () => {
  it("bloqueia arquivamento, restauracao, reset e exclusao permanente do proprio usuario", () => {
    expect(validarAcaoProprioUsuario({
      requesterId: 1,
      targetId: 1,
      action: "archive",
    })).toEqual({ ok: false, error: "Voce nao pode arquivar seu proprio usuario" });

    expect(validarAcaoProprioUsuario({
      requesterId: 1,
      targetId: 2,
      action: "archive",
    })).toEqual({ ok: true });
  });

  it("bloqueia remover o ultimo admin ativo nao arquivado", () => {
    expect(validarUltimoAdminDisponivel({
      targetRole: "admin",
      targetActive: 1,
      targetDeletedat: null,
      activeAdminCount: 1,
      action: "archive",
    })).toEqual({
      ok: false,
      error: "Nao e possivel remover o ultimo administrador ativo",
    });

    expect(validarUltimoAdminDisponivel({
      targetRole: "caixa",
      targetActive: 1,
      targetDeletedat: null,
      activeAdminCount: 1,
      action: "archive",
    })).toEqual({ ok: true });
  });
});
```

Update the import/destructure in the same test file:

```js
validarAcaoProprioUsuario,
validarUltimoAdminDisponivel,
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- userRules.test.js
```

Expected: FAIL because new functions do not exist.

- [ ] **Step 3: Implement user management rules**

Add to `backend/domain/userRules.js`:

```js
const SELF_ACTION_ERRORS = {
  archive: "Voce nao pode arquivar seu proprio usuario",
  restore: "Voce nao pode restaurar seu proprio usuario",
  reset_password: "Voce nao pode resetar sua propria senha por esta tela",
  delete_permanent: "Voce nao pode excluir permanentemente seu proprio usuario",
};

function validarAcaoProprioUsuario({ requesterId, targetId, action }) {
  if (Number(requesterId) !== Number(targetId)) return { ok: true };
  return { ok: false, error: SELF_ACTION_ERRORS[action] || "Acao nao permitida para o proprio usuario" };
}

function isAdminDisponivel(user) {
  return user?.role === "admin" && Number(user.active) === 1 && !user.deletedat;
}

function validarUltimoAdminDisponivel({
  targetRole,
  targetActive,
  targetDeletedat,
  activeAdminCount,
  action,
}) {
  const targetIsAvailableAdmin = targetRole === "admin" && Number(targetActive) === 1 && !targetDeletedat;
  const actionRemovesAvailability = ["archive", "deactivate", "delete_permanent", "change_role"].includes(action);

  if (targetIsAvailableAdmin && actionRemovesAvailability && Number(activeAdminCount) <= 1) {
    return { ok: false, error: "Nao e possivel remover o ultimo administrador ativo" };
  }

  return { ok: true };
}
```

Export them:

```js
  validarAcaoProprioUsuario,
  validarUltimoAdminDisponivel,
  isAdminDisponivel,
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- userRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/userRules.js backend/__tests__/userRules.test.js
git commit -m "feat: protect user management invariants"
```

## Task 4: Users API Route

**Files:**

- Modify: `backend/routes/users.js`
- Create: `backend/__tests__/usersRoutes.test.js`

- [ ] **Step 1: Write failing route tests**

Create `backend/__tests__/usersRoutes.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const dbMock = {
  getAll: vi.fn(),
  getOne: vi.fn(),
  run: vi.fn(),
  runInsert: vi.fn(),
};

vi.mock("../database", () => dbMock);
vi.mock("../database.js", () => dbMock);

vi.mock("../middlewares/auth", () => ({
  auth: () => (req, _res, next) => {
    req.user = {
      id: 99,
      role: "admin",
      permissions: [
        "usuarios.ver",
        "usuarios.criar",
        "usuarios.editar",
        "usuarios.arquivar",
        "usuarios.restaurar",
        "usuarios.excluir_permanente",
        "usuarios.resetar_senha",
      ],
    };
    next();
  },
  authPermission: () => (_req, _res, next) => next(),
}));

const usersRoutesModule = await import("../routes/users.js");
const router = usersRoutesModule.default || usersRoutesModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function handlers(method, routePath) {
  const layer = router.stack.find((entry) => entry.route?.path === routePath && entry.route.methods?.[method]);
  return layer.route.stack.map((entry) => entry.handle);
}

async function runRoute(method, routePath, req) {
  const res = makeRes();
  const next = vi.fn((error) => {
    if (error) throw error;
  });
  for (const handler of handlers(method, routePath)) {
    await handler(req, res, next);
    if (res.status.mock.calls.length || res.json.mock.calls.length) {
      const lastJson = res.json.mock.calls.at(-1);
      if (lastJson) break;
    }
  }
  return { res, next };
}

describe("users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.getAll.mockReturnValue([]);
    dbMock.getOne.mockReturnValue(null);
    dbMock.run.mockReturnValue({ changes: 1 });
    dbMock.runInsert.mockReturnValue(10);
  });

  it("lista usuarios com filtros e sem senha", async () => {
    dbMock.getAll.mockReturnValue([
      {
        id: 1,
        name: "Admin",
        username: "admin",
        role: "admin",
        profile_key: "admin",
        profile_name: "Administrador",
        active: 1,
        deletedat: null,
        permissions_csv: "usuarios.ver,usuarios.editar",
      },
    ]);

    const { res } = await runRoute("get", "/", {
      query: { status: "active", q: "adm", role: "admin" },
    });

    expect(dbMock.getAll).toHaveBeenCalledWith(expect.stringContaining("FROM users u"), expect.any(Array));
    expect(res.json).toHaveBeenCalledWith({
      users: [
        expect.objectContaining({
          id: 1,
          username: "admin",
          permissions: ["usuarios.ver", "usuarios.editar"],
        }),
      ],
      meta: expect.objectContaining({ total: 1 }),
    });
    expect(res.json.mock.calls[0][0].users[0]).not.toHaveProperty("password");
  });

  it("cria usuario com profile_key igual ao role e senha criptografada", async () => {
    const { res } = await runRoute("post", "/", {
      body: { name: "Novo", username: "novo", password: "senha123", role: "caixa" },
    });

    expect(dbMock.runInsert).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      expect.arrayContaining(["Novo", "novo", expect.any(String), "caixa", "caixa"])
    );
    expect(bcrypt.compareSync("senha123", dbMock.runInsert.mock.calls[0][1][2])).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 10, role: "caixa" }));
  });

  it("arquiva usuario preservando historico e invalidando sessoes", async () => {
    dbMock.getOne
      .mockReturnValueOnce({ id: 2, role: "caixa", active: 1, deletedat: null })
      .mockReturnValueOnce({ total: 2 });

    const { res } = await runRoute("post", "/:id/archive", {
      params: { id: "2" },
      body: { reason: "Saiu da loja" },
      user: { id: 99 },
    });

    expect(dbMock.run).toHaveBeenCalledWith(
      expect.stringContaining("deletedat=datetime('now','localtime')"),
      expect.arrayContaining([99, "Saiu da loja", "2"])
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("bloqueia exclusao permanente quando ha vinculos historicos", async () => {
    dbMock.getOne
      .mockReturnValueOnce({ id: 2, role: "caixa", active: 0, deletedat: "2026-07-10 09:00:00" })
      .mockReturnValueOnce({ total: 2 });

    const { res } = await runRoute("delete", "/:id", {
      params: { id: "2" },
      user: { id: 99 },
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "Usuario possui historico e nao pode ser excluido permanentemente",
      blockers: expect.any(Array),
    }));
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- usersRoutes.test.js
```

Expected: FAIL because current route returns an array directly and lacks archive/delete endpoints.

- [ ] **Step 3: Replace route with safe implementation**

In `backend/routes/users.js`, preserve the imports style but use these additional imports:

```js
const { auth, authPermission } = require("../middlewares/auth");
const {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
  validarAcaoProprioUsuario,
  validarUltimoAdminDisponivel,
} = require("../domain/userRules");
const {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  summarizeReferenceCounts,
  canPermanentlyDeleteUser,
} = require("../domain/userDeletionRules");
```

Add helpers near the top:

```js
const ROLES_VALIDOS = ["admin", "caixa", "oficina"];
const STATUS_VALIDOS = new Set(["active", "inactive", "archived", "all"]);

function parsePermissions(row) {
  return String(row?.permissions_csv || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    profile_key: row.profile_key || row.role,
    profile_name: row.profile_name || row.role,
    active: Number(row.active),
    deletedat: row.deletedat || null,
    deletedpor: row.deletedpor || null,
    deletedreason: row.deletedreason || null,
    createdat: row.createdat || null,
    updatedat: row.updatedat || null,
    access_version: row.access_version,
    permissions: Array.isArray(row.permissions) ? row.permissions : parsePermissions(row),
  };
}

function userSelectSql(whereSql = "") {
  return `
    SELECT
      u.id, u.name, u.username, u.role,
      COALESCE(u.profile_key, u.role) AS profile_key,
      p.name AS profile_name,
      u.active, u.deletedat, u.deletedpor, u.deletedreason,
      u.createdat, u.updatedat, u.access_version,
      GROUP_CONCAT(pp.permission) AS permissions_csv
    FROM users u
    LEFT JOIN permission_profiles p ON p.key = COALESCE(u.profile_key, u.role)
    LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
    ${whereSql}
    GROUP BY u.id
  `;
}

function getUserById(id) {
  return getOne(userSelectSql("WHERE u.id=?"), [id]);
}

function getActiveAdminCount() {
  return getOne(
    "SELECT COUNT(*) AS total FROM users WHERE role='admin' AND active=1 AND deletedat IS NULL"
  )?.total || 0;
}

function countUserReferences(userId) {
  return USER_HISTORY_REFERENCES.map((ref) => {
    try {
      const row = getOne(`SELECT COUNT(*) AS total FROM ${ref.table} WHERE ${ref.column}=?`, [userId]);
      return { ...ref, total: Number(row?.total || 0) };
    } catch (error) {
      if (/no such table|no such column/i.test(String(error?.message || ""))) {
        return { ...ref, total: 0 };
      }
      throw error;
    }
  });
}

function assertExistingUser(id) {
  const user = getUserById(id);
  if (!user) return null;
  return user;
}
```

Use route-level permissions like this:

```js
router.get("/", auth(), authPermission("usuarios.ver"), handler);
router.post("/", auth(), authPermission("usuarios.criar"), handler);
router.put("/:id", auth(), authPermission("usuarios.editar"), handler);
router.get("/:id/delete-check", auth(), authPermission("usuarios.excluir_permanente"), handler);
router.post("/:id/archive", auth(), authPermission("usuarios.arquivar"), handler);
router.post("/:id/restore", auth(), authPermission("usuarios.restaurar"), handler);
router.post("/:id/reset-password", auth(), authPermission("usuarios.resetar_senha"), handler);
router.delete("/:id", auth(), authPermission("usuarios.excluir_permanente"), handler);
```

Important implementation requirements:

- `GET /` returns `{ users, meta }`.
- Default status is `active`, where `u.active=1 AND u.deletedat IS NULL`.
- `inactive` means `u.active=0 AND u.deletedat IS NULL`.
- `archived` means `u.deletedat IS NOT NULL`.
- `all` returns all users.
- `POST /` must insert `profile_key=role`.
- `PUT /:id` may update `name`, `username`, `role`, `active`, and optional `password`.
- `PUT /:id` must increment `access_version` when `role`, `profile_key`, `active`, `username`, or `password` changes.
- `POST /:id/archive` must set `active=0`, `deletedat=datetime('now','localtime')`, `deletedpor=req.user.id`, `deletedreason`, `updatedat`, and increment `access_version`.
- `POST /:id/restore` must clear archive fields, set `active=1`, update `updatedat`, and increment `access_version`.
- `POST /:id/reset-password` must validate password and increment `access_version`.
- `DELETE /:id` must call `countUserReferences()`, block with `409` when blockers exist, and run `DELETE FROM users WHERE id=?` only when no blockers exist.
- Physical delete should normally be possible only for users without history. Do not cascade or null any historical table.
- Self archive/reset/delete must be blocked with domain rules.
- Last active admin removal must be blocked before changing active, role, archive, or permanent delete.

- [ ] **Step 4: Run focused route tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- usersRoutes.test.js userRules.test.js userDeletionRules.test.js auth.test.js
```

Expected: PASS.

- [ ] **Step 5: Run route contracts**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- routeContracts.test.js
```

Expected: PASS. If the contract test asserts `/api/users` is admin-only by role, update only that assertion to reflect `usuarios.*` permissions and keep all other route contracts unchanged.

- [ ] **Step 6: Commit**

```powershell
git add backend/routes/users.js backend/__tests__/usersRoutes.test.js backend/__tests__/routeContracts.test.js
git commit -m "feat: add safe user management api"
```

## Task 5: Frontend Auth Permission Helpers

**Files:**

- Modify: `frontend/src/context/AuthContext.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Write a focused App route test**

Create `frontend/src/App.test.jsx`:

```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./pages/Usuarios', () => ({ default: () => <div>Pagina Usuarios</div> }))
vi.mock('./pages/Login', () => ({ default: () => <div>Login</div> }))

vi.mock('./components/Layout', async () => {
  const { Outlet } = await vi.importActual('react-router-dom')
  return { default: () => <Outlet /> }
})

let authState

vi.mock('./context/AuthContext', () => {
  return {
    AuthProvider: ({ children }) => <>{children}</>,
    useAuth: () => authState,
  }
})

describe('PrivateRoute permissions', () => {
  beforeEach(() => {
    authState = {
      loading: false,
      user: { role: 'caixa', permissions: ['usuarios.ver'] },
      can: (permission) => permission === 'usuarios.ver',
      canAny: (permissions) => permissions.includes('usuarios.ver'),
    }
  })

  it('permite rota de usuarios por permissao mesmo sem role admin', () => {
    render(<MemoryRouter initialEntries={['/usuarios']}><App /></MemoryRouter>)

    expect(screen.getByText('Pagina Usuarios')).toBeInTheDocument()
  })

  it('redireciona quando usuario nao possui a permissao exigida', () => {
    authState = {
      loading: false,
      user: { role: 'caixa', permissions: [] },
      can: () => false,
      canAny: () => false,
    }

    render(<MemoryRouter initialEntries={['/usuarios']}><App /></MemoryRouter>)

    expect(screen.queryByText('Pagina Usuarios')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run frontend test to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd test -- App.test.jsx
```

Expected: FAIL until `PrivateRoute` supports `permissions`.

- [ ] **Step 3: Add `can()` and `canAny()` to AuthContext**

In `frontend/src/context/AuthContext.jsx`, add after role helpers:

```jsx
  const permissions = Array.isArray(user?.permissions) ? user.permissions : []
  const profile = user?.profile || {
    key: user?.profile_key || user?.role,
    name: user?.profile_name || user?.role,
  }
  const can = useCallback((permission) => {
    if (!permission) return false
    return permissions.includes('*') || permissions.includes(permission)
  }, [permissions])
  const canAny = useCallback((required) => {
    if (!Array.isArray(required) || required.length === 0) return false
    return required.some((permission) => can(permission))
  }, [can])
```

Update provider value:

```jsx
<AuthContext.Provider value={{
  user,
  loading,
  login,
  logout,
  switchUser,
  isAdmin,
  isCaixa,
  isOficina,
  permissions,
  profile,
  can,
  canAny,
}}>
```

- [ ] **Step 4: Add `permissions` support to PrivateRoute**

In `frontend/src/App.jsx`, change:

```jsx
function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth()
```

to:

```jsx
function PrivateRoute({ children, roles, permissions }) {
  const { user, loading, canAny } = useAuth()
```

Add this check after the role check:

```jsx
  if (permissions && !canAny(permissions)) return <Navigate to="/" replace />
```

Change only the `/usuarios` route:

```jsx
<Route path="/usuarios" element={<PrivateRoute permissions={['usuarios.ver']}><Usuarios /></PrivateRoute>}/>
```

- [ ] **Step 5: Update Sidebar users link narrowly**

In `frontend/src/components/Sidebar.jsx`, destructure `can`:

```jsx
const { user, logout, switchUser, can } = useAuth()
```

Add:

```jsx
const canManageUsers = isAdmin || can?.('usuarios.ver')
```

Change:

```jsx
{isAdmin && navItem('/usuarios', 'Usuarios', 'usuarios')}
```

to:

```jsx
{canManageUsers && navItem('/usuarios', 'Usuarios', 'usuarios')}
```

Preserve the exact displayed label currently used in the file, including accents if present.

- [ ] **Step 6: Run tests/build**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd test -- App.test.jsx
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/context/AuthContext.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx frontend/src/App.test.jsx
git commit -m "feat: expose frontend permission helpers"
```

## Task 6: Usuarios Page Operational Redesign

**Files:**

- Modify: `frontend/src/pages/Usuarios.jsx`
- Create: `frontend/src/pages/Usuarios.test.jsx`

- [ ] **Step 1: Write failing UI tests**

Create `frontend/src/pages/Usuarios.test.jsx`:

```jsx
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Usuarios from './Usuarios'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 99, role: 'admin', permissions: ['usuarios.ver', 'usuarios.editar', 'usuarios.arquivar', 'usuarios.restaurar', 'usuarios.excluir_permanente', 'usuarios.resetar_senha'] },
    can: () => true,
    canAny: () => true,
  }),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const users = [
  { id: 1, name: 'Administrador', username: 'admin', role: 'admin', profile_name: 'Administrador', active: 1, deletedat: null, permissions: ['usuarios.ver'], createdat: '2026-07-10 09:00:00' },
  { id: 2, name: 'Caixa Antigo', username: 'caixa.antigo', role: 'caixa', profile_name: 'Caixa', active: 0, deletedat: '2026-07-09 10:00:00', deletedreason: 'Saiu da loja', permissions: ['atendimento.ver'], createdat: '2026-07-01 09:00:00' },
]

function mockList(data = users) {
  api.get.mockImplementation((url) => {
    if (String(url).startsWith('/users/2/delete-check')) {
      return Promise.resolve({ data: { allowed: false, blockers: [{ label: 'lancamentos criados', total: 3 }] } })
    }
    if (String(url).startsWith('/users')) {
      return Promise.resolve({ data: { users: data, meta: { total: data.length, active: 1, inactive: 0, archived: 1 } } })
    }
    return Promise.reject(new Error(`GET inesperado: ${url}`))
  })
}

describe('Usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList()
    api.post.mockResolvedValue({ data: { ok: true } })
    api.put.mockResolvedValue({ data: { ok: true } })
    api.delete.mockResolvedValue({ data: { ok: true } })
  })

  it('renderiza filtros, tabela operacional e usuarios retornados pela API', async () => {
    render(<Usuarios />)

    expect(await screen.findByRole('heading', { name: /usuarios/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/buscar por nome ou login/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /novo usuario/i })).toBeInTheDocument()
    expect(screen.getByText('Administrador')).toBeInTheDocument()
    expect(screen.getByText('@admin')).toBeInTheDocument()
  })

  it('filtra por texto chamando a API com q', async () => {
    render(<Usuarios />)

    fireEvent.change(await screen.findByPlaceholderText(/buscar por nome ou login/i), {
      target: { value: 'caixa' },
    })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/users', expect.objectContaining({
        params: expect.objectContaining({ q: 'caixa' }),
      }))
    })
  })

  it('arquiva usuario com motivo por acao destrutiva confirmada', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await user.click(await screen.findByRole('button', { name: /arquivar caixa antigo/i }))
    const dialog = screen.getByRole('dialog', { name: /arquivar usuario/i })
    await user.type(within(dialog).getByLabelText(/motivo/i), 'Saiu da loja')
    await user.click(within(dialog).getByRole('button', { name: /^arquivar$/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/2/archive', { reason: 'Saiu da loja' })
    })
  })

  it('mostra bloqueadores da exclusao permanente', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await user.click(await screen.findByRole('button', { name: /verificar exclusao permanente de caixa antigo/i }))

    expect(await screen.findByText(/lancamentos criados/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^excluir permanentemente$/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run UI tests to verify RED**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd test -- Usuarios.test.jsx
```

Expected: FAIL because current page has cards, no filters, no archive/delete-check actions.

- [ ] **Step 3: Redesign `Usuarios.jsx`**

Implement these pieces in `frontend/src/pages/Usuarios.jsx`:

- Use `erp-page`, `erp-page-header`, `erp-page-title`, `erp-page-subtitle`, `erp-page-actions`.
- Use `erp-filter-bar` with:
  - text input placeholder `Buscar por nome ou login`
  - status select values `active`, `inactive`, `archived`, `all`
  - role select values ``, `admin`, `caixa`, `oficina`
- Load with:

```js
const r = await api.get('/users', {
  params: {
    status,
    role: role || undefined,
    q: search.trim() || undefined,
  },
})
setUsers(r.data?.users || [])
setMeta(r.data?.meta || {})
```

- Render desktop table with columns:
  - Usuario
  - Login
  - Perfil
  - Status
  - Criado em
  - Acoes
- Render mobile records using `mobile-list` and `mobile-record-card`.
- Row actions:
  - Editar: opens existing create/edit modal.
  - Redefinir senha: opens password modal and calls `POST /users/:id/reset-password`.
  - Arquivar: opens reason modal and calls `POST /users/:id/archive`.
  - Restaurar: calls `POST /users/:id/restore` after confirmation for archived users.
  - Verificar exclusao permanente: calls `GET /users/:id/delete-check` and opens a modal. If `allowed=true`, show final destructive button that calls `DELETE /users/:id`; if false, show blockers only.
- Disable or hide self-destructive actions when `u.id === user.id`.
- Keep role editing limited to `admin`, `caixa`, `oficina`.
- Show effective permissions as read-only summary in the edit modal. Do not allow editing permissions.
- Use `toast.success` and `toast.error` with backend errors.
- Keep labels short and operational. Do not add feature-explanation text on the page.

- [ ] **Step 4: Run UI tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd test -- Usuarios.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/pages/Usuarios.jsx frontend/src/pages/Usuarios.test.jsx
git commit -m "feat: redesign user management page"
```

## Task 7: Integration Verification And Docs

**Files:**

- Modify: `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`

- [ ] **Step 1: Add Fase 2 status note**

Append or update the status section in `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`:

```md
## Status de Implementacao

- Fase 1 implementada: fundacao RBAC, perfis de sistema, permissoes efetivas em `/auth/me` e token minimo com `accessVersion`.
- Fase 2 implementada: gestao de usuarios com arquivamento/restauracao, reset de senha, exclusao permanente bloqueada por vinculos historicos e tela `/usuarios` operacional.
- Rotas de negocio fora de `/api/users` continuam usando roles durante esta fase.
- Edicao visual de perfis e matriz de permissoes segue reservada para fase posterior.
```

If the file already has `Status de Implementacao`, replace that section instead of duplicating it.

- [ ] **Step 2: Run backend focused verification**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test -- usersRoutes.test.js userDeletionRules.test.js userRules.test.js auth.test.js authRoutes.test.js routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full backend suite**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test
```

Expected: PASS.

- [ ] **Step 4: Run frontend focused tests**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd test -- Usuarios.test.jsx App.test.jsx
```

Expected: PASS. If `App.test.jsx` was not created in Task 5, run only `Usuarios.test.jsx`.

- [ ] **Step 5: Run frontend build**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 6: Search for unsafe user deletion**

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios"
rg -n "DELETE FROM users|deletedat=datetime|access_version=access_version\\+1|authPermission\\(\"usuarios" backend
```

Expected:

- `DELETE FROM users` appears only in `backend/routes/users.js` permanent delete path and tests.
- `deletedat=datetime` appears in archive path.
- `access_version=access_version+1` appears in archive, restore, reset password and access-changing update paths.
- `authPermission("usuarios...")` appears in `backend/routes/users.js`.

- [ ] **Step 7: Commit docs and any verification fixes**

```powershell
git add docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md backend frontend
git commit -m "docs: note rbac phase two status"
```

Only include `backend` or `frontend` in this commit if verification required small fixes after earlier commits. Do not create an empty commit.

## Final Verification

Run:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd test
cd ..\frontend
npm.cmd test -- Usuarios.test.jsx App.test.jsx
npm.cmd run build
```

Expected:

- Backend suite passes.
- Frontend focused tests pass.
- Frontend build passes.
- Usuario arquivado cannot log in because existing auth rejects `deletedat`.
- Historical joins continue to work because `users` rows are preserved.
- Permanent delete is unavailable when historical blockers exist.

## Manual Smoke Test

After automated verification, start the app only if needed for visual QA:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\backend"
npm.cmd run dev
```

In another terminal:

```powershell
cd "C:\Users\sinayder\Documents\Sistema Arte\.worktrees\rbac-fase-2-usuarios\frontend"
npm.cmd run dev
```

Check:

- `/usuarios` loads for admin.
- Search and filters call the API and update the list.
- Creating a `caixa` user works.
- Editing role/status invalidates that user session through `access_version`.
- Archive asks for a reason and removes the user from the active filter.
- Archived user appears under archived filter.
- Restore brings the user back to active.
- Permanent delete modal shows blockers for users with history.
- Permanent delete succeeds only for a new user with no historical links.

## Handoff To Phase 3

After Fase 2 is complete and reviewed, the next safe plan is Fase 3: migrate simple administrative routes to permissions one area at a time, beginning with `configuracoes`, `backup`, `relatorios`, `produtos` or `clientes`, while keeping OS, caixa, NF-e and oficina for later phases.
