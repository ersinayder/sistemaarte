# WhatsApp Fila da Oficina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-cost manual WhatsApp workflow to the workshop queue, with backend-owned messages, fixed WhatsApp Web tab opening, and persisted notification states per OS.

**Architecture:** The backend owns all notification rules, phone normalization, message generation, role checks, and persistence in a new `whatsapp_avisos` table. The frontend only asks the backend to open or mark an OS notice, then builds a fixed-host `web.whatsapp.com/send` URL from backend-returned `phone` and `text`. The old automatic Meta send on `Pronto` is removed from the status-change path to avoid duplicate/unstable sends.

**Tech Stack:** Node.js 22, Express 4, SQLite via `better-sqlite3`, React 18 + Vite 8, Vitest 4.1.

---

## File Map

- Create `backend/domain/whatsappAvisosRules.js`: source of truth for notice types, statuses, transitions, role authorization, phone normalization, message building, and safe notice projection.
- Create `backend/__tests__/whatsappAvisosRules.test.js`: TDD coverage for rules, phone normalization, financial redaction, and transitions.
- Modify `backend/database.js`: add `whatsapp_avisos` table and indexes to schema and migrations.
- Create `backend/__tests__/whatsappAvisosSchema.test.js`: contract coverage for schema/indexes.
- Modify `backend/routes/ordens.js`: attach notices to OS reads, add open/mark routes, stop automatic Meta send when status becomes `Pronto`, and redact financial OS fields for `oficina`.
- Modify `backend/__tests__/routeContracts.test.js`: authorization and persistence contracts for notice routes and no automatic `sendWhatsApp` calls from `maybeNotifyPronto`.
- Create `backend/__tests__/whatsappAvisosRoutes.test.js`: route-handler tests proving backend ignores malicious body values and enforces roles/status/type.
- Create `frontend/src/utils/whatsappOficina.js`: fixed-host WhatsApp Web URL and named-tab opener helper.
- Create `backend/__tests__/whatsappOficinaUrl.test.js`: Vitest coverage for the frontend helper.
- Modify `frontend/src/pages/Oficina.jsx`: render compact notice tags in Kanban and list modes, open WhatsApp through backend, context-menu mark actions, hover check action, and fallback copy.

---

## Task 1: Backend Notice Rules

**Owner:** Backend rules worker. Do not edit routes, database, or frontend files in this task.

**Files:**
- Create: `backend/domain/whatsappAvisosRules.js`
- Test: `backend/__tests__/whatsappAvisosRules.test.js`

- [ ] **Step 1: Write the failing rule tests**

Create `backend/__tests__/whatsappAvisosRules.test.js`:

```js
import { describe, expect, it } from 'vitest';

const rules = await import('../domain/whatsappAvisosRules.js');

const ordemBase = {
  id: 7,
  numero: 'OS-0007',
  clientenome: 'Maria Silva',
  clientetelefone: '(31) 99999-0000',
  clientecontato: null,
  servico: 'Quadro',
  tipo: 'Quadro',
  valortotal: 1234.5,
  valor: 1234.5,
  valorentrada: 200,
  entrada: 200,
  saldoaberto: 1034.5,
  status: 'Aguardando',
};

describe('whatsappAvisosRules', () => {
  it('normalizes only allowed notice types and statuses', () => {
    expect(rules.normalizarTipoAviso('confirmacao_pedido')).toBe('confirmacao_pedido');
    expect(rules.normalizarTipoAviso('pedido_pronto')).toBe('pedido_pronto');
    expect(rules.normalizarTipoAviso(' http://evil.test ')).toBeNull();

    expect(rules.normalizarStatusAviso('pendente')).toBe('pendente');
    expect(rules.normalizarStatusAviso('aberto')).toBe('aberto');
    expect(rules.normalizarStatusAviso('enviado')).toBe('enviado');
    expect(rules.normalizarStatusAviso('ignorado')).toBe('ignorado');
    expect(rules.normalizarStatusAviso('confirmado')).toBeNull();
  });

  it('normalizes Brazilian phone numbers without trusting formatting', () => {
    expect(rules.normalizarTelefoneWhatsapp('(31) 99999-0000')).toBe('5531999990000');
    expect(rules.normalizarTelefoneWhatsapp('5531999990000')).toBe('5531999990000');
    expect(rules.normalizarTelefoneWhatsapp('')).toBeNull();
    expect(rules.normalizarTelefoneWhatsapp('123')).toBeNull();
  });

  it('allows admin and caixa to use both notices but limits oficina to ready notices', () => {
    expect(rules.podeUsarAviso('admin', 'confirmacao_pedido')).toBe(true);
    expect(rules.podeUsarAviso('caixa', 'confirmacao_pedido')).toBe(true);
    expect(rules.podeUsarAviso('oficina', 'confirmacao_pedido')).toBe(false);
    expect(rules.podeUsarAviso('oficina', 'pedido_pronto')).toBe(true);
  });

  it('builds confirmation messages with financial data only for admin and caixa', () => {
    const msg = rules.montarMensagemAviso(ordemBase, 'confirmacao_pedido', { role: 'caixa' });

    expect(msg.ok).toBe(true);
    expect(msg.text).toContain('Confirmacao de Pedido');
    expect(msg.text).toContain('Maria Silva');
    expect(msg.text).toContain('OS-0007');
    expect(msg.text).toContain('R$ 1.234,50');
    expect(msg.text).toContain('R$ 200,00');
    expect(msg.text).toContain('R$ 1.034,50');

    const oficina = rules.montarMensagemAviso(ordemBase, 'confirmacao_pedido', { role: 'oficina' });
    expect(oficina.ok).toBe(false);
    expect(oficina.error).toBe('forbidden_notice_type');
  });

  it('builds ready notices without exposing total or entry amounts to oficina', () => {
    const msg = rules.montarMensagemAviso({ ...ordemBase, status: 'Pronto' }, 'pedido_pronto', { role: 'oficina' });

    expect(msg.ok).toBe(true);
    expect(msg.text).toContain('Pedido Pronto');
    expect(msg.text).toContain('OS-0007');
    expect(msg.text).toContain('Quadro');
    expect(msg.text).toContain('Saldo na retirada');
    expect(msg.text).toContain('R$ 1.034,50');
    expect(msg.text).not.toContain('Valor Total');
    expect(msg.text).not.toContain('Entrada paga');
  });

  it('validates notice availability by OS status', () => {
    expect(rules.avisoDisponivelParaOrdem(ordemBase, 'confirmacao_pedido', 'caixa')).toEqual({ ok: true });
    expect(rules.avisoDisponivelParaOrdem({ ...ordemBase, status: 'Cancelado' }, 'confirmacao_pedido', 'caixa').ok).toBe(false);
    expect(rules.avisoDisponivelParaOrdem({ ...ordemBase, status: 'Pronto' }, 'pedido_pronto', 'oficina')).toEqual({ ok: true });
    expect(rules.avisoDisponivelParaOrdem({ ...ordemBase, status: 'Aguardando' }, 'pedido_pronto', 'oficina').ok).toBe(false);
  });

  it('validates safe status transitions', () => {
    expect(rules.validarTransicaoAviso('pendente', 'aberto')).toEqual({ ok: true });
    expect(rules.validarTransicaoAviso('aberto', 'enviado')).toEqual({ ok: true });
    expect(rules.validarTransicaoAviso('pendente', 'enviado')).toEqual({ ok: true });
    expect(rules.validarTransicaoAviso('enviado', 'aberto').ok).toBe(false);
    expect(rules.validarTransicaoAviso('ignorado', 'enviado').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the rule test and verify RED**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappAvisosRules.test.js
```

