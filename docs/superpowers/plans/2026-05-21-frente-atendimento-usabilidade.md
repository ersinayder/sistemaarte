# Frente de Atendimento Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved `/atendimento` front-desk workflow while keeping `Caixa` as the movement review and closing screen.

**Architecture:** Add a focused front-end page for the three front-desk flows and make the smallest backend extension needed for structured standalone product sales. Preserve existing OS creation, OS balance calculation, status transition, and Caixa manual-entry behavior.

**Tech Stack:** Express 4, better-sqlite3, Vitest, React 18, React Router, Vite, existing CSS design tokens.

---

## File Structure

- Modify `backend/database.js`: add `lancamento_itens` table and index to schema/migrations.
- Create `backend/domain/caixaRules.js`: normalize standalone sale items and generate sale descriptions.
- Create `backend/__tests__/caixaRules.test.js`: unit tests for sale item normalization.
- Modify `backend/__tests__/routeContracts.test.js`: source-level contracts for `lancamento_itens`, `vendaavulsa`, and Atendimento route.
- Modify `backend/routes/caixa.js`: accept `itens` for `vendaavulsa`, persist items transactionally, and return `itens_resumo` on GET.
- Create `frontend/src/pages/Atendimento.jsx`: approved front-desk UI with Nova OS, Receber OS, Venda avulsa flows.
- Modify `frontend/src/App.jsx`: lazy-load route `/atendimento` and default admin/caixa to it.
- Modify `frontend/src/components/Sidebar.jsx`: add `Atendimento` first and keep `Caixa`.
- Modify `frontend/src/pages/Caixa.jsx`: add origin filter, show item summary for `vendaavulsa`, and label the manual-entry button clearly.

## Task 1: Caixa Sale Rules

**Files:**
- Create: `backend/domain/caixaRules.js`
- Create: `backend/__tests__/caixaRules.test.js`

- [ ] **Step 1: Write failing tests for standalone sale items**

```js
import { describe, expect, it } from 'vitest';
import { normalizarItensVendaAvulsa, descricaoVendaAvulsa } from '../domain/caixaRules.js';

describe('normalizarItensVendaAvulsa', () => {
  it('keeps valid sale items and totals them', () => {
    const itens = normalizarItensVendaAvulsa([
      { produto_id: 10, nome: 'Porta retrato', quantidade: 2, preco_unitario: 39.9 },
      { nome: 'Item avulso', quantidade: 1, preco: 15 },
      { nome: '', quantidade: 1, preco_unitario: 99 },
    ]);

    expect(itens).toEqual([
      { produto_id: 10, nome: 'Porta retrato', quantidade: 2, preco_unitario: 39.9, avulso: 0 },
      { produto_id: null, nome: 'Item avulso', quantidade: 1, preco_unitario: 15, avulso: 1 },
    ]);
  });

  it('builds a short readable description from sale items', () => {
    const desc = descricaoVendaAvulsa([
      { nome: 'Porta retrato', quantidade: 2 },
      { nome: 'Moldura preta', quantidade: 1 },
    ]);

    expect(desc).toBe('Venda avulsa: 2x Porta retrato, 1x Moldura preta');
  });
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm.cmd test -- caixaRules.test.js` from `backend/`.
Expected: fail because `backend/domain/caixaRules.js` does not exist.

- [ ] **Step 3: Implement rules**

