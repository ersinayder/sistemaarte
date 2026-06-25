# Fase 3 Auditoria Pendencias Fiscais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor a linha do tempo read-only de uma pendencia fiscal ativa na API e na tela de NF-e.

**Architecture:** Estender `backend/repositories/nfePendenciaRepository.js` com uma consulta de detalhe que escolhe a tabela correta por `origem` e retorna somente campos publicos. `backend/routes/nfe.js` expõe uma rota read-only antes das rotas dinamicas por chave, e `NotasFiscais.jsx` abre um modal operacional a partir da faixa de pendencias.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, Vitest, React 18, Vite.

---

### Task 1: Detalhe de pendencia no repositorio

**Files:**
- Modify: `backend/repositories/nfePendenciaRepository.js`
- Modify: `backend/__tests__/nfePendenciaRepository.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for `buscarPendenciaFiscalComTransicoes(db, { origem, id })` covering emission and event attempts. The expected result contains sanitized `pendencia` and ordered `transicoes`, and does not contain `xml_envio`, `xml_retorno`, `payload_json` or `erro_local`.

Run: `cd backend && npm.cmd test -- nfePendenciaRepository.test.js`
Expected: FAIL because the function is not exported.

- [ ] **Step 2: Implement repository function**

Add `buscarPendenciaFiscalComTransicoes(db, input)` to the repository. Validate `origem` as `emissao` or `evento`, normalize positive integer `id`, return `null` for missing inactive rows, and select transitions ordered by `id ASC`.

- [ ] **Step 3: Verify focused repository test**

Run: `cd backend && npm.cmd test -- nfePendenciaRepository.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add backend/repositories/nfePendenciaRepository.js backend/__tests__/nfePendenciaRepository.test.js
git commit -m "feat: auditar transicoes de pendencia fiscal"
```

### Task 2: Rota read-only de transicoes

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route contract**

Assert `routeRoles(nfeRouter, 'get', '/pendencias/:origem/:id/transicoes')` is `['admin', 'caixa']`, the route appears before `/:chave/eventos`, the source imports `buscarPendenciaFiscalComTransicoes`, and the route slice does not call `getNFEWizard`, `callSEFAZ`, `NFE_`, `service.executar`, or expose sensitive fields.

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: FAIL because the route does not exist.

- [ ] **Step 2: Implement route**

Add `router.get('/pendencias/:origem/:id/transicoes', auth(['admin', 'caixa']), ...)`. Return `400` for invalid input, `404` for null result, and `{ pendencia, transicoes }` for success.

- [ ] **Step 3: Verify route contract**

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expor auditoria de pendencia fiscal"
```

### Task 3: Modal de auditoria na tela NF-e

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing frontend contract**

Assert `NotasFiscais.jsx` defines `ModalAuditoriaPendenciaFiscal`, calls `/nfe/pendencias/${pendencia.origem}/${pendencia.id}/transicoes` with `skipGlobalErrorToast: true`, passes `onAudit` to `PendenciasFiscaisPanel`, and renders the modal conditionally.

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: FAIL because the modal does not exist.

- [ ] **Step 2: Implement UI**

Add state `auditoriaPendencia`, pass `onAudit={setAuditoriaPendencia}`, add an `Auditar` button per pending card, and implement a read-only modal that fetches and displays transitions.

- [ ] **Step 3: Verify frontend contract and build**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
cd ..\frontend
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/pages/NotasFiscais.jsx backend/__tests__/routeContracts.test.js
git commit -m "feat: mostrar auditoria de pendencia fiscal"
```

### Task 4: Verification

**Files:**
- No production edits expected.

- [ ] **Step 1: Focused backend tests**

Run: `cd backend && npm.cmd test -- nfePendenciaRepository.test.js routeContracts.test.js`
Expected: PASS.

- [ ] **Step 2: Frontend tests and build**

Run: `cd frontend && npm.cmd test && npm.cmd run build`
Expected: PASS.

- [ ] **Step 3: Backend full suite**

Run: `cd backend && npm.cmd test`
Expected: PASS.
