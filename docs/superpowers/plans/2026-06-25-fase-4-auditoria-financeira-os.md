# Fase 4 Auditoria Financeira de OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor uma auditoria financeira read-only de OS que compare saldos oficiais com estados operacionais e contas a receber gerenciais.

**Architecture:** A regra fica em um serviço puro e testável que recebe OS candidatas, linhas atuais de contas a receber e a função oficial `getResumoFinanceiroOS()`. A rota admin em `/api/financeiro/integridade-os` monta os dados do banco, chama o serviço e retorna um payload compacto para a tela `/financeiro`. O frontend mostra um painel operacional sem botões de correção automática.

**Tech Stack:** Node.js 22, Express 4, CommonJS, SQLite/better-sqlite3, Vitest 4.1, React 18, Vite 8.

---

### Task 1: Serviço Puro de Auditoria Financeira

**Files:**
- Create: `backend/services/financeiroIntegridadeService.js`
- Test: `backend/__tests__/financeiroIntegridadeService.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/financeiroIntegridadeService.test.js` with tests for delivered OS with saldo, overpayment, and contas a receber divergence:

```js
const { describe, expect, it } = require("vitest");
const { auditarIntegridadeFinanceiraOS } = require("../services/financeiroIntegridadeService");

describe("auditarIntegridadeFinanceiraOS", () => {
  const ordens = [
    { id: 1, numero: "OS-1", clientenome: "Ana", status: "Entregue" },
    { id: 2, numero: "OS-2", clientenome: "Bia", status: "Pronto" },
    { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção" },
  ];

  const resumos = new Map([
    [1, { ordem: { id: 1, numero: "OS-1", clientenome: "Ana", status: "Entregue", valortotal: 100 }, recebido: 75, saldo: 25 }],
    [2, { ordem: { id: 2, numero: "OS-2", clientenome: "Bia", status: "Pronto", valortotal: 80 }, recebido: 95, saldo: 0 }],
    [3, { ordem: { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção", valortotal: 120 }, recebido: 30, saldo: 90 }],
  ]);

  it("reports delivered orders that still have official saldo", () => {
    const resultado = auditarIntegridadeFinanceiraOS({
      ordens,
      receberGerencial: [{ id: 3, saldo: 90, recebido: 30 }],
      getResumoFinanceiroOS: (id) => resumos.get(id),
    });

    expect(resultado.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "entregue_com_saldo",
          severidade: "critico",
          ordemId: 1,
          saldoOficial: 25,
        }),
      ])
    );
  });

  it("reports overpayments without making official saldo negative", () => {
    const resultado = auditarIntegridadeFinanceiraOS({
      ordens,
      receberGerencial: [{ id: 3, saldo: 90, recebido: 30 }],
      getResumoFinanceiroOS: (id) => resumos.get(id),
    });

    expect(resultado.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "pagamento_excedente",
          severidade: "aviso",
          ordemId: 2,
          excedente: 15,
          saldoOficial: 0,
        }),
      ])
    );
  });

  it("reports open orders missing from managerial contas a receber", () => {
    const resultado = auditarIntegridadeFinanceiraOS({
      ordens,
      receberGerencial: [],
      getResumoFinanceiroOS: (id) => resumos.get(id),
    });

    expect(resultado.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "receber_divergente",
          severidade: "aviso",
          ordemId: 3,
          saldoOficial: 90,
          saldoGerencial: 0,
        }),
      ])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- financeiroIntegridadeService.test.js`

Expected: FAIL because `../services/financeiroIntegridadeService` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `backend/services/financeiroIntegridadeService.js`:

```js
function toMoney(value) {
  const number = Number(value || 0);
  return Math.round(number * 100) / 100;
}

function isOpenStatus(status) {
  return !["Entregue", "Cancelado"].includes(status);
}

function criarBaseItem(ordem, resumo) {
  return {
    ordemId: Number(ordem.id),
    numero: resumo.ordem?.numero || ordem.numero || null,
    clienteNome: resumo.ordem?.clientenome || ordem.clientenome || null,
    status: resumo.ordem?.status || ordem.status || null,
    valorTotal: toMoney(resumo.ordem?.valortotal),
    recebidoOficial: toMoney(resumo.recebido),
    saldoOficial: toMoney(resumo.saldo),
  };
}

function auditarIntegridadeFinanceiraOS({ ordens = [], receberGerencial = [], getResumoFinanceiroOS }) {
  if (typeof getResumoFinanceiroOS !== "function") {
    throw new TypeError("getResumoFinanceiroOS is required");
  }

  const receberPorId = new Map(receberGerencial.map((row) => [Number(row.id), row]));
  const itens = [];

  for (const ordem of ordens) {
    const resumo = getResumoFinanceiroOS(ordem.id);
    if (!resumo) continue;

    const base = criarBaseItem(ordem, resumo);

    if (base.status === "Entregue" && base.saldoOficial > 0.01) {
      itens.push({
        ...base,
        tipo: "entregue_com_saldo",
        severidade: "critico",
        mensagem: "OS entregue ainda possui saldo oficial em aberto.",
      });
    }

    const excedente = toMoney(base.recebidoOficial - base.valorTotal);
    if (excedente > 0.01) {
      itens.push({
        ...base,
        tipo: "pagamento_excedente",
        severidade: "aviso",
        excedente,
        mensagem: "Pagamentos registrados excedem o valor total da OS.",
      });
    }

    if (isOpenStatus(base.status)) {
      const gerencial = receberPorId.get(Number(ordem.id));
      const saldoGerencial = toMoney(gerencial?.saldo);
      const deveriaAparecer = base.saldoOficial > 0.009;
      const aparece = Boolean(gerencial);

      if ((deveriaAparecer && !aparece) || (!deveriaAparecer && aparece) || Math.abs(saldoGerencial - base.saldoOficial) > 0.01) {
        itens.push({
          ...base,
          tipo: "receber_divergente",
          severidade: "aviso",
          saldoGerencial,
          mensagem: "Saldo oficial da OS diverge das contas a receber gerenciais.",
        });
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    total: itens.length,
    criticos: itens.filter((item) => item.severidade === "critico").length,
    avisos: itens.filter((item) => item.severidade === "aviso").length,
    itens,
  };
}

module.exports = { auditarIntegridadeFinanceiraOS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm.cmd test -- financeiroIntegridadeService.test.js`

