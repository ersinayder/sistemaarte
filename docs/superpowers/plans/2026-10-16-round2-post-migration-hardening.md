# Round 2 Post-Migration Integrity & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sanitize sensitive Git history before push, fix browser print CSP framing, standardize Brazil timezone helpers across the frontend, eliminate React key warnings, harden cash register accounts-payable reversals, install VPS logrotate, and synchronize routing permissions and documentation with zero regressions.

**Architecture:** 
1. Git history rewriting on local unpushed range (`origin/main..HEAD`) to purge `scratch/` binary blobs (production database, PFX certificates, customer PII) before any push to GitHub.
2. Content-Security-Policy adjustment in backend print renderer from `frame-ancestors 'none'` to `frame-ancestors 'self'` to allow same-origin hidden `<iframe>` printing in Linux browser mode.
3. Centralized frontend timezone date helper (`hojeBrt`) avoiding the after-21h BRT date shift caused by naive `new Date().toISOString()`.
4. Fallback resolution in caixa launch deletion to reverse accounts payable even on legacy pre-v27 payment records.
5. Production VPS logrotate setup for `/var/log/sistemaarte/*.log` and PM2 logs, followed by zero-downtime deployment and verification.

**Tech Stack:** Node.js 22 LTS, Express 4, React 18, Vite 8, better-sqlite3, Vitest 4, Ubuntu 24.04 LTS (Nginx, PM2, systemd).

**Spec:** `file:///C:/Users/sinayder/.gemini/antigravity/brain/76edbb32-a671-4f3e-9147-26472eab0970/AUDITORIA_ROUND2_VPS.md`

## Global Constraints

- Zero Business Regressions: Never break existing canonical rules (OS statuses, `getResumoFinanceiroOS()`, `resolveClienteData()`, Simples Nacional fiscal rules).
- 100% Test Passing: All 87 backend test suites (828+ tests) and 14 frontend test suites (72+ tests) must pass on every step.
- Sensitive Data Quarantine: `scratch/`, `*.pfx`, `*.db`, `backend/data/` and `.deploy-trigger` must NEVER be tracked or committed to Git.
- Operating System Compatibility: Server direct print via spooler remains disabled on Linux; browser printing via `window.print()` / same-origin iframe is canonical.
- Timezone Canonical: All date generation and daily boundaries must adhere to `America/Sao_Paulo` (UTC-3).

## Review Focus

1. **Git Object History:** Verify that `git log --stat origin/main..HEAD` contains ZERO references to `scratch/`, `oficina.db`, `.pfx` or production XMLs before `git push`.
2. **CSP Framing for Print:** Verify that `sendPrintHtml()` emits `frame-ancestors 'self'` so print iframes work without opening the document to external clickjacking (`frame-ancestors 'none'` blocked same-origin frames).
3. **Evening Timezone Edge Case:** Verify that accessing Financeiro, Notas Fiscais and Propostas between 21:00:00 and 23:59:59 BRT yields today's date, not tomorrow.
4. **Legacy Accounts Payable Estorno:** Verify that deleting a caixa launch linked to a pre-migration account payable where `lancamentos.conta_pagar_id` is null still reverts the account payable to `Pendente`.
5. **WhatsApp UX & DDI:** Verify that clicking WhatsApp Web opens in a new tab without unloading the ERP, and 10/11-digit phone numbers receive the `55` country code prefix.

---

### Task 1: Saneamento do Histórico Git (Purga de Blobs Sensíveis no Range Local)

**Files:**
- Modify: Git history for unpushed local range `origin/main..HEAD` (11 commits ahead)
- Verify: `.gitignore`

**Interfaces:**
- Consumes: Current clean working tree at `bf164a5116d807bc7b54435352e7425fa0971dc5`
- Produces: Clean local git history ahead of `origin/main` with identical codebase diff but 0 sensitive blobs in commit history.

- [ ] **Step 1: Verify current commit log and presence of sensitive blobs in range**

```bash
git log --stat origin/main..HEAD | grep -E "scratch/|bundle.tar.gz|oficina.db"
```
Expected: Confirms `scratch/bundle.tar.gz` and `scratch/restored_server_data/data/oficina.db` are present in commit `2295e4e7`.

