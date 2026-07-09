# Fase 8: Resumo de Integridade no Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor um resumo read-only de integridade fiscal e financeira no Dashboard para usuarios `admin`.

**Architecture:** Criar um servico puro `integridadeResumoService` que agrega contagens ja calculadas pelos servicos/repositories existentes. A rota `GET /api/kpis/integridade` monta os dados locais e retorna somente contadores sanitizados. O Dashboard carrega esse resumo apenas quando `isAdmin` for verdadeiro e mostra uma faixa compacta sem acoes corretivas.

**Tech Stack:** Node.js 22, Express 4, CommonJS, SQLite/better-sqlite3, React 18, Vite, Vitest.

---

## File Structure

- Create: `backend/services/integridadeResumoService.js`
  - Pure aggregation of fiscal pending, financial OS integrity, and fiscal-financial integrity summaries.
- Create: `backend/__tests__/integridadeResumoService.test.js`
  - Red/green coverage for sanitized summary counts.
- Modify: `backend/routes/kpis.js`
  - Add admin-only `GET /integridade`.
- Modify: `backend/__tests__/routeContracts.test.js`
  - Assert route roles, local-only behavior, and Dashboard source contract.
- Modify: `frontend/src/pages/Dashboard.jsx`
  - Load `/kpis/integridade` only for admin and render a compact read-only panel.

---

### Task 1: Summary Service

**Files:**
- Create: `backend/services/integridadeResumoService.js`
- Test: `backend/__tests__/integridadeResumoService.test.js`

- [ ] **Step 1: Write failing service test**

Create `backend/__tests__/integridadeResumoService.test.js`:

```js
import { describe, expect, it } from "vitest";
import { montarResumoIntegridade } from "../services/integridadeResumoService.js";

describe("montarResumoIntegridade", () => {
  it("aggregates sanitized fiscal and financial integrity counters", () => {
    const resumo = montarResumoIntegridade({
      pendenciasFiscais: [
        { status: "incerto", xml_envio: "<xml/>" },
        { status: "processando", payload_json: "{}" },
      ],
      integridadeFinanceira: { total: 3, criticos: 2, avisos: 1, itens: [{ segredo: "x" }] },
      integridadeFiscalFinanceira: { meta: { total: 1, criticos: 1, avisos: 0 }, itens: [{ nfe_xml: "<xml/>" }] },
      now: () => 123,
    });

    expect(resumo).toEqual({
      fiscal: { pendencias: 2, incertas: 1, processando: 1 },
      financeiro: { apontamentos: 3, criticos: 2, avisos: 1 },
      fiscalFinanceiro: { apontamentos: 1, criticos: 1, avisos: 0 },
      meta: { total: 6, criticos: 3, avisos: 2, ts: 123 },
    });
    expect(JSON.stringify(resumo)).not.toMatch(/xml|payload|segredo|cpf|phone/i);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
cd backend
npm.cmd test -- integridadeResumoService.test.js
```

Expected: FAIL because `integridadeResumoService.js` does not exist.

- [ ] **Step 3: Implement service**

Create `backend/services/integridadeResumoService.js`:

```js
function countStatus(rows, status) {
  return rows.filter((row) => row.status === status).length;
}

function toCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function montarResumoIntegridade({
  pendenciasFiscais = [],
  integridadeFinanceira = {},
  integridadeFiscalFinanceira = {},
  now = Date.now,
} = {}) {
  const fiscal = {
    pendencias: pendenciasFiscais.length,
    incertas: countStatus(pendenciasFiscais, "incerto"),
    processando: countStatus(pendenciasFiscais, "processando"),
  };
  const financeiro = {
    apontamentos: toCount(integridadeFinanceira.total),
    criticos: toCount(integridadeFinanceira.criticos),
    avisos: toCount(integridadeFinanceira.avisos),
  };
  const metaFiscalFinanceiro = integridadeFiscalFinanceira.meta || {};
  const fiscalFinanceiro = {
    apontamentos: toCount(metaFiscalFinanceiro.total),
    criticos: toCount(metaFiscalFinanceiro.criticos),
    avisos: toCount(metaFiscalFinanceiro.avisos),
  };

  return {
    fiscal,
    financeiro,
    fiscalFinanceiro,
    meta: {
      total: fiscal.pendencias + financeiro.apontamentos + fiscalFinanceiro.apontamentos,
      criticos: financeiro.criticos + fiscalFinanceiro.criticos,
      avisos: financeiro.avisos + fiscalFinanceiro.avisos,
      ts: now(),
    },
  };
}

module.exports = { montarResumoIntegridade };
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- integridadeResumoService.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/integridadeResumoService.js backend/__tests__/integridadeResumoService.test.js
git commit -m "feat: add integrity dashboard summary service"
```

---

### Task 2: Admin KPI Route