Expected: PASS for the new service tests.

- [ ] **Step 5: Commit**

Run:

```powershell
git add backend/services/financeiroIntegridadeService.js backend/__tests__/financeiroIntegridadeService.test.js
git commit -m "feat: add financial integrity audit service"
```

### Task 2: Endpoint Admin em Financeiro

**Files:**
- Modify: `backend/routes/financeiro.js`
- Modify: `backend/__tests__/routeContracts.test.js`
- Test: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write the failing route contract test**

In `backend/__tests__/routeContracts.test.js`, add `/integridade-os` to the list of admin-only finance routes:

```js
expect(routeRoles(router, "get", "/integridade-os")).toEqual(["admin"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: FAIL because `/integridade-os` is not registered.

- [ ] **Step 3: Add route using the service**

In `backend/routes/financeiro.js`, import:

```js
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
const { auditarIntegridadeFinanceiraOS } = require("../services/financeiroIntegridadeService");
```

Add before the existing report routes:

```js
router.get("/integridade-os", auth(["admin"]), (req, res, next) => {
  try {
    const ordens = getAll(
      "SELECT id, numero, clientenome, status FROM ordens WHERE deletedat IS NULL ORDER BY id DESC"
    );
    const receberGerencial = getContasReceberPayload();
    const auditoria = auditarIntegridadeFinanceiraOS({
      ordens,
      receberGerencial,
      getResumoFinanceiroOS,
    });
    res.json(auditoria);
  } catch (e) {
    next(e);
  }
});
```

- [ ] **Step 4: Run route contract test**

Run: `cd backend; npm.cmd test -- routeContracts.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add backend/routes/financeiro.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expose financial integrity audit endpoint"
```

### Task 3: Painel Compacto no Financeiro

**Files:**
- Modify: `frontend/src/pages/Financeiro.jsx`
- Test: `frontend/src/pages/__tests__/Financeiro.test.jsx`

- [ ] **Step 1: Write the failing frontend test**

Add a test that mocks `/financeiro/integridade-os`, renders `Financeiro`, and expects the panel title `Integridade das OS` plus a sample issue message.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npm.cmd test -- Financeiro.test.jsx`

Expected: FAIL because the page does not request or render the financial integrity panel.

- [ ] **Step 3: Add state, API call, and panel**

In `frontend/src/pages/Financeiro.jsx`, add `integridade` state, include `api.get("/financeiro/integridade-os", { skipGlobalErrorToast: true })` in `load()`, and render a compact panel above the tabs:

```jsx
function IntegridadeFinanceiraPanel({ integridade }) {
  const itens = integridade?.itens || [];
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Integridade das OS</h2>
          <p>{integridade?.total || 0} apontamento(s) financeiro(s)</p>
        </div>
        <StatusBadge tone={(integridade?.criticos || 0) > 0 ? "danger" : "success"}>
          {(integridade?.criticos || 0) > 0 ? `${integridade.criticos} crítico(s)` : "Sem críticos"}
        </StatusBadge>
      </div>
      {itens.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>OS</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Saldo oficial</th>
              </tr>
            </thead>
            <tbody>
              {itens.slice(0, 5).map((item) => (
                <tr key={`${item.tipo}-${item.ordemId}`}>
                  <td>{item.numero || item.ordemId}</td>
                  <td>{item.clienteNome || "-"}</td>
                  <td>{item.mensagem}</td>
                  <td>{money(item.saldoOficial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run frontend test and build**

Run:

```powershell
cd frontend
npm.cmd test -- Financeiro.test.jsx
npm.cmd run build
```

Expected: PASS and successful Vite build.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/pages/Financeiro.jsx frontend/src/pages/__tests__/Financeiro.test.jsx
git commit -m "feat: show financial integrity panel"
```

### Task 4: Full Verification

**Files:**
- No production changes.

- [ ] **Step 1: Run backend full suite**

Run: `cd backend; npm.cmd test`

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend tests and build**

Run:

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

Expected: all frontend tests pass and build succeeds.

- [ ] **Step 3: Run audits**

Run:

```powershell
npm.cmd audit --omit=dev
cd backend; npm.cmd audit --omit=dev
cd ../frontend; npm.cmd audit --omit=dev
cd ../whatsapp-service; npm.cmd audit --omit=dev
```

Expected: `0 vulnerabilities` in every package.

- [ ] **Step 4: Commit verification docs if changed**

Only commit if a file changed during verification.

```powershell
git status --short
```

Expected: clean worktree after implementation commits.

### Self-Review

- Spec coverage: endpoint admin, official saldo source, read-only behavior, critical delivered-with-balance issue, overpayment warning, receivable divergence warning, compact Financeiro panel, and verification are covered.
- Placeholder scan: no TBD/TODO/fill-later placeholders remain.
- Type consistency: service and frontend use `tipo`, `severidade`, `ordemId`, `numero`, `clienteNome`, `valorTotal`, `recebidoOficial`, `saldoOficial`, `saldoGerencial`, and `excedente` consistently.