```js
const { toNumber } = require("../utils/numbers");

function normalizarItensVendaAvulsa(itens) {
  if (!Array.isArray(itens)) return [];
  return itens
    .map((item) => {
      const nome = String(item?.nome || "").trim();
      if (!nome) return null;
      const quantidade = Math.max(1, toNumber(item?.quantidade || 1));
      const preco_unitario = Math.max(0, toNumber(item?.preco_unitario ?? item?.preco ?? 0));
      if (!(preco_unitario > 0)) return null;
      return {
        produto_id: item?.produto_id ? Number(item.produto_id) : null,
        nome,
        quantidade,
        preco_unitario,
        avulso: item?.produto_id ? 0 : 1,
      };
    })
    .filter(Boolean);
}

function totalItensVendaAvulsa(itens) {
  return normalizarItensVendaAvulsa(itens)
    .reduce((total, item) => total + item.quantidade * item.preco_unitario, 0);
}

function descricaoVendaAvulsa(itens) {
  const normalizados = normalizarItensVendaAvulsa(itens);
  if (normalizados.length === 0) return "";
  const partes = normalizados.slice(0, 3).map((item) => `${item.quantidade}x ${item.nome}`);
  const extra = normalizados.length > 3 ? ` +${normalizados.length - 3} item(ns)` : "";
  return `Venda avulsa: ${partes.join(", ")}${extra}`;
}

module.exports = {
  normalizarItensVendaAvulsa,
  totalItensVendaAvulsa,
  descricaoVendaAvulsa,
};
```

- [ ] **Step 4: Run test and verify GREEN**

Run: `npm.cmd test -- caixaRules.test.js` from `backend/`.
Expected: pass.

## Task 2: Persist Structured Standalone Sales

**Files:**
- Modify: `backend/database.js`
- Modify: `backend/routes/caixa.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Add failing contracts**

Add tests that assert:

```js
expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS lancamento_itens/);
expect(databaseSource).toMatch(/idx_lancamento_itens_lancamentoid/);
expect(caixaSource).toMatch(/normalizarItensVendaAvulsa/);
expect(caixaSource).toMatch(/origem = "vendaavulsa"/);
expect(caixaSource).toMatch(/INSERT INTO lancamento_itens/);
expect(caixaSource).toMatch(/itens_resumo/);
```

- [ ] **Step 2: Run test and verify RED**

Run: `npm.cmd test -- routeContracts.test.js` from `backend/`.
Expected: fail on missing sale-item contracts.

- [ ] **Step 3: Add schema**

Add to `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS lancamento_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  lancamentoid    INTEGER NOT NULL,
  produto_id      INTEGER DEFAULT NULL,
  nome            TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1,
  preco_unitario  REAL NOT NULL DEFAULT 0,
  subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  avulso          INTEGER DEFAULT 0,
  createdat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_lancamento_itens_lancamentoid ON lancamento_itens(lancamentoid);
```

Add the same `CREATE TABLE` and index to `migrations[]`.

- [ ] **Step 4: Extend caixa route**

In `POST /api/caixa`, destructure `itens`, normalize with `normalizarItensVendaAvulsa()`, and when `ordemid` is absent and there are valid items:

```js
origem = "vendaavulsa";
categoriaFinal = categoria || "Venda avulsa";
pagoFinal = 1;
descFinal = descricao || descricaoVendaAvulsa(itensNormalizados);
```

Insert the launch and `lancamento_itens` in a `transaction()`.

In `GET /api/caixa`, add:

```sql
(SELECT GROUP_CONCAT(li.nome || ' x' || li.quantidade, ', ')
 FROM lancamento_itens li
 WHERE li.lancamentoid=l.id) AS itens_resumo