- [ ] **Step 2: Reset soft to origin/main while preserving all working tree changes in staging**

```bash
git reset --soft origin/main
```

- [ ] **Step 3: Ensure scratch and untracked sensitive files are strictly excluded and ignored**

```bash
git status --porcelain | grep -E "scratch/|\.deploy-trigger|\.pfx"
```
Expected: No matches (or untracked files ignored by `.gitignore`). If any are staged, `git reset HEAD scratch/` and `git checkout -- .gitignore`.

- [ ] **Step 4: Create clean, atomic commit for the VPS migration hardening**

```bash
git add -A
git commit -m "feat(vps): post-migration integrity and hardening for ubuntu vps"
```

- [ ] **Step 5: Verify new git log contains zero sensitive files**

```bash
git log --stat origin/main..HEAD | grep -E "scratch/|bundle.tar.gz|oficina.db"
```
Expected: Empty output (clean commit range, zero leaks).

- [ ] **Step 6: Run git garbage collection to purge unreachable objects locally**

```bash
git gc --prune=now
```

---

### Task 2: Correção de CSP de Impressão (`frame-ancestors 'self'`)

**Files:**
- Modify: `backend/utils/print/base.js:17-26`
- Test: `backend/__tests__/ordemPrintRoute.test.js`

**Interfaces:**
- Consumes: `PRINT_CONTENT_SECURITY_POLICY` in `backend/utils/print/base.js`
- Produces: CSP header with `frame-ancestors 'self'` allowing same-origin hidden `<iframe>` printing in `printOrdem.js`.

- [ ] **Step 1: Write test verifying CSP header contains `frame-ancestors 'self'`**

In `backend/__tests__/ordemPrintRoute.test.js`:
```javascript
it('define CSP com frame-ancestors self para permitir impressao via iframe mesma origem', async () => {
  const res = await request(app)
    .get('/api/ordens/42/pdf?embedded=1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.headers['content-security-policy']).toContain("frame-ancestors 'self'");
  expect(res.headers['content-security-policy']).not.toContain("frame-ancestors 'none'");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npx.cmd vitest run __tests__/ordemPrintRoute.test.js`
Expected: FAIL (currently contains `frame-ancestors 'none'`).

- [ ] **Step 3: Update `PRINT_CONTENT_SECURITY_POLICY` in `backend/utils/print/base.js`**

Change line 25 from `"frame-ancestors 'none'"` to `"frame-ancestors 'self'"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npx.cmd vitest run __tests__/ordemPrintRoute.test.js`
Expected: PASS (all tests in suite pass).

- [ ] **Step 5: Commit**

```bash
git add backend/utils/print/base.js backend/__tests__/ordemPrintRoute.test.js
git commit -m "fix(print): allow frame-ancestors self in CSP for browser iframe printing"
```

---

### Task 3: Padronização de Fuso Horário de Brasília no Frontend (`hojeBrt`)

**Files:**
- Create: `frontend/src/utils/dates.js`
- Create: `frontend/src/utils/dates.test.js`
- Modify: `frontend/src/pages/Financeiro.jsx:17-18`
- Modify: `frontend/src/pages/NotasFiscais.jsx:1901`
- Modify: `frontend/src/pages/NovaProposta.jsx:28-32`

**Interfaces:**
- Produces: `hojeBrt(): string (YYYY-MM-DD)`, `hojeMaisDiasBrt(days: number): string (YYYY-MM-DD)`, `mesAtualBrt(): string (YYYY-MM)`
- Consumes: Browser system time converted consistently to UTC-3 (America/Sao_Paulo).

- [ ] **Step 1: Write failing unit tests for frontend date utilities**

