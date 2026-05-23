# PDFs, Impressoes e Relatorios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build backend-authoritative printable documents for OS, proposals, caixa closings, finance reports, DRE, accounts, production reports, and polished logo-bearing print layouts.

**Architecture:** Add a small backend print layer with shared HTML/layout helpers, a canonical payment domain rule, and document-specific renderers. Existing JSON endpoints remain operational; new print endpoints reuse the same source queries/helpers so the frontend only opens backend-generated print views.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, Vitest 4.1, React 18 + Vite 8.

---

## File Structure

- Create `backend/domain/pagamentosRules.js`: canonical payment keys, labels, grouping helper.
- Create `backend/__tests__/pagamentosRules.test.js`: payment normalization and grouping coverage.
- Create `backend/utils/print/base.js`: shared escaping, formatting, logo data URI, A4 CSS, document shell, KPI/table helpers.
- Create `backend/__tests__/printBase.test.js`: shared renderer safety and logo/header coverage.
- Create `backend/utils/print/ordemServico.js`: OS printable renderer.
- Modify `backend/routes/pdf.js`: route becomes data collector + calls `renderOrdemServicoHtml`.
- Create/modify `backend/__tests__/ordemServicoPrint.test.js`: OS print renderer coverage.
- Modify `backend/utils/propostaPdf.js`: use shared print layout and logo conventions.
- Modify `backend/__tests__/propostaPdf.test.js`: assert logo/header, commercial totals, escaped data.
- Create `backend/utils/print/caixaFechamento.js`: daily caixa closing data builder and renderer.
- Modify `backend/routes/caixa.js`: add `GET /fechamento?data=YYYY-MM-DD`.
- Create `backend/__tests__/caixaFechamentoPrint.test.js`: verifies backend totals and card payment consolidation.
- Create `backend/utils/print/financeiroReports.js`: finance summary, DRE, accounts payable, accounts receivable renderers.
- Modify `backend/routes/financeiro.js`: add print endpoints.
- Create `backend/__tests__/financeiroPrint.test.js`: renderers and route contracts.
- Create `backend/utils/print/producaoReport.js`: production report renderer.
- Modify `backend/routes/relatorios.js`: add `GET /producao/pdf?mes=YYYY-MM`.
- Create `backend/__tests__/relatoriosPrint.test.js`: production and monthly summary print coverage.
- Modify `backend/utils/danfe.js`: keep fiscal structure, align logo/header polish.
- Modify `frontend/src/pages/Caixa.jsx`: remove client-side closing HTML and open backend endpoint.
- Modify `frontend/src/pages/Financeiro.jsx`: add print buttons for active report endpoints.
- Optionally modify `frontend/src/pages/Dashboard.jsx`: add link to monthly report only if it fits existing layout.
- Modify `backend/__tests__/routeContracts.test.js`: new route role contracts.

---

## Task 1: Canonical Payment Rules

**Files:**
- Create: `backend/domain/pagamentosRules.js`
- Create: `backend/__tests__/pagamentosRules.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest';

const rules = await import('../domain/pagamentosRules.js');

describe('pagamentosRules', () => {
  it('normalizes card aliases into one canonical credit key', () => {
    expect(rules.normalizarPagamento('Cartao Credito')).toBe('Credito');
    expect(rules.normalizarPagamento('Cartão de Crédito')).toBe('Credito');
    expect(rules.normalizarPagamento('credito')).toBe('Credito');
  });

  it('normalizes debit, transfer, link and unknown payments', () => {
    expect(rules.normalizarPagamento('Cartão de Débito')).toBe('Debito');
    expect(rules.normalizarPagamento('Transferência')).toBe('Transferencia');
    expect(rules.normalizarPagamento('Link de Cobrança')).toBe('Link');
    expect(rules.normalizarPagamento('Vale estranho')).toBe('Outros');
  });

  it('groups rows by canonical payment and keeps display labels', () => {
    const grupos = rules.agruparPorPagamento([
      { pagamento: 'Cartão Crédito', valor: 10 },
      { pagamento: 'Cartao de Credito', valor: 15 },
      { pagamento: 'Pix', valor: 7 },
    ]);
    expect(grupos).toEqual([
      { pagamento: 'Credito', label: 'Cartao de Credito', total: 25, itens: expect.any(Array) },
      { pagamento: 'Pix', label: 'Pix', total: 7, itens: expect.any(Array) },
    ]);
  });
});
```

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- pagamentosRules.test.js`
Expected: FAIL because `backend/domain/pagamentosRules.js` does not exist.

- [ ] **Step 3: Implement payment rules**

Create the module with `normalizarPagamento`, `labelPagamento`, `agruparPorPagamento`, and `PAGAMENTOS_CANONICOS`. Normalize by trimming, lowercasing, removing accents and non-alphanumeric separators.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- pagamentosRules.test.js`
Expected: PASS.