Expected: FAIL because `../domain/whatsappAvisosRules.js` does not exist.

- [ ] **Step 3: Implement the domain rules**

Create `backend/domain/whatsappAvisosRules.js`:

```js
const TIPOS_AVISO = ['confirmacao_pedido', 'pedido_pronto'];
const STATUS_AVISO = ['pendente', 'aberto', 'enviado', 'ignorado'];
const STATUS_FINAIS = ['enviado', 'ignorado'];

const TRANSICOES_AVISO = {
  pendente: ['aberto', 'enviado', 'ignorado'],
  aberto: ['enviado', 'ignorado'],
  enviado: [],
  ignorado: [],
};

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizarTipoAviso(value) {
  const tipo = clean(value, 40).toLowerCase();
  return TIPOS_AVISO.includes(tipo) ? tipo : null;
}

function normalizarStatusAviso(value) {
  const status = clean(value, 40).toLowerCase();
  return STATUS_AVISO.includes(status) ? status : null;
}

function normalizarTelefoneWhatsapp(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length <= 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 14) return null;
  return digits;
}

function fmtVal(value) {
  return Number(value || 0)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/\u00a0/g, ' ');
}

function podeUsarAviso(role, tipo) {
  const normalized = normalizarTipoAviso(tipo);
  if (!normalized) return false;
  if (role === 'admin' || role === 'caixa') return true;
  return role === 'oficina' && normalized === 'pedido_pronto';
}

function avisoDisponivelParaOrdem(ordem = {}, tipo, role) {
  const normalized = normalizarTipoAviso(tipo);
  if (!normalized) return { ok: false, error: 'invalid_notice_type' };
  if (!podeUsarAviso(role, normalized)) return { ok: false, error: 'forbidden_notice_type' };
  if (!ordem || ordem.deletedat) return { ok: false, error: 'order_not_found' };

  const status = ordem.status;
  if (normalized === 'confirmacao_pedido') {
    if (['Aguardando', 'Em Produção', 'Pronto'].includes(status)) return { ok: true };
    return { ok: false, error: 'notice_not_available_for_status' };
  }

  if (normalized === 'pedido_pronto') {
    if (status === 'Pronto') return { ok: true };
    return { ok: false, error: 'notice_not_available_for_status' };
  }

  return { ok: false, error: 'invalid_notice_type' };
}

function getSaldo(ordem) {
  const total = Number(ordem.valortotal ?? ordem.valor ?? 0);
  const entrada = Number(ordem.valorentrada ?? ordem.entrada ?? 0);
  const saldo = Number(ordem.saldoaberto ?? ordem.valorrestante ?? (total - entrada));
  return Math.max(0, saldo);
}

function montarMensagemAviso(ordem = {}, tipo, { role = null } = {}) {
  const normalized = normalizarTipoAviso(tipo);
  const disponibilidade = avisoDisponivelParaOrdem(ordem, normalized, role);
  if (!disponibilidade.ok) return disponibilidade;

  const nome = clean(ordem.clientenome, 120) || 'cliente';
  const numero = clean(ordem.numero, 40) || 'OS';
  const servico = clean(ordem.servico || ordem.tipo, 160) || 'servico';
  const total = Number(ordem.valortotal ?? ordem.valor ?? 0);
  const entrada = Number(ordem.valorentrada ?? ordem.entrada ?? 0);
  const saldo = getSaldo(ordem);

  if (normalized === 'confirmacao_pedido') {
    return {
      ok: true,
      text: [
        '*Arte e Molduras - Confirmacao de Pedido*',
        '',
        `Ola, *${nome}*! Seu pedido foi registrado com sucesso.`,
        '',
        `*Servico:* ${servico}`,
        `*OS:* ${numero}`,
        `*Valor Total:* ${fmtVal(total)}`,
        entrada > 0.009 ? `*Entrada paga:* ${fmtVal(entrada)}` : null,
        saldo > 0.009 ? `*Saldo restante na retirada:* ${fmtVal(saldo)}` : '*Pagamento:* Quitado',
        '',
        'Entraremos em contato quando seu pedido estiver pronto.',
        '_Arte e Molduras_',
      ].filter(Boolean).join('\n'),
    };
  }

  return {
    ok: true,
    text: [
      '*Arte e Molduras - Pedido Pronto!*',
      '',
      `Ola, *${nome}*! Seu pedido esta pronto para retirada.`,
      '',
      `*Servico:* ${servico}`,
      `*OS:* ${numero}`,
      saldo > 0.009 ? `*Saldo na retirada:* ${fmtVal(saldo)}` : '*Pagamento:* Quitado',
      '',
      'Estamos aguardando voce!',
      '_Arte e Molduras_',
    ].join('\n'),
  };
}

function validarTransicaoAviso(atual, proximo) {
  const statusAtual = normalizarStatusAviso(atual || 'pendente');
  const statusNovo = normalizarStatusAviso(proximo);
  if (!statusAtual || !statusNovo) return { ok: false, error: 'invalid_notice_status' };
  if (statusAtual === statusNovo) return { ok: true };
  if ((TRANSICOES_AVISO[statusAtual] || []).includes(statusNovo)) return { ok: true };
  return { ok: false, error: 'invalid_notice_transition' };
}

function avisoFinalizado(status) {
  return STATUS_FINAIS.includes(normalizarStatusAviso(status));
}

module.exports = {
  TIPOS_AVISO,
  STATUS_AVISO,
  normalizarTipoAviso,
  normalizarStatusAviso,
  normalizarTelefoneWhatsapp,
  podeUsarAviso,
  avisoDisponivelParaOrdem,
  montarMensagemAviso,
  validarTransicaoAviso,
  avisoFinalizado,
};
```