In `frontend/src/utils/dates.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { hojeBrt, hojeMaisDiasBrt, mesAtualBrt } from './dates';

describe('frontend dates utilities', () => {
  it('retorna a data no fuso de Brasilia mesmo entre 21h e 23h59 UTC', () => {
    // 2026-10-16 22:30:00 BRT is 2026-10-17 01:30:00 UTC
    const dateAtNight = new Date('2026-10-17T01:30:00.000Z');
    expect(hojeBrt(dateAtNight)).toBe('2026-10-16');
    expect(mesAtualBrt(dateAtNight)).toBe('2026-10');
    expect(hojeMaisDiasBrt(5, dateAtNight)).toBe('2026-10-21');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npx.cmd vitest run src/utils/dates.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `frontend/src/utils/dates.js`**

Implement `hojeBrt(now = new Date())`, `hojeMaisDiasBrt(days, now = new Date())`, and `mesAtualBrt(now = new Date())` using `-3 * 3600000` offset or `Intl.DateTimeFormat` with `timeZone: 'America/Sao_Paulo'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend; npx.cmd vitest run src/utils/dates.test.js`
Expected: PASS.

- [ ] **Step 5: Apply `hojeBrt` in `Financeiro.jsx`, `NotasFiscais.jsx`, and `NovaProposta.jsx`**

- In `frontend/src/pages/Financeiro.jsx`: import `{ hojeBrt, mesAtualBrt }` from `../utils/dates`, replace `today = () => new Date().toISOString().slice(0, 10)` with `today = () => hojeBrt()`, `mesAtual = () => mesAtualBrt()`.
- In `frontend/src/pages/NotasFiscais.jsx`: in `ModalExportacaoNFe`, use `hojeBrt()`.
- In `frontend/src/pages/NovaProposta.jsx`: replace `hojeMaisDias(days)` with `hojeMaisDiasBrt(days)`.

- [ ] **Step 6: Run frontend test suites**

Run: `cd frontend; npx.cmd vitest run src/pages/NotasFiscais.test.jsx; npm.cmd run build`
Expected: PASS, clean build.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/dates.js frontend/src/utils/dates.test.js frontend/src/pages/Financeiro.jsx frontend/src/pages/NotasFiscais.jsx frontend/src/pages/NovaProposta.jsx
git commit -m "fix(dates): standardize brasilia timezone helpers across frontend"
```

---

### Task 4: Correções de Frontend (Chave React, WhatsApp Web e Permissões de Rota)

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx:2274`
- Modify: `frontend/src/utils/whatsappOficina.js:1-78`
- Modify: `frontend/src/App.jsx:97`
- Test: `frontend/src/pages/NotasFiscais.test.jsx`
- Test: `frontend/src/utils/whatsappOficina.test.js` (or `backend/__tests__/whatsappOficinaUrl.test.js`)

**Interfaces:**
- Consumes: `NotasFiscais.jsx` list rendering, `whatsappOficina.js` launcher, `App.jsx` private route guards.
- Produces: Warning-free React tables, safe new-tab WhatsApp Web opening with `55` DDI, and synchronized permissions for `/servidor`.

- [ ] **Step 1: Write test for WhatsApp Web opening in new tab and DDI 55 formatting**

In `backend/__tests__/whatsappOficinaUrl.test.js` or `frontend/src/utils/whatsappOficina.test.js`:
Verify that `buildWhatsappWebUrl` and `buildWhatsappDesktopUrl` prepend `55` when given a 10 or 11-digit phone number, and `openWhatsappConversation` uses `window.open(url, '_blank', 'noopener,noreferrer')` for web mode.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npx.cmd vitest run src/pages/NotasFiscais.test.jsx`
Observe the React key warning on line 5850/2274.

- [ ] **Step 3: Implement fixes**

1. In `frontend/src/pages/NotasFiscais.jsx:2274`:
   Change `<tr key={n.id}` to `<tr key={n.id || n.nfe_chave || n.chave || `${n.origem}-${n.ordemid || n.nfe_numero || i}`}`.
2. In `frontend/src/utils/whatsappOficina.js`:
   - Add phone number normalization ensuring DDI 55:
     ```javascript
     function formatarNumero(phone) {
       const digits = String(phone || '').replace(/\D/g, '');
       if (!digits) return '';
       if (digits.startsWith('55') && digits.length >= 12) return digits;
       if (digits.length === 10 || digits.length === 11) return `55${digits}`;
       return digits;
     }
     ```
   - In `navigateWhatsappWeb(url)`: use `window.open(url, '_blank', 'noopener,noreferrer')` instead of `window.location.assign(url)`.
3. In `frontend/src/App.jsx:97`:
   Change permissions for `/servidor` to `permissions={['servidor.ver', 'configuracoes.ver']}` to match `backend/routes/servidor.js`.

- [ ] **Step 4: Run test to verify warning is gone and build passes**