---

## Task 2: Shared Print Base

**Files:**
- Create: `backend/utils/print/base.js`
- Create: `backend/__tests__/printBase.test.js`

- [ ] **Step 1: Write failing tests**

Test that `renderPrintDocument` escapes title/body data, includes a no-print button, includes the logo image when present, defines A4 print CSS, and hides actions in `@media print`.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- printBase.test.js`
Expected: FAIL because `backend/utils/print/base.js` does not exist.

- [ ] **Step 3: Implement base helpers**

Implement:

```js
module.exports = {
  esc,
  fmtMoney,
  fmtDate,
  fmtDateTime,
  logoDataUri,
  renderPrintDocument,
  renderKpis,
  renderTable,
};
```

Use ASCII-safe HTML entities, `toLocaleString('pt-BR')`, a cached data URI lookup for `frontend/dist` and `frontend/public` logo files, and a restrained commercial A4 CSS palette.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- printBase.test.js`
Expected: PASS.

---

## Task 3: Ordem de Servico Print Renderer

**Files:**
- Create: `backend/utils/print/ordemServico.js`
- Modify: `backend/routes/pdf.js`
- Create: `backend/__tests__/ordemServicoPrint.test.js`

- [ ] **Step 1: Write failing renderer tests**

Assert that an OS document includes logo/header, OS number, client, phone, items, prazo, financial values from the supplied summary, observations, and signature blocks.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- ordemServicoPrint.test.js`
Expected: FAIL because the renderer does not exist.

- [ ] **Step 3: Implement renderer**

Render with `renderPrintDocument`. Keep history optional and off by default for print compactness. Include `itens` table from `ordem_itens`.

- [ ] **Step 4: Update route**

In `backend/routes/pdf.js`, collect:

- OS row
- `ordem_itens`
- `statuslog` for non-print details if kept
- `getResumoFinanceiroOS(req.params.id)`

Then send `renderOrdemServicoHtml({ ordem: os, itens, logs, resumo })`.

- [ ] **Step 5: Verify green**

Run: `npm.cmd test -- ordemServicoPrint.test.js propostaPdf.test.js`
Expected: PASS.

---

## Task 4: Proposal Print Polish

**Files:**
- Modify: `backend/utils/propostaPdf.js`
- Modify: `backend/__tests__/propostaPdf.test.js`

- [ ] **Step 1: Add failing expectations**

Extend existing proposal tests to require a logo/header, commercial condition text, escaped item data, and a print action hidden from print media.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- propostaPdf.test.js`
Expected: FAIL on the new shared layout expectations.

- [ ] **Step 3: Refactor proposal renderer**

Use `backend/utils/print/base.js`. Preserve public function name `renderPropostaHtml`.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- propostaPdf.test.js printBase.test.js`
Expected: PASS.

---

## Task 5: Backend Caixa Closing

**Files:**
- Create: `backend/utils/print/caixaFechamento.js`
- Modify: `backend/routes/caixa.js`
- Create: `backend/__tests__/caixaFechamentoPrint.test.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing tests**

Use rows with `Cartão Crédito` and `Cartao de Credito`; assert one `Cartao de Credito` group with combined total. Assert entries, outputs, balance, OS number, sale item summary, logo and signature area render.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- caixaFechamentoPrint.test.js`
Expected: FAIL because renderer/endpoint do not exist.

- [ ] **Step 3: Implement data builder and renderer**

Export `montarFechamentoCaixa({ data, lancamentos })` and `renderFechamentoCaixaHtml({ data, fechamento, usuario })`. Use `agruparPorPagamento`.

- [ ] **Step 4: Add route**

Add `GET /fechamento` before `/:id` routes in `backend/routes/caixa.js`. Query active rows exactly like `GET /api/caixa`, filtered by `data`, and return HTML.

- [ ] **Step 5: Add route contract**

Assert `routeRoles(caixaRouter, 'get', '/fechamento')` equals `['admin', 'caixa']`.

- [ ] **Step 6: Verify green**

Run: `npm.cmd test -- caixaFechamentoPrint.test.js routeContracts.test.js`
Expected: PASS.

---

## Task 6: Finance Print Endpoints

**Files:**
- Create: `backend/utils/print/financeiroReports.js`
- Modify: `backend/routes/financeiro.js`
- Create: `backend/__tests__/financeiroPrint.test.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing tests**

Assert renderers include logo and core totals for:

- resumo mensal
- DRE
- contas a pagar
- contas a receber

Assert route contracts:

- `/resumo/pdf` admin
- `/dre/pdf` admin
- `/contas-pagar/pdf` admin
- `/contas-receber/pdf` admin

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- financeiroPrint.test.js`
Expected: FAIL because module/routes do not exist.

- [ ] **Step 3: Extract reusable data helpers**

Inside `backend/routes/financeiro.js`, avoid changing JSON behavior. Create small internal functions for existing query payloads where needed, then use them from both JSON and print endpoints.

- [ ] **Step 4: Implement renderers and routes**

Each route sends `Content-Type: text/html; charset=utf-8` and `Content-Disposition: inline; filename="..."`.

- [ ] **Step 5: Verify green**

Run: `npm.cmd test -- financeiroPrint.test.js routeContracts.test.js`
Expected: PASS.

---

## Task 7: Production Report Print Endpoint

**Files:**
- Create: `backend/utils/print/producaoReport.js`
- Modify: `backend/routes/relatorios.js`
- Create: `backend/__tests__/relatoriosPrint.test.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing tests**

Assert production renderer includes logo, month, operator summary, phase summary and phase rows with duration labels.

- [ ] **Step 2: Verify red**

Run: `npm.cmd test -- relatoriosPrint.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement renderer and `/producao/pdf` route**

Reuse the same production SQL shape as `/producao`; route role must stay `admin`.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- relatoriosPrint.test.js routeContracts.test.js`
Expected: PASS.

---

## Task 8: DANFE Logo/Polish Guard

**Files:**
- Modify: `backend/utils/danfe.js`
- Modify: `backend/__tests__/danfe.test.js`

- [ ] **Step 1: Add failing expectations**

Assert generated DANFE includes the logo image or fallback emitente name, keeps `DANFE`, key formatting and product rows.

- [ ] **Step 2: Verify red only if expectation is new**

Run: `npm.cmd test -- danfe.test.js`
Expected: PASS if current behavior already satisfies; otherwise FAIL on missing polish expectation.

- [ ] **Step 3: Apply safe polish only**

Preserve fiscal table structure. Adjust logo sizing/header spacing only.

- [ ] **Step 4: Verify green**

Run: `npm.cmd test -- danfe.test.js`
Expected: PASS.

---

## Task 9: Frontend Print Buttons

**Files:**
- Modify: `frontend/src/pages/Caixa.jsx`
- Modify: `frontend/src/pages/Financeiro.jsx`
- Optionally modify: `frontend/src/pages/Dashboard.jsx`

- [ ] **Step 1: Remove frontend closing generator**

Delete `gerarPDFFechamento`. Add:

```js
function abrirFechamentoCaixa(date) {
  window.open(`/api/caixa/fechamento?data=${encodeURIComponent(date)}`, '_blank', 'noopener,noreferrer');
}
```

- [ ] **Step 2: Wire Caixa button**

Change the PDF button to call `abrirFechamentoCaixa(selectedDay)`.

- [ ] **Step 3: Add Financeiro print action**

Add a compact `Imprimir` button beside month/update. It opens:

- tab `resumo`: `/api/financeiro/resumo/pdf?mes=${mes}`
- tab `pagar`: `/api/financeiro/contas-pagar/pdf?mes=${mes}`
- tab `receber`: `/api/financeiro/contas-receber/pdf`
- tab `dre`: `/api/financeiro/dre/pdf?mes=${mes}`

- [ ] **Step 4: Verify frontend build**

Run: `npm.cmd run build`
Expected: Vite build exits 0.

---

## Task 10: Full Verification

**Files:**
- No new files unless tests reveal gaps.

- [ ] **Step 1: Run backend tests**

Run: `npm.cmd test`
Expected: all backend tests pass.

- [ ] **Step 2: Run frontend build**

Run: `npm.cmd run build`
Expected: build exits 0.

- [ ] **Step 3: Visual/manual smoke**

Start backend/frontend if needed and open at least:

- `/api/ordens/1/pdf` if local data exists
- `/api/caixa/fechamento?data=YYYY-MM-DD`
- `/api/financeiro/resumo/pdf?mes=YYYY-MM`

Confirm logo appears, layout is A4, actions hide in print CSS, and payment groups are consolidated.

- [ ] **Step 4: Review diff**

Run: `git diff --stat` and inspect changed files for accidental unrelated edits.

---

## Self-Review

- Spec coverage: all requested document families are covered by Tasks 3-8; frontend authority removal is Task 9; logo requirement is Tasks 2-8; payment canonicalization is Tasks 1 and 5.
- Placeholder scan: no placeholder steps are intentionally left.
- Type consistency: canonical payment API names are `normalizarPagamento`, `labelPagamento`, `agruparPorPagamento`, and `PAGAMENTOS_CANONICOS` across all tasks.