- [ ] **Step 4: Run the rule test and verify GREEN**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappAvisosRules.test.js
```

Expected: PASS, all tests in `whatsappAvisosRules.test.js`.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add backend/domain/whatsappAvisosRules.js backend/__tests__/whatsappAvisosRules.test.js
git commit -m "feat: add whatsapp notice rules"
```

---

## Task 2: Database Schema For Notices

**Owner:** Backend schema worker. Do not edit route or frontend files in this task.

**Files:**
- Modify: `backend/database.js`
- Test: `backend/__tests__/whatsappAvisosSchema.test.js`

- [ ] **Step 1: Write the failing schema contract**

Create `backend/__tests__/whatsappAvisosSchema.test.js`:

```js
import { describe, expect, it } from 'vitest';
import fs from 'fs';

describe('whatsapp avisos schema', () => {
  it('creates a persisted notice table with idempotent OS/type tracking', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS whatsapp_avisos/);
    expect(source).toMatch(/ordemid\s+INTEGER NOT NULL/);
    expect(source).toMatch(/tipo\s+TEXT NOT NULL/);
    expect(source).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pendente'/);
    expect(source).toMatch(/telefone_snapshot\s+TEXT/);
    expect(source).toMatch(/mensagem_snapshot\s+TEXT/);
    expect(source).toMatch(/aberto_por\s+INTEGER/);
    expect(source).toMatch(/enviado_por\s+INTEGER/);
    expect(source).toMatch(/ignorado_por\s+INTEGER/);
    expect(source).toMatch(/UNIQUE\s*\(\s*ordemid\s*,\s*tipo\s*\)/);
    expect(source).toMatch(/idx_whatsapp_avisos_ordemid/);
    expect(source).toMatch(/idx_whatsapp_avisos_status/);
  });
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappAvisosSchema.test.js
```

Expected: FAIL because `whatsapp_avisos` is not in `database.js`.

- [ ] **Step 3: Add the table to `SCHEMA`**

In `backend/database.js`, add this block after `whatsapp_config` in `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS whatsapp_avisos (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid           INTEGER NOT NULL,
  tipo              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente',
  telefone_snapshot TEXT,
  mensagem_snapshot TEXT,
  aberto_por        INTEGER,
  enviado_por       INTEGER,
  ignorado_por      INTEGER,
  aberto_em         TEXT,
  enviado_em        TEXT,
  ignorado_em       TEXT,
  createdat         TEXT DEFAULT (datetime('now','localtime')),
  updatedat         TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(ordemid, tipo)
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_ordemid ON whatsapp_avisos(ordemid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_status ON whatsapp_avisos(status);
```

- [ ] **Step 4: Add the migration**

In the `migrations[]` array, after the current last migration, add:

```js
    // v13 - avisos manuais de WhatsApp por OS
    `CREATE TABLE IF NOT EXISTS whatsapp_avisos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid           INTEGER NOT NULL,
      tipo              TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pendente',
      telefone_snapshot TEXT,
      mensagem_snapshot TEXT,
      aberto_por        INTEGER,
      enviado_por       INTEGER,
      ignorado_por      INTEGER,
      aberto_em         TEXT,
      enviado_em        TEXT,
      ignorado_em       TEXT,
      createdat         TEXT DEFAULT (datetime('now','localtime')),
      updatedat         TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(ordemid, tipo)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_ordemid ON whatsapp_avisos(ordemid)",
    "CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_status ON whatsapp_avisos(status)",