Run: `cd frontend; npx.cmd vitest run src/pages/NotasFiscais.test.jsx`
Expected: PASS, with ZERO key warnings in console!
Run: `cd frontend; npm.cmd run build`
Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NotasFiscais.jsx frontend/src/utils/whatsappOficina.js frontend/src/App.jsx
git commit -m "fix(frontend): resolve react keys, whatsapp ddi/new-tab and align servidor permissions"
```

---

### Task 5: Resiliência de Estorno no Caixa para Contas a Pagar Anteriores à v27

**Files:**
- Modify: `backend/routes/caixa.js:180-186`
- Test: `backend/__tests__/caixaEstornoContaPagar.test.js`

**Interfaces:**
- Consumes: `DELETE /api/caixa/:id`
- Produces: Reversion of `contas_pagar` to `Pendente` even when `lancamentos.conta_pagar_id` is null by querying `contas_pagar.lancamentoid`.

- [ ] **Step 1: Write failing test in `backend/__tests__/caixaEstornoContaPagar.test.js`**

Add test case verifying that deleting a caixa launch linked to a pre-migration account payable where `lancamentos.conta_pagar_id` is null (but `contas_pagar.lancamentoid` matches) successfully reverts `contas_pagar` status to `Pendente`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npx.cmd vitest run __tests__/caixaEstornoContaPagar.test.js`
Expected: FAIL on the pre-migration scenario.

- [ ] **Step 3: Implement fallback resolution in `backend/routes/caixa.js`**

```javascript
const contaPagarId = old.conta_pagar_id || (old.origem === "conta-pagar" ? getOne("SELECT id FROM contas_pagar WHERE lancamentoid=?", [old.id])?.id : null);
if (contaPagarId) {
  run(
    "UPDATE contas_pagar SET status='Pendente', datapagamento=NULL, pagoem=NULL, lancamentoid=NULL, updatedat=datetime('now','localtime') WHERE id=?",
    [contaPagarId]
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npx.cmd vitest run __tests__/caixaEstornoContaPagar.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/caixa.js backend/__tests__/caixaEstornoContaPagar.test.js
git commit -m "fix(caixa): support legacy conta_pagar reversal via lancamentoid fallback"
```

---

### Task 6: Rotação de Logs (`logrotate`) na VPS, Atualização do `AGENTS.md` e Deploy de Produção

**Files:**
- Modify: `AGENTS.md:210-280`
- Remote VPS: `/etc/logrotate.d/sistemaarte`
- Remote VPS: Sincronização e sentinela `.deploy-trigger`

**Interfaces:**
- Consumes: Canonical routes and documentation in `AGENTS.md`, system logrotate daemon on VPS Ubuntu 24.04.
- Produces: Automated 14-day log rotation for application and PM2 logs, fully accurate documentation, verified production deployment.

- [ ] **Step 1: Update route tables in `AGENTS.md`**

In `AGENTS.md`:
- Add `/api/servidor` to the list of backend routes in `server.js`.
- Add `/servidor` to the list of frontend routes in `App.jsx`.

- [ ] **Step 2: Configure `/etc/logrotate.d/sistemaarte` on remote VPS**

Execute on VPS (187.127.22.223):
```bash
cat << 'EOF' > /etc/logrotate.d/sistemaarte
/var/log/sistemaarte/*.log /root/.pm2/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
logrotate -d /etc/logrotate.d/sistemaarte
```
Expected: Configuration tested with syntax OK.

- [ ] **Step 3: Run full local test suites and build**

```bash
cd backend; npm.cmd test
cd ../frontend; npm.cmd test; npm.cmd run build
```
Expected: 87 backend test files passing, 14 frontend test files passing, 0 errors.

- [ ] **Step 4: Sync updated files to VPS and trigger reload**

Sync `backend/` and `frontend/dist/` to `/var/www/sistemaarte` on the VPS and touch `.deploy-trigger`.

- [ ] **Step 5: Verify live endpoints and PM2 logs on VPS**

- `curl -I https://arteemolduras.com.br/api/health` -> 200 OK
- `curl -I https://arteemolduras.com.br/api/auth/me` -> 401 Unauthorized (expected)
- PM2 logs on VPS showing clean startup without errors.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document servidor routes and configure production logrotate"
```
