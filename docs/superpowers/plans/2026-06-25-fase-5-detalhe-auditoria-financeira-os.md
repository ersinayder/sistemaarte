# Fase 5 Detalhe Auditoria Financeira OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar detalhe read-only por OS para a auditoria financeira, mostrando saldos oficiais, apontamentos e lancamentos considerados.

**Architecture:** O servico existente `financeiroIntegridadeService` ganha uma funcao pura para montar detalhe de uma OS com dependencias injetadas. A rota admin `/api/financeiro/integridade-os/:ordemId` consulta a OS, contas a receber e lancamentos, usa `getResumoFinanceiroOS()` como fonte oficial e retorna payload sanitizado. O frontend abre um modal dedicado a partir do painel de integridade.

**Tech Stack:** Node.js 22, Express 4, CommonJS, Vitest 4.1, React 18, Vite 8.

---

### Task 1: Servico Puro de Detalhe

**Files:**
- Modify: `backend/services/financeiroIntegridadeService.js`
- Modify: `backend/__tests__/financeiroIntegridadeService.test.js`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/__tests__/financeiroIntegridadeService.test.js`:

```js
it("builds read-only detail with official saldo and launch inclusion flags", () => {
  const detalhe = montarDetalheIntegridadeFinanceiraOS({
    ordem: { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção", valortotal: 120 },
    receberGerencial: { id: 3, saldo: 85, recebido: 35 },
    lancamentos: [
      { id: 7, data: "2026-06-25", tipo: "Entrada", categoria: "Saldo OS", descricao: "Pix", pagamento: "Pix", valor: 30, pago: 1, origem: "saldoos", deletedat: null },
      { id: 8, data: "2026-06-25", tipo: "Entrada", categoria: "Saldo OS", descricao: "Pendente", pagamento: "Pix", valor: 20, pago: 0, origem: "saldoos", deletedat: null },
      { id: 9, data: "2026-06-25", tipo: "Entrada", categoria: "Saldo OS", descricao: "Excluido", pagamento: "Pix", valor: 10, pago: 1, origem: "saldoos", deletedat: "2026-06-26" },
    ],
    getResumoFinanceiroOS: () => ({
      ordem: { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção", valortotal: 120 },
      recebido: 30,
      saldo: 90,
    }),
  });

  expect(detalhe.resumo).toEqual({
    valorTotal: 120,
    recebidoOficial: 30,
    saldoOficial: 90,
    excedente: 0,
  });
  expect(detalhe.receberGerencial).toEqual(expect.objectContaining({ saldo: 85 }));
  expect(detalhe.lancamentos).toEqual([
    expect.objectContaining({ id: 7, consideradoNoSaldo: true }),
    expect.objectContaining({ id: 8, consideradoNoSaldo: false }),
    expect.objectContaining({ id: 9, consideradoNoSaldo: false }),
  ]);
  expect(detalhe.apontamentos).toEqual([
    expect.objectContaining({ tipo: "receber_divergente", severidade: "aviso" }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- financeiroIntegridadeService.test.js`

Expected: FAIL because `montarDetalheIntegridadeFinanceiraOS` is not exported.

- [ ] **Step 3: Implement minimal service function**

In `backend/services/financeiroIntegridadeService.js`, export `montarDetalheIntegridadeFinanceiraOS`. Reuse `auditarIntegridadeFinanceiraOS` for apontamentos of the single OS, sanitize lancamento fields, and set `consideradoNoSaldo` from `pago` and `deletedat`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm.cmd test -- financeiroIntegridadeService.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/financeiroIntegridadeService.js backend/__tests__/financeiroIntegridadeService.test.js
git commit -m "feat: add financial integrity detail service"
```

### Task 2: Endpoint Admin de Detalhe

**Files:**
- Modify: `backend/routes/financeiro.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write the failing route contract**

Add this assertion near the finance route expectations:

```js
expect(routeRoles(financeiroRouter, 'get', '/integridade-os/:ordemId')).toEqual(['admin']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: FAIL because the detail route is not registered.

- [ ] **Step 3: Add route**

Add the route before `router.get("/integridade-os", ...)` or before report routes:

```js
router.get("/integridade-os/:ordemId", auth(["admin"]), (req, res, next) => {
  try {
    const ordem = getOne(
      "SELECT id, numero, clientenome, status, valortotal FROM ordens WHERE id=? AND deletedat IS NULL",
      [req.params.ordemId]
    );
    if (!ordem) return res.status(404).json({ error: "OS nao encontrada" });

    const receberGerencial = getContasReceberPayload().find((row) => Number(row.id) === Number(req.params.ordemId)) || null;
    const lancamentos = getAll(
      `SELECT id, data, tipo, categoria, descricao, pagamento, valor, pago, origem, deletedat
       FROM lancamentos
       WHERE ordemid=?
       ORDER BY data ASC, id ASC`,
      [req.params.ordemId]
    );
    res.json(montarDetalheIntegridadeFinanceiraOS({
      ordem,
      receberGerencial,
      lancamentos,
      getResumoFinanceiroOS,
    }));
  } catch (e) { next(e); }
});
```

- [ ] **Step 4: Run route test**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/financeiro.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expose financial integrity detail endpoint"
```

### Task 3: Modal Read-only no Financeiro

**Files:**
- Modify: `frontend/src/pages/Financeiro.jsx`
- Modify: `frontend/src/pages/Financeiro.test.jsx`

- [ ] **Step 1: Write failing frontend test**

Extend `frontend/src/pages/Financeiro.test.jsx` to click `Auditar`, assert API call `/financeiro/integridade-os/10` with `skipGlobalErrorToast: true`, and assert modal text `Auditoria financeira da OS`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npm.cmd test -- Financeiro.test.jsx`

Expected: FAIL because the panel has no `Auditar` action or modal.

- [ ] **Step 3: Add modal and action**

In `Financeiro.jsx`, add state for selected issue, a modal component that fetches detail, and an `Auditar` button per issue row. The modal must show resumo, apontamentos and lancamentos, and must not show corrective actions.

- [ ] **Step 4: Run frontend test and build**

```powershell
cd frontend
npm.cmd test -- Financeiro.test.jsx
npm.cmd run build
```

Expected: PASS and successful Vite build.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/Financeiro.jsx frontend/src/pages/Financeiro.test.jsx
git commit -m "feat: show financial integrity detail modal"
```

### Task 4: Verification

**Files:**
- No production changes.

- [ ] **Step 1: Run backend full suite**

Run: `cd backend; npm.cmd test`

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend test suite and build sequentially**

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

Expected: tests and build pass. Keep these sequential because Vite build showed interference when run concurrently with frontend tests.

- [ ] **Step 3: Run whatsapp tests**

Run: `cd whatsapp-service; npm.cmd test`

Expected: all tests pass.

- [ ] **Step 4: Run audits**

```powershell
npm.cmd audit --omit=dev
cd backend; npm.cmd audit --omit=dev
cd ../frontend; npm.cmd audit --omit=dev
cd ../whatsapp-service; npm.cmd audit --omit=dev
```

Expected: `0 vulnerabilities` in all packages.

### Self-Review

- Spec coverage: detalhe read-only, rota admin, fonte oficial de saldo, lancamentos com `consideradoNoSaldo`, modal sem acoes corretivas and verification are covered.
- Placeholder scan: no TBD/TODO/fill-later placeholders remain.
- Type consistency: `ordem`, `resumo`, `receberGerencial`, `lancamentos`, `apontamentos`, `consideradoNoSaldo` are used consistently.