```

- [ ] **Step 5: Run the schema test and verify GREEN**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappAvisosSchema.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```powershell
git add backend/database.js backend/__tests__/whatsappAvisosSchema.test.js
git commit -m "feat: persist whatsapp notice states"
```

---

## Task 3: Backend Routes And OS Integration

**Owner:** Backend route worker. Do not edit frontend files in this task.

**Files:**
- Modify: `backend/routes/ordens.js`
- Test: `backend/__tests__/routeContracts.test.js`
- Test: `backend/__tests__/whatsappAvisosRoutes.test.js`

- [ ] **Step 1: Write failing route contracts**

Add these tests to `backend/__tests__/routeContracts.test.js`:

```js
  it('exposes whatsapp notice routes with explicit role restrictions', async () => {
    const ordensRouter = await loadRouter('../routes/ordens.js');

    expect(routeRoles(ordensRouter, 'post', '/:id/whatsapp-avisos/:tipo/abrir')).toEqual(['admin', 'caixa', 'oficina']);
    expect(routeRoles(ordensRouter, 'patch', '/:id/whatsapp-avisos/:tipo/status')).toEqual(['admin', 'caixa', 'oficina']);
  });

  it('does not call the unstable automatic whatsapp sender when OS becomes ready', () => {
    const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

    expect(source).toMatch(/function maybeNotifyPronto/);
    expect(source).not.toMatch(/sendWhatsApp\(os\)/);
    expect(source).toMatch(/garantirAvisoPronto/);
  });
```

- [ ] **Step 2: Write failing route behavior tests**

Create `backend/__tests__/whatsappAvisosRoutes.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = 'test-whatsapp-avisos';

const db = {
  getAll: vi.fn(() => []),
  getOne: vi.fn(() => null),
  run: vi.fn(() => ({ changes: 1 })),
  runInsert: vi.fn(() => 123),
  transaction: vi.fn((fn) => fn()),
};

vi.mock('../database.js', () => db);
vi.mock('../database', () => db);
vi.mock('../utils/whatsapp.js', () => ({
  sendWhatsApp: vi.fn(() => Promise.resolve()),
  sendWhatsAppConfirmacao: vi.fn(() => Promise.resolve()),
}));

const ordensRouter = (await import('../routes/ordens.js')).default || (await import('../routes/ordens.js'));

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = ordensRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1].handle;
}

const ordem = {
  id: 77,
  numero: 'OS-0077',
  clientenome: 'Cliente Real',
  clientetelefone: '(31) 99999-0000',
  servico: 'Quadro',
  status: 'Pronto',
  valortotal: 900,
  valorentrada: 100,
  saldoaberto: 800,
  deletedat: null,
};

describe('whatsapp avisos routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getOne.mockReturnValue(null);
    db.getAll.mockReturnValue([]);
    db.run.mockReturnValue({ changes: 1 });
    db.runInsert.mockReturnValue(123);
  });

  it('opens a ready notice using backend order data and ignores malicious body values', async () => {
    db.getOne
      .mockReturnValueOnce(ordem)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ id: 456, ordemid: 77, tipo: 'pedido_pronto', status: 'aberto' });

    const handler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
    const res = makeRes();

    await handler({
      params: { id: '77', tipo: 'pedido_pronto' },
      user: { id: 9, role: 'oficina' },
      body: {
        telefone: '5511999999999',
        mensagem: 'mensagem atacada',
        status: 'enviado',
      },
    }, res, vi.fn());

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.whatsapp.phone).toBe('5531999990000');
    expect(payload.whatsapp.text).toContain('Cliente Real');
    expect(payload.whatsapp.text).not.toContain('mensagem atacada');
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('telefone_snapshot'), expect.arrayContaining([
      77,
      'pedido_pronto',
      'aberto',
      '5531999990000',
      expect.stringContaining('Cliente Real'),
      9,
    ]));
  });

  it('forbids oficina from opening financial confirmation notices', async () => {
    db.getOne.mockReturnValueOnce({ ...ordem, status: 'Aguardando' });

    const handler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
    const res = makeRes();

    await handler({
      params: { id: '77', tipo: 'confirmacao_pedido' },
      user: { id: 9, role: 'oficina' },
      body: {},
    }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Aviso nao permitido para este usuario.' });
  });

  it('rejects invalid notice types and invalid final-state transitions', async () => {
    const openHandler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
    const openRes = makeRes();
    await openHandler({
      params: { id: '77', tipo: 'http://evil.test' },
      user: { id: 2, role: 'admin' },
      body: {},
    }, openRes, vi.fn());
    expect(openRes.status).toHaveBeenCalledWith(400);

    db.getOne
      .mockReturnValueOnce(ordem)
      .mockReturnValueOnce({ id: 456, ordemid: 77, tipo: 'pedido_pronto', status: 'enviado' });
    const patchHandler = businessHandler('patch', '/:id/whatsapp-avisos/:tipo/status');
    const patchRes = makeRes();
    await patchHandler({
      params: { id: '77', tipo: 'pedido_pronto' },
      user: { id: 2, role: 'admin' },
      body: { status: 'aberto' },
    }, patchRes, vi.fn());
    expect(patchRes.status).toHaveBeenCalledWith(409);
  });
});
```

- [ ] **Step 3: Run route tests and verify RED**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- routeContracts.test.js whatsappAvisosRoutes.test.js
```

Expected: FAIL because the routes/helpers are missing and `maybeNotifyPronto` still calls `sendWhatsApp`.

- [ ] **Step 4: Update imports and remove unstable automatic sending**

In `backend/routes/ordens.js`, remove `sendWhatsApp` from the import and add the rule imports:

