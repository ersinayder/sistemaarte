# Fase 2 Pendencias Fiscais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor e renderizar pendencias fiscais ativas ou incertas sem permitir reenvio cego nem vazar payload/XML fiscal.

**Architecture:** Um repositorio read-only agrega `nfe_emissao_tentativas` e `nfe_evento_tentativas` com dados minimos de `ordens`/`clientes`. A rota `/api/nfe/pendencias` entrega esse resumo para `admin` e `caixa`, e `NotasFiscais.jsx` mostra uma faixa operacional condicional.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, Vitest, React 18, Vite.

---

### Task 1: Repositorio read-only de pendencias

**Files:**
- Create: `backend/repositories/nfePendenciaRepository.js`
- Test: `backend/__tests__/nfePendenciaRepository.test.js`

- [ ] **Step 1: Write failing repository tests**

Create `backend/__tests__/nfePendenciaRepository.test.js` with an in-memory SQLite schema for `ordens`, `clientes`, `nfe_emissao_tentativas` and `nfe_evento_tentativas`. Assert that `listarPendenciasFiscais(db)` returns only `processando` and `incerto`, maps emission rows to `origem: "emissao"` and event rows to `origem: "evento"`, orders by `updatedat DESC`, and does not expose `xml_envio`, `xml_retorno`, `payload_json` or `erro_local`.

Run: `cd backend && npm.cmd test -- nfePendenciaRepository.test.js`
Expected: FAIL because `nfePendenciaRepository.js` does not exist.

- [ ] **Step 2: Implement minimal repository**

Create `backend/repositories/nfePendenciaRepository.js` exporting `listarPendenciasFiscais(db)`. Use two SELECTs joined with `UNION ALL`, select only public columns, bind active statuses, and cap the result with `LIMIT 50`.

- [ ] **Step 3: Verify repository tests pass**

Run: `cd backend && npm.cmd test -- nfePendenciaRepository.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add backend/repositories/nfePendenciaRepository.js backend/__tests__/nfePendenciaRepository.test.js
git commit -m "feat: listar pendencias fiscais ativas"
```

### Task 2: Rota `/api/nfe/pendencias`

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route contract**

Update `routeContracts.test.js` to assert `routeRoles(nfeRouter, 'get', '/pendencias')` equals `['admin', 'caixa']`, that `/pendencias` appears before `/:chave/eventos`, and that the route source does not select `payload_json`, `xml_envio`, `xml_retorno` or `erro_local`.

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: FAIL because route does not exist.

- [ ] **Step 2: Add the route**

Import `listarPendenciasFiscais` in `backend/routes/nfe.js`. Add `router.get('/pendencias', auth(['admin', 'caixa']), ...)` before dynamic `/:chave` routes. Return `{ pendencias, meta: { ambiente: tpAmbAtual(), total: pendencias.length } }` and generic 500 on failure.

- [ ] **Step 3: Verify route contract passes**

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expor pendencias fiscais"
```

### Task 3: Faixa operacional em Notas Fiscais

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing frontend contract**

Add assertions to `routeContracts.test.js` confirming `NotasFiscais.jsx` calls `/nfe/pendencias`, uses `skipGlobalErrorToast: true`, defines `PendenciasFiscaisPanel`, and renders it conditionally.

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: FAIL because frontend code has no pendencias panel.

- [ ] **Step 2: Implement panel and loader**

In `NotasFiscais.jsx`, add state `pendenciasFiscais`, loader `carregarPendenciasFiscais`, and component `PendenciasFiscaisPanel`. Call it from `carregar()` only outside the lixeira. Render the panel above the filters when `pendenciasFiscais.length > 0`.

- [ ] **Step 3: Verify contract passes**

Run: `cd backend && npm.cmd test -- routeContracts.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/pages/NotasFiscais.jsx backend/__tests__/routeContracts.test.js
git commit -m "feat: mostrar pendencias fiscais na tela de nfe"
```

### Task 4: Verification

**Files:**
- No production edits expected.

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
cd backend
npm.cmd test -- nfePendenciaRepository.test.js routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: Run backend full tests if focused checks are green**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: PASS.
