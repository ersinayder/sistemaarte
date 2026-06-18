# NF-e Manual Number Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only, auditable and idempotent flow to invalidate one NF-e number or a continuous range without ever contacting production during automated verification.

**Architecture:** A focused domain module validates and normalizes requests. A dedicated service owns SQLite reservation, idempotency, SEFAZ communication and XML capture, while the route only handles HTTP. The React page uses a tested modal and history view; all SEFAZ calls are dependency-injected and mocked in tests.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, nfewizard-io 1.1.0, React 18, Vite 8, Vitest 4, Testing Library, jsdom.

---

### Task 1: Domain rules and database schema

**Files:**
- Create: `backend/domain/nfeInutilizacaoRules.js`
- Create: `backend/__tests__/nfeInutilizacaoRules.test.js`
- Modify: `backend/database.js`
- Modify: `backend/__tests__/database.test.js`

- [ ] Write failing tests for normalization, year bounds, range order, 10,000-number limit, 15-255 character justification, and exact confirmation text.
- [ ] Run `cd backend; npm.cmd test -- nfeInutilizacaoRules.test.js database.test.js` and confirm failures are caused by missing rules/table.
- [ ] Implement pure functions `validarPedidoInutilizacao`, `fraseConfirmacaoInutilizacao`, `normalizarPedidoInutilizacao`, and overlap helpers.
- [ ] Add `nfe_inutilizacoes` with `CREATE TABLE IF NOT EXISTS`, a unique `idempotency_key`, audit columns, statuses, XML columns and lookup indexes.
- [ ] Re-run focused tests and confirm green.

### Task 2: Backend service and SEFAZ adapter

**Files:**
- Create: `backend/services/nfeInutilizacaoService.js`
- Create: `backend/utils/nfeInutilizacao.js`
- Create: `backend/__tests__/nfeInutilizacaoService.test.js`
- Modify: `backend/utils/nfe.js`

- [ ] Write failing service tests for local number-use checks, overlap checks, adjacency, idempotency, reservation-before-call, `cStat=102`, definitive rejection, uncertain communication, local failure and XML persistence failure.
- [ ] Run `cd backend; npm.cmd test -- nfeInutilizacaoService.test.js` and confirm expected failures.
- [ ] Implement a dependency-injected service with a short SQLite transaction, in-memory mutex and no database transaction around the network request.
- [ ] Implement an isolated nfewizard adapter for `NFE_Inutilizacao`, mapping MG to `cUF=31`, passing two-digit year, model 55, configured series and CNPJ.
- [ ] Capture signed request XML and raw response XML without logging their contents; persist both to the database and `backend/data/nfe_xmls`.
- [ ] Map `102` to `autorizado`, fiscal replies to `rejeitado`, pre-send failures to `falha_local`, and timeout/network/incomplete replies to `incerto`.
- [ ] Re-run focused tests and confirm green.

### Task 3: Backend HTTP API

**Files:**
- Modify: `backend/routes/nfe.js`
- Create: `backend/__tests__/nfeInutilizacaoRoutes.test.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] Write failing tests for admin authorization, context response, lightweight history, POST status codes, stable idempotent replay and XML downloads.
- [ ] Run `cd backend; npm.cmd test -- nfeInutilizacaoRoutes.test.js routeContracts.test.js` and confirm expected failures.
- [ ] Add static routes before `/:chave` routes:
  - `GET /inutilizacoes/contexto`
  - `GET /inutilizacoes`
  - `POST /inutilizacoes`
  - `GET /inutilizacoes/:id/xml/:tipo`
- [ ] Return no XML in context/history responses, mask CNPJ in context and use safe attachment filenames.
- [ ] Re-run focused tests and confirm green.

### Task 4: Frontend test harness and modal behavior

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/test/setup.js`
- Create: `frontend/src/components/nfe/InutilizacaoModal.jsx`
- Create: `frontend/src/components/nfe/InutilizacaoModal.test.jsx`

- [ ] Install Vitest, Testing Library, user-event and jsdom as dev dependencies.
- [ ] Write failing component tests for context loading, single/range confirmation, validation, stable idempotency key, disabled submit, success, rejection, uncertain response and history/XML links.
- [ ] Run `cd frontend; npm.cmd test -- InutilizacaoModal.test.jsx` and confirm failures are caused by the missing component behavior.
- [ ] Implement the modal with accessible labels, read-only fiscal context, destructive warning, exact typed confirmation, guarded close during submission and lazy XML links.
- [ ] Re-run focused frontend tests and confirm green.

### Task 5: NF-e page integration

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Create: `frontend/src/pages/NotasFiscais.test.jsx`

- [ ] Write a failing page test proving the action is visible to admin and absent for caixa.
- [ ] Run `cd frontend; npm.cmd test -- NotasFiscais.test.jsx` and confirm the expected failure.
- [ ] Add the header action and mount the modal without changing caixa emission permissions.
- [ ] Refresh the NF-e list after an authorized invalidation and preserve existing modal flows.
- [ ] Re-run focused tests and confirm green.

### Task 6: Documentation and full verification

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/nfe-inutilizacao-operacao.md`

- [ ] Document endpoint contracts, statuses, distinction from cancellation, XML retention and the production safety procedure.
- [ ] Run `cd backend; npm.cmd test` and require zero failures.
- [ ] Run `cd frontend; npm.cmd test` and require zero failures.
- [ ] Run `cd frontend; npm.cmd run build` and require exit code 0.
- [ ] Run `git diff --check` and inspect the complete diff for unrelated changes.
- [ ] Do not send any request to SEFAZ production. Prepare a separate PowerShell homologation script only after automated verification.