```js
const { sendWhatsAppConfirmacao } = require("../utils/whatsapp");
const {
  normalizarTipoAviso,
  normalizarStatusAviso,
  normalizarTelefoneWhatsapp,
  podeUsarAviso,
  avisoDisponivelParaOrdem,
  montarMensagemAviso,
  validarTransicaoAviso,
} = require("../domain/whatsappAvisosRules");
```

Replace `maybeNotifyPronto()` with:

```js
function garantirAvisoPendente(ordemId, tipo) {
  run(
    `INSERT OR IGNORE INTO whatsapp_avisos (ordemid, tipo, status, updatedat)
     VALUES (?, ?, 'pendente', datetime('now','localtime'))`,
    [ordemId, tipo]
  );
}

function garantirAvisoPronto(ordemId, statusAnterior, statusNovo) {
  if (statusAnterior === statusNovo || statusNovo !== 'Pronto') return;
  garantirAvisoPendente(ordemId, 'pedido_pronto');
}

function maybeNotifyPronto(ordemId, statusAnterior, statusNovo) {
  garantirAvisoPronto(ordemId, statusAnterior, statusNovo);
}
```

- [ ] **Step 5: Add route helpers**

Add these helpers before the route declarations in `backend/routes/ordens.js`:

```js
function buscarOrdemAviso(ordemId) {
  return getOne(`${SEL_ORDEM} WHERE o.id=? AND o.deletedat IS NULL`, [ordemId]);
}

function buscarAviso(ordemId, tipo) {
  return getOne(
    `SELECT * FROM whatsapp_avisos WHERE ordemid=? AND tipo=? LIMIT 1`,
    [ordemId, tipo]
  );
}

function listarAvisos(ordemIds) {
  if (!ordemIds.length) return [];
  const placeholders = ordemIds.map(() => '?').join(',');
  return getAll(
    `SELECT * FROM whatsapp_avisos WHERE ordemid IN (${placeholders})`,
    ordemIds
  );
}

function projetarAviso(row) {
  if (!row) return null;
  return {
    id: row.id,
    ordemid: row.ordemid,
    tipo: row.tipo,
    status: row.status || 'pendente',
    aberto_em: row.aberto_em || null,
    enviado_em: row.enviado_em || null,
    ignorado_em: row.ignorado_em || null,
    updatedat: row.updatedat || null,
  };
}

function avisoVirtual(ordem, tipo, role, avisosPorChave) {
  const disponibilidade = avisoDisponivelParaOrdem(ordem, tipo, role);
  const existente = avisosPorChave.get(`${ordem.id}:${tipo}`);
  if (existente) return projetarAviso(existente);
  if (!disponibilidade.ok) return null;
  return { ordemid: ordem.id, tipo, status: 'pendente', virtual: true };
}

function anexarAvisosWhatsApp(rows, role) {
  const ordemIds = rows.map((row) => row.id).filter(Boolean);
  const avisos = listarAvisos(ordemIds);
  const avisosPorChave = new Map(avisos.map((aviso) => [`${aviso.ordemid}:${aviso.tipo}`, aviso]));

  return rows.map((row) => {
    const confirmacao = avisoVirtual(row, 'confirmacao_pedido', role, avisosPorChave);
    const pronto = avisoVirtual(row, 'pedido_pronto', role, avisosPorChave);
    const whatsappAvisos = {
      confirmacao_pedido: confirmacao,
      pedido_pronto: pronto,
    };
    const whatsappAvisoPrincipal = pronto && ['pendente', 'aberto'].includes(pronto.status)
      ? pronto
      : confirmacao && ['pendente', 'aberto'].includes(confirmacao.status)
        ? confirmacao
        : pronto || confirmacao;
    return { ...redactOrdemForRole(row, role), whatsappAvisos, whatsappAvisoPrincipal };
  });
}

function redactOrdemForRole(row, role) {
  if (role !== 'oficina') return row;
  const {
    valortotal,
    valorentrada,
    valor,
    entrada,
    valorrecebido,
    saldoaberto,
    pagamento,
    ...safe
  } = row;
  return safe;
}

function salvarAvisoAberto(ordemId, tipo, phone, text, userId) {
  run(
    `INSERT INTO whatsapp_avisos
       (ordemid, tipo, status, telefone_snapshot, mensagem_snapshot, aberto_por, aberto_em, updatedat)
     VALUES (?, ?, 'aberto', ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
     ON CONFLICT(ordemid, tipo) DO UPDATE SET
       status=CASE
         WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.status
         ELSE 'aberto'
       END,
       telefone_snapshot=excluded.telefone_snapshot,
       mensagem_snapshot=excluded.mensagem_snapshot,
       aberto_por=excluded.aberto_por,
       aberto_em=COALESCE(whatsapp_avisos.aberto_em, excluded.aberto_em),
       updatedat=datetime('now','localtime')`,
    [ordemId, tipo, phone, text, userId]
  );
  return buscarAviso(ordemId, tipo);
}
```

- [ ] **Step 6: Attach notices to `GET /api/ordens`**

In `router.get("/")`, wrap both legacy and paginated responses:

```js
    if (!querPaginacao) {
      const rows = getAll(`${SEL_ORDEM}${whereSql} ORDER BY o.id DESC`, p);
      return res.json(anexarAvisosWhatsApp(rows, req.user.role));
    }
```

and:

```js
    res.json({
      data: anexarAvisosWhatsApp(rows, req.user.role),
      meta: montarMetaPaginacao({ page, limit, total }),
    });
```

- [ ] **Step 7: Redact `GET /api/ordens/:id` for oficina**

In `router.get("/:id")`, return:

```js
    res.json({ ...redactOrdemForRole(o, req.user.role), logs, itens, lancamentos: req.user.role === 'oficina' ? [] : lancamentos });
```

- [ ] **Step 8: Ensure notice rows on OS creation and ready transition**

Inside the `POST /api/ordens` transaction, after the `statuslog` insert, add:

```js
      garantirAvisoPendente(id, 'confirmacao_pedido');
```

Keep `maybeNotifyPronto(req.params.id, old.status, status)` and `maybeNotifyPronto(req.params.id, old.status, ns)` calls; they now only create a pending notice and do not call Meta.

- [ ] **Step 9: Add open and mark routes before `/:id` delete/restore routes**

Add before the old `POST /api/ordens/:id/whatsapp-confirmacao` route:

```js
// POST /api/ordens/:id/whatsapp-avisos/:tipo/abrir
router.post("/:id/whatsapp-avisos/:tipo/abrir", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const tipo = normalizarTipoAviso(req.params.tipo);
    if (!tipo) return res.status(400).json({ error: "Tipo de aviso invalido." });
    if (!podeUsarAviso(req.user.role, tipo)) {
      return res.status(403).json({ error: "Aviso nao permitido para este usuario." });
    }

    const os = buscarOrdemAviso(req.params.id);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const disponibilidade = avisoDisponivelParaOrdem(os, tipo, req.user.role);
    if (!disponibilidade.ok) {
      return res.status(409).json({ error: "Aviso indisponivel para o status atual da OS." });
    }

    const phone = normalizarTelefoneWhatsapp(os.clientetelefone || os.clientecontato);
    const message = montarMensagemAviso(os, tipo, { role: req.user.role });
    if (!message.ok) return res.status(403).json({ error: "Aviso nao permitido para este usuario." });

    const aviso = salvarAvisoAberto(os.id, tipo, phone, message.text, req.user.id);
    res.json({
      aviso: projetarAviso(aviso),
      whatsapp: {
        mode: "web",
        phone,
        text: message.text,
      },
    });
  } catch(e) { next(e); }
});

// PATCH /api/ordens/:id/whatsapp-avisos/:tipo/status
router.patch("/:id/whatsapp-avisos/:tipo/status", auth(["admin","caixa","oficina"]), (req, res, next) => {
  try {
    const tipo = normalizarTipoAviso(req.params.tipo);
    const status = normalizarStatusAviso(req.body?.status);
    if (!tipo) return res.status(400).json({ error: "Tipo de aviso invalido." });
    if (!status || !['enviado', 'ignorado'].includes(status)) {
      return res.status(400).json({ error: "Status de aviso invalido." });
    }
    if (!podeUsarAviso(req.user.role, tipo)) {
      return res.status(403).json({ error: "Aviso nao permitido para este usuario." });
    }

    const os = buscarOrdemAviso(req.params.id);
    if (!os) return res.status(404).json({ error: "OS nao encontrada" });

    const atual = buscarAviso(os.id, tipo) || { status: 'pendente' };
    const transicao = validarTransicaoAviso(atual.status, status);
    if (!transicao.ok) return res.status(409).json({ error: "Transicao de aviso invalida." });

    if (!atual.id) garantirAvisoPendente(os.id, tipo);

    const fieldPor = status === 'enviado' ? 'enviado_por' : 'ignorado_por';
    const fieldEm = status === 'enviado' ? 'enviado_em' : 'ignorado_em';
    run(
      `UPDATE whatsapp_avisos
       SET status=?, ${fieldPor}=?, ${fieldEm}=datetime('now','localtime'), updatedat=datetime('now','localtime')
       WHERE ordemid=? AND tipo=?`,
      [status, req.user.id, os.id, tipo]
    );

    res.json({ aviso: projetarAviso(buscarAviso(os.id, tipo)) });
  } catch(e) { next(e); }
});
```

- [ ] **Step 10: Run route tests and verify GREEN**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- routeContracts.test.js whatsappAvisosRoutes.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

Run:

```powershell
git add backend/routes/ordens.js backend/__tests__/routeContracts.test.js backend/__tests__/whatsappAvisosRoutes.test.js
git commit -m "feat: add whatsapp notice endpoints"
```

---

## Task 4: Frontend WhatsApp URL Helper

**Owner:** Frontend helper worker. Do not edit `Oficina.jsx` in this task.

**Files:**
- Create: `frontend/src/utils/whatsappOficina.js`
- Test: `backend/__tests__/whatsappOficinaUrl.test.js`

- [ ] **Step 1: Write the failing URL-helper test**

Create `backend/__tests__/whatsappOficinaUrl.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';

const helper = await import('../../frontend/src/utils/whatsappOficina.js');

describe('whatsappOficina frontend helper', () => {
  it('builds a fixed WhatsApp Web URL and never uses api.whatsapp.com or wa.me', () => {
    const url = helper.buildWhatsappWebUrl({
      phone: '5531999990000',
      text: 'Ola Maria\nOS-0001',
    });

    expect(url).toMatch(/^https:\/\/web\.whatsapp\.com\/send\?/);
    expect(url).toContain('phone=5531999990000');
    expect(url).toContain('text=Ola%20Maria%0AOS-0001');
    expect(url).not.toContain('api.whatsapp.com');
    expect(url).not.toContain('wa.me');
  });

  it('opens using the fixed named target so the browser can reuse the tab', () => {
    const opener = vi.fn(() => ({}));

    const ok = helper.openWhatsappConversation({
      phone: '5531999990000',
      text: 'Mensagem',
    }, opener);

    expect(ok).toBe(true);
    expect(opener).toHaveBeenCalledWith(
      'https://web.whatsapp.com/send?phone=5531999990000&text=Mensagem',
      'sistema_whatsapp'
    );
  });

  it('returns false when phone is missing or popup is blocked', () => {
    expect(helper.openWhatsappConversation({ phone: '', text: 'Mensagem' }, vi.fn())).toBe(false);
    expect(helper.openWhatsappConversation({ phone: '5531999990000', text: 'Mensagem' }, vi.fn(() => null))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the URL-helper test and verify RED**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappOficinaUrl.test.js
```

Expected: FAIL because `frontend/src/utils/whatsappOficina.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/utils/whatsappOficina.js`:

```js
export const WHATSAPP_TARGET = 'sistema_whatsapp';

export function buildWhatsappWebUrl({ phone, text }) {
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  if (!normalizedPhone) return null;
  return `https://web.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(String(text || ''))}`;
}