```

- [ ] **Step 5: Run contracts and verify GREEN**

Run: `npm.cmd test -- routeContracts.test.js caixaRules.test.js` from `backend/`.
Expected: pass.

## Task 3: Add Atendimento Route and Navigation

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Add lazy route**

Add:

```js
const Atendimento = React.lazy(() => import('./pages/Atendimento'))
```

Set:

```js
const defaultRoute = user.role === 'oficina' ? '/oficina' : '/atendimento'
```

Add:

```jsx
<Route path="/atendimento" element={<PrivateRoute roles={['admin','caixa']}><Atendimento /></PrivateRoute>}/>
```

- [ ] **Step 2: Add sidebar item and keep Caixa**

Add an `atendimento` icon key and render:

```jsx
{navItem('/atendimento', 'Atendimento', 'atendimento')}
{navItem('/dashboard', 'Resumo', 'resumo')}
{navItem('/caixa', 'Caixa', 'caixa')}
```

Expected: `Caixa` remains in `Operacao`.

## Task 4: Build Atendimento Page

**Files:**
- Create: `frontend/src/pages/Atendimento.jsx`

- [ ] **Step 1: Implement page state and data loading**

Load customers, products, paginated orders/search results, and daily Caixa snapshot via existing APIs:

```js
await Promise.all([
  api.get('/clientes'),
  api.get('/produtos'),
  api.get('/ordens?page=1&limit=10'),
  api.get(`/caixa?data=${today()}`),
]);
```

- [ ] **Step 2: Implement approved compact mode switcher**

Use panel title `O que voce vai fazer agora?` and compact buttons for `Nova OS`, `Receber OS`, `Venda avulsa`. Full cards appear only on the home state.

- [ ] **Step 3: Implement Nova OS flow**

Submit a payload compatible with `POST /api/ordens`:

```js
{
  clienteid,
  clientenome,
  clientetelefone,
  clientecpf,
  servico,
  prioridade,
  prazoentrega,
  produtos,
  valortotal,
  valorentrada,
  pagamento,
  dataEntrada,
  observacoes
}
```

If the user clicks quick customer creation, call `POST /api/clientes` first and use the returned id.

- [ ] **Step 4: Implement Receber OS flow**

Call `POST /api/caixa` with:

```js
{
  data,
  tipo: 'Entrada',
  categoria: 'Pagamento OS',
  pagamento,
  valor,
  ordemid
}
```

If payment amount covers the selected open balance, show `ConfirmarEntregaModal`. On confirmation call `PATCH /api/ordens/:id/status` with `Entregue`.

- [ ] **Step 5: Implement Venda avulsa flow**

Call `POST /api/caixa` with:

```js
{
  data,
  tipo: 'Entrada',
  categoria: 'Venda avulsa',
  pagamento,
  valor: total,
  itens
}
```

## Task 5: Keep Caixa as Review and Closing Screen

**Files:**
- Modify: `frontend/src/pages/Caixa.jsx`

- [ ] **Step 1: Add origin filter**

Add `filterOrigem`, include options for `manual`, `entradaos`, `saldoos`, `vendaavulsa`, and filter rows by `l.origem`.

- [ ] **Step 2: Show item summaries**

When `l.itens_resumo` exists, render it below or alongside `descricao`, with a product-style marker.

- [ ] **Step 3: Clarify manual entry**

Change the button text from `Novo` to `Novo manual`, keeping existing manual form behavior.

## Task 6: Verification

**Files:**
- No source changes unless verification reveals a bug.

- [ ] **Step 1: Backend focused tests**

Run from `backend/`:

```powershell
npm.cmd test -- caixaRules.test.js routeContracts.test.js financeiroRules.test.js ordensRules.test.js
```

Expected: all pass.

- [ ] **Step 2: Backend full tests**

Run from `backend/`:

```powershell
npm.cmd test
```

Expected: all pass.

- [ ] **Step 3: Frontend build**

Run from `frontend/`:

```powershell
npm.cmd run build
```

Expected: Vite build exits 0.

- [ ] **Step 4: Local browser smoke**

Start backend and frontend dev server if not already running, open `/atendimento`, and verify:

- full-card home layout is visible;
- compact switcher stays visible in all three flows;
- `/caixa` still appears in sidebar;
- Caixa page loads and has `Novo manual`.

## Self-Review Notes

- The plan covers `/atendimento`, structured sale items, Caixa preservation, compact mode switcher, and delivery confirmation.
- Stock write-down, fiscal sale emission, barcode scanning, and multi-cashier closing are intentionally out of scope for this production slice.
