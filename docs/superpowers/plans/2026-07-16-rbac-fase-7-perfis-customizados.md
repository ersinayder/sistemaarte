# RBAC Fase 7 Perfis Customizados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar perfis customizados e atribui-los a usuarios separando `role` estrutural de `profile_key` efetivo.

**Architecture:** `permission_profiles.base_role` define compatibilidade com `users.role`. O backend valida existencia, atividade e compatibilidade antes de gravar `profile_key`; a UI mostra "Tipo estrutural" e "Perfil de permissoes" como campos separados.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, React 18, Vite 8, Vitest 4.1.

## Global Constraints

- `users.role` permanece restrito a `admin`, `caixa`, `oficina`.
- `profile_key` e a fonte efetiva de permissoes.
- Perfil atribuido a usuario deve existir, estar ativo e ter `base_role` igual ao `role`.
- Alterar perfil de usuario incrementa `access_version`.
- O proprio usuario nao pode alterar seu `role`, `profile_key` ou status ativo.
- Edicao de matriz/criacao de perfis exige `configuracoes.seguranca`.
- Edicao de usuarios exige `usuarios.editar`.
- O perfil `admin` mantem todas as permissoes.
- Nao deixar o sistema sem usuario ativo com `usuarios.ver`, `usuarios.editar` e `usuarios.restaurar`.
- Usar `npm.cmd` para testes.

---

### Task 1: Base Role No Banco E Catalogo De Perfis

**Files:**
- Modify: `backend/database.js`
- Modify: `backend/domain/permissionRules.js`
- Modify: `backend/__tests__/databaseMigrations.test.js`
- Modify: `backend/__tests__/permissionRules.test.js`

**Interfaces:**
- Produces: `permission_profiles.base_role`, `DEFAULT_PROFILES[].base_role`.

- [ ] Add failing tests proving default profiles expose `base_role` and seed preserves existing custom metadata.
- [ ] Add `base_role TEXT` to schema and migration.
- [ ] Backfill `base_role=key` for default profiles.
- [ ] Update `DEFAULT_PROFILES` and `seedPermissionProfiles()`.
- [ ] Run `cd backend; npm.cmd test -- databaseMigrations.test.js permissionRules.test.js`.

### Task 2: Backend Para Criar Perfil Customizado E Validar Atribuicao

**Files:**
- Modify: `backend/routes/permissionProfiles.js`
- Modify: `backend/routes/users.js`
- Modify: `backend/domain/userRules.js`
- Modify: `backend/__tests__/permissionProfilesRoutes.test.js`
- Modify: `backend/__tests__/usersRoutes.test.js`
- Modify: `backend/__tests__/routeContracts.test.js`

**Interfaces:**
- Consumes: `permission_profiles.base_role`.
- Produces: `POST /api/permission-profiles`, `POST /api/users` with optional `profile_key`, `PUT /api/users/:id` with optional `profile_key`.

- [ ] Add failing tests for `POST /api/permission-profiles`.
- [ ] Add failing tests for creating/updating users with `profile_key` distinct from `role`.
- [ ] Add failing tests for incompatible, inactive and missing profiles.
- [ ] Add failing tests for self profile change and last access-manager coverage.
- [ ] Implement profile creation with generated/validated key, known permissions and `base_role`.
- [ ] Implement assignable profile lookup in users route.
- [ ] Preserve last admin and last access-manager invariants.
- [ ] Run `cd backend; npm.cmd test -- permissionProfilesRoutes.test.js usersRoutes.test.js routeContracts.test.js`.

### Task 3: UI De Perfis Customizados E Atribuicao Separada

**Files:**
- Modify: `frontend/src/pages/Usuarios.jsx`
- Modify: `frontend/src/pages/Usuarios.test.jsx`

**Interfaces:**
- Consumes: profile API returning `base_role`.
- Produces: UI with "Novo perfil", `role` as "Tipo estrutural", and `profile_key` as "Perfil de permissoes".

- [ ] Add failing tests for creating a custom profile from the Perfis tab.
- [ ] Add failing tests for user modal sending `role` and `profile_key` separately.
- [ ] Add failing tests for filtering profile options by selected role.
- [ ] Implement "Novo perfil" modal in `PerfilEditor`.
- [ ] Load profiles for user modal and filter assignable profiles by `base_role`.
- [ ] Update labels/table copy to separate type and permissions profile.
- [ ] Run `cd frontend; npm.cmd test -- Usuarios.test.jsx`.

### Task 4: Revisao Final E Validacao Completa

**Files:**
- Modify: `docs/superpowers/specs/2026-07-09-autorizacao-rbac-usuarios-design.md`

**Interfaces:**
- Consumes: Tasks 1-3 complete.
- Produces: documented Fase 7 completion.

- [ ] Update RBAC status docs with Fase 7.
- [ ] Run `cd backend; npm.cmd test`.
- [ ] Run `cd frontend; npm.cmd test`.
- [ ] Run `cd frontend; npm.cmd run build`.
- [ ] Run `git diff --check`.
- [ ] Request code review and fix Critical/Important findings.