export function openWhatsappConversation(payload, opener = window.open) {
  const url = buildWhatsappWebUrl(payload || {});
  if (!url) return false;

  // Named target is intentional: it lets the browser reuse the WhatsApp tab created by the system.
  const opened = opener(url, WHATSAPP_TARGET);
  return Boolean(opened);
}
```

- [ ] **Step 4: Run the URL-helper test and verify GREEN**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappOficinaUrl.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add frontend/src/utils/whatsappOficina.js backend/__tests__/whatsappOficinaUrl.test.js
git commit -m "feat: add fixed whatsapp web opener"
```

---

## Task 5: Oficina UI Integration

**Owner:** Frontend UI worker. You may edit `frontend/src/pages/Oficina.jsx` only, plus add no new dependencies.

**Files:**
- Modify: `frontend/src/pages/Oficina.jsx`

- [ ] **Step 1: Add imports and state**

Update imports:

```js
import { toast } from 'react-hot-toast';
import { openWhatsappConversation } from '../utils/whatsappOficina';
```

Add state inside `Oficina()`:

```js
  const [whatsappMenu, setWhatsappMenu] = useState(null);
  const [openingAviso, setOpeningAviso] = useState(null);
```

- [ ] **Step 2: Add menu cleanup**

Add after existing effects:

