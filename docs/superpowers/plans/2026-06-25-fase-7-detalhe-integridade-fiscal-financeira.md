# Fase 7: Detalhe da Integridade Fiscal-Financeira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor e renderizar detalhe read-only de um apontamento de integridade fiscal-financeira de NF-e.

**Architecture:** Estender o servico puro `backend/services/nfeIntegridadeFinanceiraService.js` com uma funcao de detalhe sanitizado. A rota `/api/nfe/integridade-financeira/:ordemId` busca uma OS fiscal local, delega ao servico e retorna somente resumo publico. O frontend `NotasFiscais.jsx` abre um modal de auditoria a partir da faixa criada na fase 6, sem acoes corretivas.

**Tech Stack:** Node.js 22, Express 4, CommonJS, SQLite/better-sqlite3, React 18, Vite, Vitest.

---

## File Structure

- Modify: `backend/services/nfeIntegridadeFinanceiraService.js`
  - Add `montarDetalheIntegridadeFiscalFinanceiraNFe(nota)`.
  - Reuse `extrairXmlFiscal`, `extrairVNF` and the same audit rules from the list endpoint.
- Modify: `backend/__tests__/nfeIntegridadeFinanceiraService.test.js`
  - Add detail tests for divergent authorized NF-e and missing XML.
- Modify: `backend/routes/nfe.js`
  - Add `GET /integridade-financeira/:ordemId` before `GET /integridade-financeira`.
- Modify: `backend/__tests__/routeContracts.test.js`
  - Add route role and source-contract assertions.
- Modify: `frontend/src/pages/NotasFiscais.jsx`
  - Add `ModalAuditoriaIntegridadeFiscalFinanceira`.
  - Add `onAudit` to `IntegridadeFiscalFinanceiraPanel`.
  - Add state and conditional modal render.

---

### Task 1: Service Detail Payload

**Files:**
- Modify: `backend/services/nfeIntegridadeFinanceiraService.js`
- Test: `backend/__tests__/nfeIntegridadeFinanceiraService.test.js`

- [ ] **Step 1: Write the failing service tests**

Append to `backend/__tests__/nfeIntegridadeFinanceiraService.test.js`:

```js
// Extend the existing top-level import:
// import {
//   auditarIntegridadeFiscalFinanceiraNFe,
//   montarDetalheIntegridadeFiscalFinanceiraNFe,
// } from "../services/nfeIntegridadeFinanceiraService.js";

it("builds sanitized detail for divergent authorized NFe", () => {
  const detalhe = montarDetalheIntegridadeFiscalFinanceiraNFe({
    id: 10,
    numero: "OS-10",
    clientenome: "Ana",
    status: "Pronto",
    valortotal: 120,
    nfe_status: "autorizado",
    nfe_chave: "35111111111111111111111111111111111111111111",
    nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
  });

  expect(detalhe).toEqual({
    ordem: {
      id: 10,
      numero: "OS-10",
      clienteNome: "Ana",
      status: "Pronto",
      valorTotal: 120,
    },
    fiscal: {
      status: "autorizado",
      chave: "35111111111111111111111111111111111111111111",
      xmlLocal: "presente",
      valorNFe: 100,
    },
    apontamentos: [
      expect.objectContaining({
        tipo: "nfe_total_divergente",
        severidade: "critico",
        valorOS: 120,
        valorNFe: 100,
        diferenca: 20,
      }),
    ],
    orientacao: "Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e.",
  });
  expect(JSON.stringify(detalhe)).not.toMatch(/nfeProc|infNFe|vNF|nfe_xml|payload|cpf|phone/i);
});

it("builds detail for missing authorized XML without leaking raw XML fields", () => {
  const detalhe = montarDetalheIntegridadeFiscalFinanceiraNFe({
    id: 11,
    numero: "OS-11",
    clientenome: "Bia",
    status: "Aguardando",
    valortotal: 50,
    nfe_status: "autorizado",
    nfe_chave: "352",
    nfe_xml: null,
  });

  expect(detalhe.fiscal).toEqual({
    status: "autorizado",
    chave: "352",
    xmlLocal: "ausente",
  });
  expect(detalhe.apontamentos).toEqual([
    expect.objectContaining({ tipo: "nfe_xml_ausente", severidade: "critico" }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd backend
npm.cmd test -- nfeIntegridadeFinanceiraService.test.js
```