**Files:**
- Modify: `backend/routes/kpis.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route contract**

Add route authorization assertion:

```js
const kpisRouter = await loadRouter('../routes/kpis.js');
expect(routeRoles(kpisRouter, 'get', '/integridade')).toEqual(['admin']);
```

Add source-contract assertion:

```js
it('exposes admin-only integrity summary without external fiscal calls', async () => {
  const kpisRouter = await loadRouter('../routes/kpis.js');
  const source = fs.readFileSync(new URL('../routes/kpis.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf('router.get("/integridade"');
  const streamStart = source.indexOf('router.get("/stream"');
  const routeSource = source.slice(routeStart, streamStart);

  expect(routeRoles(kpisRouter, 'get', '/integridade')).toEqual(['admin']);
  expect(source).toMatch(/montarResumoIntegridade/);
  expect(source).toMatch(/listarPendenciasFiscais/);
  expect(source).toMatch(/auditarIntegridadeFinanceiraOS/);
  expect(source).toMatch(/auditarIntegridadeFiscalFinanceiraNFe/);
  expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|wizard\.|service\.executar/);
  expect(routeSource).not.toMatch(/res\.json\([^)]*(xml|payload|cpf|phone)/s);
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because `/integridade` is not registered.

- [ ] **Step 3: Implement route**

In `backend/routes/kpis.js`, import existing helpers and add route before `/stream`:

```js
const { getAll, getDB } = require("../database");
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { listarPendenciasFiscais } = require("../repositories/nfePendenciaRepository");
const { auditarIntegridadeFinanceiraOS } = require("../services/financeiroIntegridadeService");
const { auditarIntegridadeFiscalFinanceiraNFe } = require("../services/nfeIntegridadeFinanceiraService");
const { montarResumoIntegridade } = require("../services/integridadeResumoService");
```

Add helper:

```js
function getContasReceberResumo() {
  return getAll(`
    SELECT o.id,
           o.numero,
           o.clientenome,
           o.status,
           o.prazoentrega,
           o.valortotal,
           COALESCE(SUM(CASE WHEN l.pago=1 AND l.deletedat IS NULL THEN l.valor ELSE 0 END),0) AS recebido,
           MAX(0, o.valortotal - COALESCE(SUM(CASE WHEN l.pago=1 AND l.deletedat IS NULL THEN l.valor ELSE 0 END),0)) AS saldo
    FROM ordens o
    LEFT JOIN lancamentos l ON l.ordemid = o.id
    WHERE o.deletedat IS NULL AND o.status NOT IN ('Entregue','Cancelado')
    GROUP BY o.id
    HAVING saldo > 0.009
  `);
}
```

Add route:

```js
router.get("/integridade", auth(["admin"]), (_req, res, next) => {
  try {
    const ordens = getAll(
      "SELECT id, numero, clientenome, status, valortotal FROM ordens WHERE deletedat IS NULL ORDER BY id DESC"
    );
    const notas = getDB().prepare(`
      SELECT id, numero, clientenome, status, valortotal, nfe_status, nfe_chave, nfe_xml
      FROM ordens
      WHERE deletedat IS NULL AND nfe_status IS NOT NULL AND nfe_deletedat IS NULL
      ORDER BY nfe_emitida_em DESC, id DESC
    `).all();

    res.json(montarResumoIntegridade({
      pendenciasFiscais: listarPendenciasFiscais(getDB()),
      integridadeFinanceira: auditarIntegridadeFinanceiraOS({
        ordens,
        receberGerencial: getContasReceberResumo(),
        getResumoFinanceiroOS,
      }),
      integridadeFiscalFinanceira: auditarIntegridadeFiscalFinanceiraNFe(notas),
    }));
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/kpis.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expose dashboard integrity summary"
```

---

### Task 3: Dashboard Panel

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing frontend contract**

Add to `routeContracts.test.js`:

```js
it('shows admin-only integrity summary on Dashboard without corrective actions', () => {
  const source = fs.readFileSync(new URL('../../frontend/src/pages/Dashboard.jsx', import.meta.url), 'utf8');
  const panelStart = source.indexOf('function IntegridadeResumoPanel');
  const nextFunction = source.indexOf('export default function Dashboard', panelStart);
  const panelSource = source.slice(panelStart, nextFunction);

  expect(source).toMatch(/function IntegridadeResumoPanel/);
  expect(source).toMatch(/const \{ kpis: live, online \} = useKpiStream\(\)/);
  expect(source).toMatch(/const \{ isAdmin \} = useAuth\(\) \|\| \{\}/);
  expect(source).toMatch(/api\.get\(['"]\/kpis\/integridade['"],\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
  expect(source).toMatch(/isAdmin && integridadeResumo\?\.meta\?\.total > 0/);
  expect(source).toMatch(/<IntegridadeResumoPanel resumo=\{integridadeResumo\} onNavigate=\{navigate\}/);
  expect(panelSource).not.toMatch(/Corrigir|Consultar SEFAZ|Reenviar|Cancelar|Emitir CC-e|Editar OS/);
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because Dashboard has no panel.

- [ ] **Step 3: Implement Dashboard panel**

In `frontend/src/pages/Dashboard.jsx`:

- Import `useAuth`.
- Add `IntegridadeResumoPanel`.
- Add `integridadeResumo` state.
- Load `/kpis/integridade` only when `isAdmin`.
- Render panel below the live KPI section.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
cd ..\frontend
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/Dashboard.jsx backend/__tests__/routeContracts.test.js
git commit -m "feat: show dashboard integrity summary"
```

---

### Task 4: Final Verification

- [ ] Run backend full suite: `cd backend; npm.cmd test`
- [ ] Run frontend suite and build sequentially: `cd frontend; npm.cmd test; npm.cmd run build`
- [ ] Run WhatsApp service suite: `cd whatsapp-service; npm.cmd test`
- [ ] Run audits in root, backend, frontend and whatsapp-service: `npm.cmd audit --omit=dev`
- [ ] Confirm clean branch: `git status --short --branch`