```js
  useEffect(() => {
    if (!whatsappMenu) return undefined;
    const close = () => setWhatsappMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [whatsappMenu]);
```

- [ ] **Step 3: Add immutable row-update helper**

Add:

```js
  const updateAvisoLocal = useCallback((ordemId, aviso) => {
    if (!aviso) return;
    setOrdens(current => current.map(ordem => {
      if (String(ordem.id) !== String(ordemId)) return ordem;
      const whatsappAvisos = {
        ...(ordem.whatsappAvisos || {}),
        [aviso.tipo]: aviso,
      };
      const atualPrincipal = ordem.whatsappAvisoPrincipal;
      const whatsappAvisoPrincipal =
        atualPrincipal?.tipo === aviso.tipo || !atualPrincipal
          ? aviso
          : atualPrincipal;
      return { ...ordem, whatsappAvisos, whatsappAvisoPrincipal };
    }));
  }, []);
```

- [ ] **Step 4: Add copy fallback helper**

Add:

```js
  const copiarMensagem = useCallback(async (text) => {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensagem copiada');
      return true;
    } catch {
      toast.error('Nao foi possivel copiar a mensagem');
      return false;
    }
  }, []);
```

- [ ] **Step 5: Add open handler**

Add:

```js
  const abrirAvisoWhatsapp = useCallback(async (e, ordem, aviso) => {
    e.preventDefault();
    e.stopPropagation();
    if (!aviso?.tipo || openingAviso) return;

    setOpeningAviso(`${ordem.id}:${aviso.tipo}`);
    try {
      const { data } = await api.post(`/ordens/${ordem.id}/whatsapp-avisos/${aviso.tipo}/abrir`);
      updateAvisoLocal(ordem.id, data.aviso);
      if (!data.whatsapp?.phone) {
        toast.error('Cliente sem telefone cadastrado');
        await copiarMensagem(data.whatsapp?.text);
        return;
      }
      const opened = openWhatsappConversation(data.whatsapp);
      if (!opened) {
        toast.error('Permita pop-ups para abrir o WhatsApp');
        await copiarMensagem(data.whatsapp.text);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao abrir WhatsApp');
    } finally {
      setOpeningAviso(null);
    }
  }, [copiarMensagem, openingAviso, updateAvisoLocal]);
```

- [ ] **Step 6: Add mark handler**

Add:

```js
  const marcarAvisoWhatsapp = useCallback(async (e, ordem, aviso, status) => {
    e.preventDefault();
    e.stopPropagation();
    setWhatsappMenu(null);
    try {
      const { data } = await api.patch(`/ordens/${ordem.id}/whatsapp-avisos/${aviso.tipo}/status`, { status });
      updateAvisoLocal(ordem.id, data.aviso);
      toast.success(status === 'enviado' ? 'Aviso marcado como enviado' : 'Aviso ignorado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar aviso');
    }
  }, [updateAvisoLocal]);
```

- [ ] **Step 7: Add the tag component above `return`**

Add inside `Oficina()` before `if (loading)`:

```js
  const WhatsappAvisoTag = ({ ordem }) => {
    const aviso = ordem.whatsappAvisoPrincipal;
    if (!aviso) return null;

    const isDone = ['enviado', 'ignorado'].includes(aviso.status);
    const label = aviso.tipo === 'pedido_pronto'
      ? aviso.status === 'enviado' ? 'Avisado' : aviso.status === 'aberto' ? 'Aberto' : 'Avisar pronto'
      : aviso.status === 'enviado' ? 'Confirmado' : aviso.status === 'aberto' ? 'Aberto' : 'Confirmar';
    const key = `${ordem.id}:${aviso.tipo}`;
    const busy = openingAviso === key;

    const openMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setWhatsappMenu({
        x: event.clientX,
        y: event.clientY,
        ordem,
        aviso,
      });
    };

    return (
      <span
        onClick={isDone ? (e) => e.stopPropagation() : (e) => abrirAvisoWhatsapp(e, ordem, aviso)}
        onContextMenu={openMenu}
        title={isDone ? label : 'Clique para abrir WhatsApp. Clique direito para marcar.'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 9,
          fontWeight: 800,
          color: isDone ? 'var(--color-text-faint)' : '#22C55E',
          background: isDone ? 'rgba(255,255,255,0.05)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${isDone ? 'var(--color-border)' : 'rgba(34,197,94,0.35)'}`,
          borderRadius: 'var(--radius-full)',
          padding: '1px 5px',
          cursor: isDone ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Abrindo...' : label}
        {!isDone && (
          <button
            type="button"
            onClick={(e) => marcarAvisoWhatsapp(e, ordem, aviso, 'enviado')}
            title={aviso.tipo === 'pedido_pronto' ? 'Marcar avisado' : 'Marcar confirmado'}
            style={{
              width: 14,
              height: 14,
              border: 'none',
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.2)',
              color: '#22C55E',
              fontSize: 10,
              lineHeight: '14px',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ✓
          </button>
        )}
      </span>
    );
  };
```

- [ ] **Step 8: Render the tag in Kanban cards**

In the Kanban line that currently renders `URGENTE` and `servico`, insert before the service badge:

```jsx
                              <WhatsappAvisoTag ordem={o} />
```

- [ ] **Step 9: Render the tag in list mode without adding a wide column**

In the `Cliente` table cell, replace the one-line content with:

```jsx
                        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                          <span>{o.clientenome}</span>
                          <WhatsappAvisoTag ordem={o} />
                        </div>
```

- [ ] **Step 10: Render the compact context menu**

Inside the top-level returned `<div>`, after the header or before closing the outermost div, render:

```jsx
      {whatsappMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: whatsappMenu.y,
            left: whatsappMenu.x,
            zIndex: 1000,
            background: 'var(--color-surface-offset)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            padding: 4,
          }}
        >
          <button
            type="button"
            onClick={(e) => marcarAvisoWhatsapp(e, whatsappMenu.ordem, whatsappMenu.aviso, 'enviado')}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text)',
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {whatsappMenu.aviso.tipo === 'pedido_pronto' ? 'Marcar avisado' : 'Marcar confirmado'}
          </button>
        </div>
      )}
```

- [ ] **Step 11: Run frontend build**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\frontend
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 12: Commit Task 5**

Run:

```powershell
git add frontend/src/pages/Oficina.jsx
git commit -m "feat: show whatsapp notices in oficina"
```

---

## Task 6: Security Regression And Full Verification

**Owner:** Verification/review worker. Do not introduce new feature scope in this task.

**Files:**
- Modify only if a verification failure proves a bug in the implemented scope.

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappAvisosRules.test.js whatsappAvisosSchema.test.js whatsappAvisosRoutes.test.js whatsappOficinaUrl.test.js routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full backend tests**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\frontend
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Run security checklist against the diff**

Verify manually from the diff:

- New open/mark routes use `auth(["admin","caixa","oficina"])`.
- `oficina` cannot use `confirmacao_pedido`.
- Backend ignores body-supplied `telefone`, `mensagem`, `saldo`, `cliente`, and `status` on open.
- Frontend helper only builds `https://web.whatsapp.com/send`.
- No `api.whatsapp.com` or `wa.me` is used in the new Oficina flow.
- No `dangerouslySetInnerHTML`.
- `maybeNotifyPronto` does not call `sendWhatsApp`.
- `GET /api/ordens` and `GET /api/ordens/:id` redact financial fields for `oficina`.

- [ ] **Step 5: Visual smoke test**

Start the frontend and backend if they are not running, open `/oficina`, and verify:

- Cards show at most one compact WhatsApp tag.
- Tag does not overlap service/urgent/status controls.
- Left-click on a pending tag opens or reuses a named WhatsApp Web tab.
- Right-click opens the compact menu.
- Marking as sent changes the tag to `Confirmado` or `Avisado`.

- [ ] **Step 6: Commit verification fixes if needed**

If fixes were needed:

```powershell
git add <changed-files>
git commit -m "fix: harden whatsapp notice flow"
```

If no fixes were needed, do not create an empty commit.

---

## Execution Strategy With Subagents

Run tasks sequentially with fresh workers because several tasks depend on earlier files. Use separate agents for implementation and review at each checkpoint:

1. Worker A implements Task 1; Reviewer A checks rule/spec/security.
2. Worker B implements Task 2; Reviewer B checks schema/idempotency.
3. Worker C implements Task 3; Reviewer C checks backend route security and no frontend trust.
4. Worker D implements Task 4; Reviewer D checks URL/open-tab safety.
5. Worker E implements Task 5; Reviewer E checks UI density, no hidden security assumptions, and build.
6. Final reviewer checks the complete diff for vulnerabilities and regressions.

Do not dispatch parallel implementation workers that edit overlapping files. Parallel review/exploration is allowed only when it does not write files.

---

## Self-Review Notes

- Spec coverage: persisted notice states, fixed WhatsApp Web tab, context-menu mark action, backend-owned message/phone, fallback copy, and no automatic WhatsApp server session are covered.
- Security coverage: explicit route roles, backend data derivation, financial redaction for `oficina`, whitelist type/status, transition validation, fixed URL host, and removal of automatic Meta send are covered.
- Test coverage: rule tests, schema contract, route behavior, route authorization contract, URL-helper test, full backend suite, frontend build, and visual smoke test are covered.
