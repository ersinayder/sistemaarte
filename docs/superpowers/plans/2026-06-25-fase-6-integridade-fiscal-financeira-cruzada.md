# Fase 6 Integridade Fiscal-Financeira Cruzada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor e renderizar uma auditoria read-only que compara totais fiscais locais de NF-e com o total atual da OS.

**Architecture:** Criar um servico puro `nfeIntegridadeFinanceiraService` que recebe notas locais e retorna apontamentos sanitizados. A rota `/api/nfe/integridade-financeira` lista OS com NF-e ativa, delega ao servico e retorna apenas resumo publico. O frontend `NotasFiscais.jsx` carrega a auditoria auxiliar com `skipGlobalErrorToast` e mostra uma faixa compacta sem acoes corretivas.

**Tech Stack:** Node.js 22, Express 4, CommonJS, Vitest 4.1, React 18, Vite 8.

---

### Task 1: Servico Puro de Auditoria Cruzada

**Files:**
- Create: `backend/services/nfeIntegridadeFinanceiraService.js`
- Create: `backend/__tests__/nfeIntegridadeFinanceiraService.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/nfeIntegridadeFinanceiraService.test.js`:

```js
import { describe, expect, it } from "vitest";
import { auditarIntegridadeFiscalFinanceiraNFe } from "../services/nfeIntegridadeFinanceiraService.js";

describe("auditarIntegridadeFiscalFinanceiraNFe", () => {
  it("reports authorized NFe whose XML total differs from current OS total", () => {
    const result = auditarIntegridadeFiscalFinanceiraNFe([
      {
        id: 10,
        numero: "OS-10",
        clientenome: "Ana",
        status: "Pronto",
        valortotal: 120,
        nfe_status: "autorizado",
        nfe_chave: "35111111111111111111111111111111111111111111",
        nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
      },
    ]);

    expect(result.itens).toEqual([
      expect.objectContaining({
        tipo: "nfe_total_divergente",
        severidade: "critico",
        ordemId: 10,
        valorOS: 120,
        valorNFe: 100,
        diferenca: 20,
      }),
    ]);
    expect(result.meta).toEqual({ total: 1, criticos: 1, avisos: 0 });
  });

  it("reports missing authorized XML and cancelled NFe on delivered OS", () => {
    const result = auditarIntegridadeFiscalFinanceiraNFe([
      { id: 11, numero: "OS-11", clientenome: "Bia", status: "Pronto", valortotal: 50, nfe_status: "autorizado", nfe_chave: "352", nfe_xml: null },
      { id: 12, numero: "OS-12", clientenome: "Caio", status: "Entregue", valortotal: 80, nfe_status: "cancelado", nfe_chave: "353", nfe_xml: null },
    ]);

    expect(result.itens).toEqual([
      expect.objectContaining({ tipo: "nfe_xml_ausente", severidade: "critico", ordemId: 11 }),
      expect.objectContaining({ tipo: "nfe_cancelada_os_entregue", severidade: "aviso", ordemId: 12 }),
    ]);
    expect(result.meta).toEqual({ total: 2, criticos: 1, avisos: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- nfeIntegridadeFinanceiraService.test.js`

Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Implement service**

Create `backend/services/nfeIntegridadeFinanceiraService.js` using `extrairXmlFiscal` from `nfeEmissaoService`, a local `extrairVNF(xml)` helper matching `<vNF>`, and sanitized output fields only.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm.cmd test -- nfeIntegridadeFinanceiraService.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/nfeIntegridadeFinanceiraService.js backend/__tests__/nfeIntegridadeFinanceiraService.test.js
git commit -m "feat: add fiscal financial integrity service"
```

### Task 2: Endpoint Read-only em NF-e

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route/source contract**

In `routeContracts.test.js`, assert:

```js
expect(routeRoles(nfeRouter, 'get', '/integridade-financeira')).toEqual(['admin', 'caixa']);
expect(source).toMatch(/auditarIntegridadeFiscalFinanceiraNFe/);
expect(source.indexOf("'/integridade-financeira'")).toBeLessThan(source.indexOf("'/:chave/eventos'"));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Add route**

Import `auditarIntegridadeFiscalFinanceiraNFe` and add:

```js
router.get('/integridade-financeira', auth(['admin', 'caixa']), (req, res) => {
  try {
    const notas = getDB().prepare(`
      SELECT id, numero, clientenome, status, valortotal, nfe_status, nfe_chave, nfe_xml
      FROM ordens
      WHERE deletedat IS NULL AND nfe_status IS NOT NULL AND nfe_deletedat IS NULL
      ORDER BY nfe_emitida_em DESC, id DESC
    `).all();
    res.json(auditarIntegridadeFiscalFinanceiraNFe(notas));
  } catch (e) {
    console.error('[NF-e] GET /integridade-financeira:', e.message);
    res.status(500).json({ erro: 'Erro ao auditar integridade fiscal-financeira' });
  }
});
```

- [ ] **Step 4: Run route test**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expose fiscal financial integrity endpoint"
```

### Task 3: Painel Compacto na Tela NF-e

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing frontend source contract**

In `routeContracts.test.js`, add an assertion that `NotasFiscais.jsx` calls `/nfe/integridade-financeira` with `skipGlobalErrorToast: true`, defines `IntegridadeFiscalFinanceiraPanel`, renders it conditionally, and does not render corrective action labels.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: FAIL because the frontend code has no panel.

- [ ] **Step 3: Implement frontend panel**

In `NotasFiscais.jsx`, add state `integridadeFiscalFinanceira`, loader `carregarIntegridadeFiscalFinanceira`, call it from `carregar()` when not in lixeira, and render `<IntegridadeFiscalFinanceiraPanel itens={integridadeFiscalFinanceira} onRefresh={carregarIntegridadeFiscalFinanceira} />` below fiscal pending panel.

- [ ] **Step 4: Run focused tests and build**

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
cd ../frontend
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/__tests__/routeContracts.test.js frontend/src/pages/NotasFiscais.jsx
git commit -m "feat: show fiscal financial integrity panel"
```

### Task 4: Verification

**Files:**
- No production changes.

- [ ] **Step 1: Backend full suite**

Run: `cd backend; npm.cmd test`

Expected: all backend tests pass.

- [ ] **Step 2: Frontend full suite and build, sequentially**

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

Expected: all frontend tests and build pass.

- [ ] **Step 3: WhatsApp tests**

Run: `cd whatsapp-service; npm.cmd test`

Expected: all tests pass.

- [ ] **Step 4: Audits**

```powershell
npm.cmd audit --omit=dev
cd backend; npm.cmd audit --omit=dev
cd ../frontend; npm.cmd audit --omit=dev
cd ../whatsapp-service; npm.cmd audit --omit=dev
```

Expected: `0 vulnerabilities`.

### Self-Review

- Spec coverage: service, route, panel, read-only constraints, no SEFAZ calls, no sensitive response fields and verification are covered.
- Placeholder scan: no TBD/TODO/fill-later placeholders remain.
- Type consistency: `itens`, `meta`, `tipo`, `severidade`, `valorOS`, `valorNFe`, `diferenca` are used consistently.