Expected: FAIL because `montarDetalheIntegridadeFiscalFinanceiraNFe` is not exported.

- [ ] **Step 3: Implement minimal service function**

In `backend/services/nfeIntegridadeFinanceiraService.js`, add:

```js
const ORIENTACAO_DETALHE = "Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e.";

function montarDetalheIntegridadeFiscalFinanceiraNFe(nota) {
  const base = baseNota(nota);
  const xml = extrairXmlFiscal(nota?.nfe_xml);
  const valorNFe = xml ? extrairVNF(xml) : null;
  const fiscal = {
    status: base.nfeStatus,
    chave: base.nfeChave,
    xmlLocal: xml ? "presente" : "ausente",
  };

  if (valorNFe !== null) {
    fiscal.valorNFe = valorNFe;
  }

  return {
    ordem: {
      id: base.ordemId,
      numero: base.numero,
      clienteNome: base.clienteNome,
      status: base.statusOS,
      valorTotal: base.valorOS,
    },
    fiscal,
    apontamentos: auditarNota(nota).map(({ ordemId, numero, clienteNome, statusOS, nfeStatus, nfeChave, ...item }) => item),
    orientacao: ORIENTACAO_DETALHE,
  };
}
```

Export it:

```js
module.exports = {
  auditarIntegridadeFiscalFinanceiraNFe,
  montarDetalheIntegridadeFiscalFinanceiraNFe,
  extrairVNF,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd backend
npm.cmd test -- nfeIntegridadeFinanceiraService.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/nfeIntegridadeFinanceiraService.js backend/__tests__/nfeIntegridadeFinanceiraService.test.js
git commit -m "feat: add fiscal financial integrity detail service"
```

---

### Task 2: Detail Route

**Files:**
- Modify: `backend/routes/nfe.js`
- Test: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route contract**

In `backend/__tests__/routeContracts.test.js`, add to fiscal role assertions:

```js
expect(routeRoles(nfeRouter, 'get', '/integridade-financeira/:ordemId')).toEqual(['admin', 'caixa']);
```

Add a source-contract test near the existing fiscal-financial integrity route test:

```js
it('exposes fiscal-financial integrity detail without SEFAZ calls', async () => {
  const nfeRouter = await loadRouter('../routes/nfe.js');
  const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("router.get('/integridade-financeira/:ordemId'");
  const listRouteStart = source.indexOf("router.get('/integridade-financeira'", routeStart + 1);
  const routeSource = source.slice(routeStart, listRouteStart);

  expect(routeRoles(nfeRouter, 'get', '/integridade-financeira/:ordemId')).toEqual(['admin', 'caixa']);
  expect(source).toMatch(/montarDetalheIntegridadeFiscalFinanceiraNFe/);
  expect(routeStart).toBeGreaterThan(-1);
  expect(routeStart).toBeLessThan(listRouteStart);
  expect(routeSource).toMatch(/Number\(req\.params\.ordemId\)/);
  expect(routeSource).toMatch(/status\(400\)/);
  expect(routeSource).toMatch(/status\(404\)/);
  expect(routeSource).not.toMatch(/getNFEWizard|callSEFAZ|NFE_|service\.executar|wizard\./);
  expect(routeSource).not.toMatch(/res\.json\([^)]*nfe_xml|xml:/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because the route and import do not exist.

- [ ] **Step 3: Implement route**

In `backend/routes/nfe.js`, extend the import:

```js
const {
  auditarIntegridadeFiscalFinanceiraNFe,
  montarDetalheIntegridadeFiscalFinanceiraNFe,
} = require('../services/nfeIntegridadeFinanceiraService');
```

Add before the list route:

```js
router.get('/integridade-financeira/:ordemId', auth(['admin', 'caixa']), (req, res) => {
  const ordemId = Number(req.params.ordemId);
  if (!Number.isInteger(ordemId) || ordemId <= 0) {
    return res.status(400).json({ erro: 'OS invalida.' });
  }

  try {
    const nota = getDB().prepare(`
      SELECT id, numero, clientenome, status, valortotal, nfe_status, nfe_chave, nfe_xml
      FROM ordens
      WHERE id = ? AND deletedat IS NULL AND nfe_status IS NOT NULL AND nfe_deletedat IS NULL
    `).get(ordemId);
    if (!nota) {
      return res.status(404).json({ erro: 'NF-e da OS nao encontrada.' });
    }
    res.json(montarDetalheIntegridadeFiscalFinanceiraNFe(nota));
  } catch (e) {
    console.error('[NF-e] GET /integridade-financeira/:ordemId:', e.message);
    res.status(500).json({ erro: 'Erro ao auditar detalhe fiscal-financeiro' });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "feat: expose fiscal financial integrity detail endpoint"
```

---

### Task 3: Frontend Modal

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Test: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing frontend source contract**

In `backend/__tests__/routeContracts.test.js`, add a test after the existing fiscal-financial panel test:

```js
it('opens read-only fiscal-financial integrity detail from the NF-e page', () => {
  const source = fs.readFileSync(new URL('../../frontend/src/pages/NotasFiscais.jsx', import.meta.url), 'utf8');
  const modalStart = source.indexOf('function ModalAuditoriaIntegridadeFiscalFinanceira');
  const nextFunction = source.indexOf('function ModalAuditoriaPendenciaFiscal', modalStart);
  const modalSource = source.slice(modalStart, nextFunction);

  expect(source).toMatch(/function ModalAuditoriaIntegridadeFiscalFinanceira/);
  expect(source).toMatch(/api\.get\(`\/nfe\/integridade-financeira\/\$\{apontamento\.ordemId\}`,\s*\{\s*skipGlobalErrorToast:\s*true\s*\}\)/);
  expect(source).toMatch(/onAudit=\{setAuditoriaIntegridadeFiscalFinanceira\}/);
  expect(source).toMatch(/<IntegridadeFiscalFinanceiraPanel itens=\{integridadeFiscalFinanceira\} onRefresh=\{carregarIntegridadeFiscalFinanceira\} onAudit=\{setAuditoriaIntegridadeFiscalFinanceira\}/);
  expect(source).toMatch(/\{auditoriaIntegridadeFiscalFinanceira && <ModalAuditoriaIntegridadeFiscalFinanceira apontamento=\{auditoriaIntegridadeFiscalFinanceira\}/);
  expect(modalSource).not.toMatch(/Reemitir|Cancelar|Corrigir|Consultar SEFAZ|Editar OS|Emitir CC-e/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because the modal and `onAudit` wiring do not exist.

- [ ] **Step 3: Implement frontend modal and wiring**

In `frontend/src/pages/NotasFiscais.jsx`:

1. Change the panel signature:

```jsx
function IntegridadeFiscalFinanceiraPanel({ itens, onRefresh, onAudit }) {
```

2. Add an `Auditar` button inside each card:

```jsx
<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
  <button className="btn btn-ghost btn-sm" onClick={() => onAudit(item)} title="Auditar integridade fiscal-financeira">
    Auditar
  </button>
</div>
```

3. Add a modal component before `ModalAuditoriaPendenciaFiscal`:

```jsx
function ModalAuditoriaIntegridadeFiscalFinanceira({ apontamento, onClose }) {
  const [detalhe, setDetalhe] = useState(null)
  const [loading, setLoading] = useState(true)

  const carregarAuditoria = useCallback(async () => {
    if (!apontamento?.ordemId) return
    setLoading(true)
    try {
      const r = await api.get(`/nfe/integridade-financeira/${apontamento.ordemId}`, { skipGlobalErrorToast: true })
      setDetalhe(r.data)
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Erro ao carregar auditoria fiscal-financeira')
      setDetalhe(null)
    } finally {
      setLoading(false)
    }
  }, [apontamento?.ordemId])

  useEffect(() => { carregarAuditoria() }, [carregarAuditoria])

  const ordem = detalhe?.ordem || {}
  const fiscal = detalhe?.fiscal || {}
  const apontamentos = detalhe?.apontamentos || []

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'oklch(from var(--color-text) l c h / 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 720,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '86vh', overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800 }}>Auditoria fiscal-financeira</h2>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              {ordem.numero || apontamento?.numero || `OS ${apontamento?.ordemId}`}
            </p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: 'var(--space-4) var(--space-5)', overflow: 'auto', display: 'grid', gap: 'var(--space-4)' }}>
          {loading ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto var(--space-3)' }} />Carregando auditoria...
            </div>
          ) : (
            <>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', background: 'var(--color-surface-offset)', display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800 }}>{ordem.clienteNome || 'Cliente nao informado'}</div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  <span>Status OS: {ordem.status || 'nao informado'}</span>
                  <span>Status NF-e: {fiscal.status || 'nao informado'}</span>
                  <span>XML local: {fiscal.xmlLocal || 'nao informado'}</span>
                </div>
                <div style={{ overflowWrap: 'anywhere', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  Chave: {fiscal.chave || 'nao informada'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-2)' }}>
                <div className="card" style={{ padding: 'var(--space-3)' }}><div className="text-muted">Total OS</div><strong>{fmt(ordem.valorTotal)}</strong></div>
                <div className="card" style={{ padding: 'var(--space-3)' }}><div className="text-muted">Total NF-e</div><strong>{fiscal.valorNFe === undefined ? 'Indisponivel' : fmt(fiscal.valorNFe)}</strong></div>
                <div className="card" style={{ padding: 'var(--space-3)' }}><div className="text-muted">Apontamentos</div><strong>{apontamentos.length}</strong></div>
              </div>

              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {apontamentos.map((item, index) => (
                  <div key={`${item.tipo}-${index}`} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 800, color: item.severidade === 'critico' ? 'var(--color-error)' : 'var(--color-gold)' }}>
                      {item.tipo}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 'var(--text-sm)' }}>{item.mensagem}</div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {item.valorOS !== undefined && <span>OS {fmt(item.valorOS)}</span>}
                      {item.valorNFe !== undefined && <span>NF-e {fmt(item.valorNFe)}</span>}
                      {item.diferenca !== undefined && <span>Dif. {fmt(item.diferenca)}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                {detalhe?.orientacao || 'Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e.'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

4. Add state:

```js
const [auditoriaIntegridadeFiscalFinanceira, setAuditoriaIntegridadeFiscalFinanceira] = useState(null)
```

5. Pass `onAudit`:

```jsx
<IntegridadeFiscalFinanceiraPanel itens={integridadeFiscalFinanceira} onRefresh={carregarIntegridadeFiscalFinanceira} onAudit={setAuditoriaIntegridadeFiscalFinanceira} />
```

6. Render the modal near the existing audit modal:

```jsx
{auditoriaIntegridadeFiscalFinanceira && <ModalAuditoriaIntegridadeFiscalFinanceira apontamento={auditoriaIntegridadeFiscalFinanceira} onClose={() => setAuditoriaIntegridadeFiscalFinanceira(null)} />}
```

- [ ] **Step 4: Run contract and frontend checks**

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
git add frontend/src/pages/NotasFiscais.jsx backend/__tests__/routeContracts.test.js
git commit -m "feat: show fiscal financial integrity detail modal"
```

---

### Task 4: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run backend suite**

```powershell
cd backend
npm.cmd test
```

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend suite and build sequentially**

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

Expected: frontend tests and Vite build pass. Do not run these concurrently.

- [ ] **Step 3: Run WhatsApp service suite**

```powershell
cd whatsapp-service
npm.cmd test
```

Expected: all WhatsApp tests pass.

- [ ] **Step 4: Run production dependency audits**

```powershell
npm.cmd audit --omit=dev
cd backend
npm.cmd audit --omit=dev
cd ..\frontend
npm.cmd audit --omit=dev
cd ..\whatsapp-service
npm.cmd audit --omit=dev
```

Expected: `found 0 vulnerabilities` for all packages.

- [ ] **Step 5: Confirm git status**

```powershell
git status --short --branch
```

Expected: clean branch `codex/fase-7-detalhe-integridade-fiscal-financeira`.
