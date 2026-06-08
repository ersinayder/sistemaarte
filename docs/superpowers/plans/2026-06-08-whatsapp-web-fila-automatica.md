# WhatsApp Web Fila Automatica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent WhatsApp notice queue that sends low-volume OS notices through a local WhatsApp Web provider and retries automatically after reconnects.

**Architecture:** Express remains the owner of OS rules, notice creation, queue state, and retries. A provider adapter calls a local HTTP service such as Evolution API/Baileys, while a lightweight backend worker polls `whatsapp_avisos` and marks notices as sent, waiting for reconnection when the provider is offline.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, Vitest 4.1, React 18, Vite 8, TailwindCSS.

---

## File Structure

- Modify: `backend/database.js`
  - Add `ALTER TABLE ADD COLUMN` migrations for automatic queue fields on `whatsapp_avisos`.
- Modify: `backend/domain/whatsappConfigRules.js`
  - Accept provider `web_local`, validate local provider settings, expose sanitized public config.
- Modify: `backend/utils/whatsappConfig.js`
  - Resolve `web_local` runtime settings from database or environment.
- Create: `backend/domain/whatsappQueueRules.js`
  - Pure rules for queue status, retry backoff, and send eligibility.
- Create: `backend/utils/whatsappQueue.js`
  - SQLite access layer for claiming, updating, and requeueing notices.
- Create: `backend/utils/whatsappWebProvider.js`
  - HTTP adapter for local provider status and send calls.
- Create: `backend/utils/whatsappWorker.js`
  - Polling worker with single-process guard and retry behavior.
- Modify: `backend/routes/ordens.js`
  - Enqueue notices with message and phone snapshots at creation and `Pronto` transition.
- Modify: `backend/routes/configuracoes.js`
  - Add status endpoint for WhatsApp Web local provider.
- Modify: `backend/server.js`
  - Start the worker after `initDB()` when enabled.
- Modify: `frontend/src/pages/Configuracoes.jsx`
  - Add provider option and fields/status for WhatsApp Web local.
- Test: `backend/__tests__/whatsappQueueRules.test.js`
- Test: `backend/__tests__/whatsappWebProvider.test.js`
- Test: `backend/__tests__/whatsappWorker.test.js`
- Test: extend `backend/__tests__/whatsappConfigRules.test.js`
- Test: extend `backend/__tests__/whatsappAvisosRoutes.test.js`
- Test: extend `backend/__tests__/whatsappAvisosSchema.test.js`

---

### Task 1: Queue Schema and Pure Rules

**Files:**
- Modify: `backend/database.js`
- Create: `backend/domain/whatsappQueueRules.js`
- Test: `backend/__tests__/whatsappAvisosSchema.test.js`
- Test: `backend/__tests__/whatsappQueueRules.test.js`

- [ ] **Step 1: Write the failing schema test**

Add assertions to `backend/__tests__/whatsappAvisosSchema.test.js`:

```js
it('includes automatic queue fields for whatsapp avisos', () => {
  const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

  expect(source).toMatch(/canal\s+TEXT/);
  expect(source).toMatch(/auto_status\s+TEXT/);
  expect(source).toMatch(/tentativas\s+INTEGER/);
  expect(source).toMatch(/next_attempt_at\s+TEXT/);
  expect(source).toMatch(/last_error\s+TEXT/);
  expect(source).toMatch(/provider_message_id\s+TEXT/);
  expect(source).toMatch(/idx_whatsapp_avisos_auto_status/);
});
```

- [ ] **Step 2: Write the failing pure-rules test**

Create `backend/__tests__/whatsappQueueRules.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  AVISO_AUTO_STATUS,
  calcularProximaTentativa,
  normalizarAutoStatus,
  podeProcessarAvisoAutomatico,
  resumirErroEnvio,
} from '../domain/whatsappQueueRules.js';

describe('whatsappQueueRules', () => {
  it('normalizes queue statuses and rejects unknown values', () => {
    expect(AVISO_AUTO_STATUS).toContain('aguardando_conexao');
    expect(normalizarAutoStatus(' ERRO ')).toBe('erro');
    expect(normalizarAutoStatus('qualquer')).toBeNull();
  });

  it('selects only notices that can be processed automatically', () => {
    expect(podeProcessarAvisoAutomatico({ status: 'pendente', auto_status: 'pendente' })).toBe(true);
    expect(podeProcessarAvisoAutomatico({ status: 'aberto', auto_status: 'pendente' })).toBe(false);
    expect(podeProcessarAvisoAutomatico({ status: 'enviado', auto_status: 'pendente' })).toBe(false);
    expect(podeProcessarAvisoAutomatico({ status: 'pendente', auto_status: 'enviando' })).toBe(false);
  });

  it('calculates capped retry backoff in seconds', () => {
    expect(calcularProximaTentativa(0)).toBe(30);
    expect(calcularProximaTentativa(1)).toBe(60);
    expect(calcularProximaTentativa(5)).toBe(960);
    expect(calcularProximaTentativa(12)).toBe(1800);
  });

  it('trims provider errors for storage', () => {
    expect(resumirErroEnvio('x'.repeat(900))).toHaveLength(500);
    expect(resumirErroEnvio(null)).toBe('Erro desconhecido no envio do WhatsApp');
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
cd backend
npm.cmd test -- whatsappAvisosSchema.test.js whatsappQueueRules.test.js
```

Expected: FAIL because `whatsappQueueRules.js` and schema fields do not exist.

- [ ] **Step 4: Add schema fields**

In both the main schema and the `migrations[]` array in `backend/database.js`, add columns using `ALTER TABLE ADD COLUMN`:

```sql
ALTER TABLE whatsapp_avisos ADD COLUMN canal TEXT DEFAULT 'manual'
ALTER TABLE whatsapp_avisos ADD COLUMN auto_status TEXT DEFAULT 'pendente'
ALTER TABLE whatsapp_avisos ADD COLUMN tentativas INTEGER DEFAULT 0
ALTER TABLE whatsapp_avisos ADD COLUMN next_attempt_at TEXT
ALTER TABLE whatsapp_avisos ADD COLUMN last_error TEXT
ALTER TABLE whatsapp_avisos ADD COLUMN provider_message_id TEXT
CREATE INDEX IF NOT EXISTS idx_whatsapp_avisos_auto_status ON whatsapp_avisos(auto_status, next_attempt_at)
```

For the `CREATE TABLE IF NOT EXISTS whatsapp_avisos` definitions, include:

```sql
canal               TEXT DEFAULT 'manual',
auto_status         TEXT DEFAULT 'pendente',
tentativas          INTEGER DEFAULT 0,
next_attempt_at     TEXT,
last_error          TEXT,
provider_message_id TEXT,
```

- [ ] **Step 5: Implement pure rules**

Create `backend/domain/whatsappQueueRules.js`:

```js
const AVISO_AUTO_STATUS = ['pendente', 'enviando', 'aguardando_conexao', 'erro', 'enviado'];

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizarAutoStatus(value) {
  const status = clean(value, 40).toLowerCase();
  return AVISO_AUTO_STATUS.includes(status) ? status : null;
}

function podeProcessarAvisoAutomatico(aviso = {}) {
  const statusManual = clean(aviso.status || 'pendente', 40).toLowerCase();
  const autoStatus = normalizarAutoStatus(aviso.auto_status || 'pendente');
  return statusManual === 'pendente' && ['pendente', 'erro', 'aguardando_conexao'].includes(autoStatus);
}

function calcularProximaTentativa(tentativas = 0) {
  const attempts = Math.max(0, Number(tentativas || 0));
  return Math.min(1800, 30 * (2 ** attempts));
}

function resumirErroEnvio(err) {
  const raw = typeof err === 'string' ? err : err?.message;
  return clean(raw || 'Erro desconhecido no envio do WhatsApp', 500);
}

module.exports = {
  AVISO_AUTO_STATUS,
  normalizarAutoStatus,
  podeProcessarAvisoAutomatico,
  calcularProximaTentativa,
  resumirErroEnvio,
};
```

- [ ] **Step 6: Run tests**

Run:

```powershell
cd backend
npm.cmd test -- whatsappAvisosSchema.test.js whatsappQueueRules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/database.js backend/domain/whatsappQueueRules.js backend/__tests__/whatsappAvisosSchema.test.js backend/__tests__/whatsappQueueRules.test.js
git commit -m "feat: add whatsapp notice queue schema"
```

---

### Task 2: Queue Repository and Enqueue Hooks

**Files:**
- Create: `backend/utils/whatsappQueue.js`
- Modify: `backend/routes/ordens.js`
- Test: `backend/__tests__/whatsappAvisosRoutes.test.js`

- [ ] **Step 1: Write failing route tests**

Extend `backend/__tests__/whatsappAvisosRoutes.test.js` with:

```js
it('stores automatic queue fields when opening a manual notice', async () => {
  db.getOne
    .mockReturnValueOnce(ordem)
    .mockReturnValueOnce(null)
    .mockReturnValueOnce({ id: 456, ordemid: 77, tipo: 'pedido_pronto', status: 'aberto', auto_status: 'pendente' });

  const handler = businessHandler('post', '/:id/whatsapp-avisos/:tipo/abrir');
  const res = makeRes();

  await handler({
    params: { id: '77', tipo: 'pedido_pronto' },
    user: { id: 9, role: 'caixa' },
    body: {},
  }, res, vi.fn());

  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('canal'), expect.arrayContaining([
    77,
    'pedido_pronto',
    '5531999990000',
  ]));
});

it('enqueues pedido pronto instead of calling direct unstable sender', async () => {
  db.getOne
    .mockReturnValueOnce({ status: 'Em Produção' })
    .mockReturnValueOnce({ ...ordem, status: 'Pronto' });

  const handler = businessHandler('patch', '/:id/status');
  const res = makeRes();
  const next = vi.fn();

  await handler({
    params: { id: '77' },
    body: { status: 'Pronto' },
    user: { id: 9, role: 'caixa' },
  }, res, next);

  if (next.mock.calls.length) throw next.mock.calls[0][0];
  expect(whatsappMock.sendWhatsApp).not.toHaveBeenCalled();
  expect(db.run).toHaveBeenCalledWith(expect.stringContaining('whatsapp_avisos'), expect.arrayContaining([77, 'pedido_pronto']));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd backend
npm.cmd test -- whatsappAvisosRoutes.test.js
```

Expected: FAIL because queue fields are not written by route helpers.

- [ ] **Step 3: Create queue utility**

Create `backend/utils/whatsappQueue.js`:

```js
const { getAll, getOne, run } = require('../database');
const { calcularProximaTentativa, resumirErroEnvio } = require('../domain/whatsappQueueRules');

function marcarAvisoParaEnvio({ ordemId, tipo, phone, text, canal = 'web_local' }) {
  run(
    `INSERT INTO whatsapp_avisos
       (ordemid, tipo, status, telefone_snapshot, mensagem_snapshot, canal, auto_status, tentativas, next_attempt_at, updatedat)
     VALUES (?, ?, 'pendente', ?, ?, ?, 'pendente', 0, datetime('now','localtime'), datetime('now','localtime'))
     ON CONFLICT(ordemid, tipo) DO UPDATE SET
       telefone_snapshot=COALESCE(excluded.telefone_snapshot, whatsapp_avisos.telefone_snapshot),
       mensagem_snapshot=COALESCE(excluded.mensagem_snapshot, whatsapp_avisos.mensagem_snapshot),
       canal=CASE WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.canal ELSE excluded.canal END,
       auto_status=CASE WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.auto_status ELSE 'pendente' END,
       next_attempt_at=CASE WHEN whatsapp_avisos.status IN ('enviado','ignorado') THEN whatsapp_avisos.next_attempt_at ELSE datetime('now','localtime') END,
       updatedat=datetime('now','localtime')`,
    [ordemId, tipo, phone, text, canal]
  );
}

function buscarAvisoFila(id) {
  return getOne(`SELECT * FROM whatsapp_avisos WHERE id=? LIMIT 1`, [id]);
}

function listarAvisosElegiveis(limit = 5) {
  return getAll(
    `SELECT * FROM whatsapp_avisos
     WHERE canal='web_local'
       AND status='pendente'
       AND auto_status IN ('pendente','erro','aguardando_conexao')
       AND telefone_snapshot IS NOT NULL
       AND mensagem_snapshot IS NOT NULL
       AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now','localtime'))
     ORDER BY COALESCE(next_attempt_at, createdat), id
     LIMIT ?`,
    [limit]
  );
}

function tentarClaimAviso(id) {
  const result = run(
    `UPDATE whatsapp_avisos
     SET auto_status='enviando', updatedat=datetime('now','localtime')
     WHERE id=?
       AND canal='web_local'
       AND status='pendente'
       AND auto_status IN ('pendente','erro','aguardando_conexao')`,
    [id]
  );
  return result.changes === 1;
}

function marcarAguardandoConexao(id, erro) {
  run(
    `UPDATE whatsapp_avisos
     SET auto_status='aguardando_conexao',
         last_error=?,
         next_attempt_at=datetime('now','localtime','+30 seconds'),
         updatedat=datetime('now','localtime')
     WHERE id=?`,
    [resumirErroEnvio(erro), id]
  );
}

function marcarErroTemporario(id, erro, tentativas) {
  const seconds = calcularProximaTentativa(tentativas);
  run(
    `UPDATE whatsapp_avisos
     SET auto_status='erro',
         tentativas=?,
         last_error=?,
         next_attempt_at=datetime('now','localtime', ?),
         updatedat=datetime('now','localtime')
     WHERE id=?`,
    [tentativas, resumirErroEnvio(erro), `+${seconds} seconds`, id]
  );
}

function marcarEnviado(id, providerMessageId = null) {
  run(
    `UPDATE whatsapp_avisos
     SET status='enviado',
         auto_status='enviado',
         provider_message_id=?,
         enviado_em=datetime('now','localtime'),
         updatedat=datetime('now','localtime')
     WHERE id=?`,
    [providerMessageId, id]
  );
}

module.exports = {
  marcarAvisoParaEnvio,
  buscarAvisoFila,
  listarAvisosElegiveis,
  tentarClaimAviso,
  marcarAguardandoConexao,
  marcarErroTemporario,
  marcarEnviado,
};
```

- [ ] **Step 4: Use queue utility from routes**

In `backend/routes/ordens.js`, import:

```js
const { marcarAvisoParaEnvio } = require("../utils/whatsappQueue");
```

In `garantirAvisoPendente`, keep the insert compatible:

```js
function garantirAvisoPendente(ordemId, tipo) {
  run(
    `INSERT OR IGNORE INTO whatsapp_avisos (ordemid, tipo, status, auto_status, updatedat)
     VALUES (?, ?, 'pendente', 'pendente', datetime('now','localtime'))`,
    [ordemId, tipo]
  );
}
```

In `maybeNotifyPronto`, after `garantirAvisoPronto`, fetch the OS with `buscarOrdemAviso`, build the message with `montarMensagemAviso`, normalize the phone, and call:

```js
marcarAvisoParaEnvio({
  ordemId: os.id,
  tipo: 'pedido_pronto',
  phone,
  text: message.text,
  canal: 'web_local',
});
```

When creating an OS and calling `garantirAvisoPendente(id, 'confirmacao_pedido')`, also enqueue a confirmation using the created OS data and `montarMensagemAviso`.

- [ ] **Step 5: Preserve manual open behavior**

In `salvarAvisoAberto`, add queue columns but keep `status='aberto'`, so the automatic worker ignores a conversation the operator opened manually:

```sql
canal='manual',
auto_status='pendente',
```

- [ ] **Step 6: Run tests**

Run:

```powershell
cd backend
npm.cmd test -- whatsappAvisosRoutes.test.js whatsappQueueRules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/routes/ordens.js backend/utils/whatsappQueue.js backend/__tests__/whatsappAvisosRoutes.test.js
git commit -m "feat: enqueue whatsapp notices"
```

---

### Task 3: Local WhatsApp Web Provider Adapter

**Files:**
- Create: `backend/utils/whatsappWebProvider.js`
- Test: `backend/__tests__/whatsappWebProvider.test.js`

- [ ] **Step 1: Write failing provider tests**

Create `backend/__tests__/whatsappWebProvider.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWhatsappWebProvider } from '../utils/whatsappWebProvider.js';

describe('whatsappWebProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports connected status from a local provider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ instance: { state: 'open' } }),
    });

    const provider = createWhatsappWebProvider({ baseUrl: 'http://127.0.0.1:8080', instance: 'loja' });
    await expect(provider.getStatus()).resolves.toEqual({ connected: true, state: 'open', qr: null });
  });

  it('sends text messages to the local provider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: { id: 'MSG1' } }),
    });

    const provider = createWhatsappWebProvider({ baseUrl: 'http://127.0.0.1:8080', instance: 'loja', apiKey: 'secret' });
    await expect(provider.sendText({ phone: '5531999990000', text: 'Oi' })).resolves.toEqual({ ok: true, messageId: 'MSG1' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/message/sendText/loja',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'secret' }),
      })
    );
  });

  it('throws a readable error for provider failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'offline',
    });

    const provider = createWhatsappWebProvider({ baseUrl: 'http://127.0.0.1:8080', instance: 'loja' });
    await expect(provider.sendText({ phone: '5531999990000', text: 'Oi' })).rejects.toThrow('WhatsApp provider HTTP 503: offline');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd backend
npm.cmd test -- whatsappWebProvider.test.js
```

Expected: FAIL because the provider file does not exist.

- [ ] **Step 3: Implement provider adapter**

Create `backend/utils/whatsappWebProvider.js`:

```js
function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeState(payload = {}) {
  const state = payload.instance?.state || payload.state || payload.status || 'unknown';
  return {
    connected: ['open', 'connected', 'CONNECTED'].includes(state),
    state,
    qr: payload.qrcode || payload.qr || null,
  };
}

function createWhatsappWebProvider({ baseUrl, instance, apiKey = '', timeoutMs = 10000 }) {
  const root = trimSlash(baseUrl);
  const instanceName = String(instance || '').trim();

  if (!root || !instanceName) {
    throw new Error('WhatsApp Web provider requires baseUrl and instance');
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(apiKey ? { apikey: apiKey } : {}),
        ...(options.headers || {}),
      };
      const res = await fetch(`${root}${path}`, { ...options, headers, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`WhatsApp provider HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json().catch(() => ({}));
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('WhatsApp provider timeout');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getStatus() {
      const data = await request(`/instance/connectionState/${instanceName}`, { method: 'GET' });
      return normalizeState(data);
    },
    async sendText({ phone, text }) {
      const data = await request(`/message/sendText/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ number: phone, text }),
      });
      return { ok: true, messageId: data.key?.id || data.messageId || data.id || null };
    },
  };
}

module.exports = { createWhatsappWebProvider, normalizeState };
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd backend
npm.cmd test -- whatsappWebProvider.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/utils/whatsappWebProvider.js backend/__tests__/whatsappWebProvider.test.js
git commit -m "feat: add whatsapp web provider adapter"
```

---

### Task 4: Worker Processing and Retry

**Files:**
- Create: `backend/utils/whatsappWorker.js`
- Test: `backend/__tests__/whatsappWorker.test.js`

- [ ] **Step 1: Write failing worker tests**

Create `backend/__tests__/whatsappWorker.test.js` with mocked queue functions:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const queue = {
  listarAvisosElegiveis: vi.fn(),
  tentarClaimAviso: vi.fn(),
  marcarAguardandoConexao: vi.fn(),
  marcarErroTemporario: vi.fn(),
  marcarEnviado: vi.fn(),
};

const require = createRequire(import.meta.url);
require.cache[require.resolve('../utils/whatsappQueue.js')] = {
  id: require.resolve('../utils/whatsappQueue.js'),
  filename: require.resolve('../utils/whatsappQueue.js'),
  loaded: true,
  exports: queue,
};

const { createWhatsappWorker } = await import('../utils/whatsappWorker.js');

describe('whatsappWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue.listarAvisosElegiveis.mockReturnValue([]);
    queue.tentarClaimAviso.mockReturnValue(true);
  });

  it('leaves notices queued when provider is disconnected', async () => {
    queue.listarAvisosElegiveis.mockReturnValueOnce([{ id: 1, telefone_snapshot: '5531999990000', mensagem_snapshot: 'Oi', tentativas: 0 }]);
    const provider = {
      getStatus: vi.fn().mockResolvedValue({ connected: false, state: 'close' }),
      sendText: vi.fn(),
    };

    const worker = createWhatsappWorker({ provider, intervalMs: 1000, batchSize: 5 });
    await worker.tick();

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(queue.marcarAguardandoConexao).toHaveBeenCalledWith(1, 'Sessao WhatsApp desconectada: close');
  });

  it('marks notice sent when provider sends successfully', async () => {
    queue.listarAvisosElegiveis.mockReturnValueOnce([{ id: 2, telefone_snapshot: '5531999990000', mensagem_snapshot: 'Oi', tentativas: 0 }]);
    const provider = {
      getStatus: vi.fn().mockResolvedValue({ connected: true, state: 'open' }),
      sendText: vi.fn().mockResolvedValue({ ok: true, messageId: 'MSG2' }),
    };

    const worker = createWhatsappWorker({ provider, intervalMs: 1000, batchSize: 5 });
    await worker.tick();

    expect(provider.sendText).toHaveBeenCalledWith({ phone: '5531999990000', text: 'Oi' });
    expect(queue.marcarEnviado).toHaveBeenCalledWith(2, 'MSG2');
  });

  it('records temporary errors with incremented attempts', async () => {
    queue.listarAvisosElegiveis.mockReturnValueOnce([{ id: 3, telefone_snapshot: '5531999990000', mensagem_snapshot: 'Oi', tentativas: 4 }]);
    const provider = {
      getStatus: vi.fn().mockResolvedValue({ connected: true, state: 'open' }),
      sendText: vi.fn().mockRejectedValue(new Error('network down')),
    };

    const worker = createWhatsappWorker({ provider, intervalMs: 1000, batchSize: 5 });
    await worker.tick();

    expect(queue.marcarErroTemporario).toHaveBeenCalledWith(3, expect.any(Error), 5);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd backend
npm.cmd test -- whatsappWorker.test.js
```

Expected: FAIL because the worker file does not exist.

- [ ] **Step 3: Implement worker**

Create `backend/utils/whatsappWorker.js`:

```js
const {
  listarAvisosElegiveis,
  tentarClaimAviso,
  marcarAguardandoConexao,
  marcarErroTemporario,
  marcarEnviado,
} = require('./whatsappQueue');

function createWhatsappWorker({ provider, intervalMs = 15000, batchSize = 5, logger = console }) {
  let timer = null;
  let running = false;

  async function processAviso(aviso) {
    if (!tentarClaimAviso(aviso.id)) return;

    const status = await provider.getStatus();
    if (!status.connected) {
      marcarAguardandoConexao(aviso.id, `Sessao WhatsApp desconectada: ${status.state}`);
      return;
    }

    try {
      const result = await provider.sendText({
        phone: aviso.telefone_snapshot,
        text: aviso.mensagem_snapshot,
      });
      marcarEnviado(aviso.id, result.messageId || null);
    } catch (err) {
      marcarErroTemporario(aviso.id, err, Number(aviso.tentativas || 0) + 1);
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const avisos = listarAvisosElegiveis(batchSize);
      for (const aviso of avisos) {
        await processAviso(aviso);
      }
    } catch (err) {
      logger.error('[WhatsAppWorker] Falha no ciclo:', err.message);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
    void tick();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick };
}

module.exports = { createWhatsappWorker };
```

- [ ] **Step 4: Run tests**

Run:

```powershell
cd backend
npm.cmd test -- whatsappWorker.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/utils/whatsappWorker.js backend/__tests__/whatsappWorker.test.js
git commit -m "feat: process whatsapp queue"
```

---

### Task 5: Runtime Configuration, Status Route, and Startup

**Files:**
- Modify: `backend/domain/whatsappConfigRules.js`
- Modify: `backend/utils/whatsappConfig.js`
- Modify: `backend/routes/configuracoes.js`
- Modify: `backend/server.js`
- Test: `backend/__tests__/whatsappConfigRules.test.js`

- [ ] **Step 1: Write failing config tests**

Extend `backend/__tests__/whatsappConfigRules.test.js`:

```js
it('accepts web_local provider with local service fields', () => {
  const config = rules.normalizarWhatsappConfig({
    enabled: 1,
    provider: 'web_local',
    webBaseUrl: 'http://127.0.0.1:8080',
    webInstance: 'loja',
    webApiKey: 'secret',
  });

  expect(config.provider).toBe('web_local');
  expect(config.webBaseUrl).toBe('http://127.0.0.1:8080');
  expect(config.webInstance).toBe('loja');
  expect(rules.validarWhatsappConfig(config, {})).toEqual({ ok: true, errors: {} });
});

it('requires local url and instance when web_local is enabled', () => {
  const config = rules.normalizarWhatsappConfig({ enabled: 1, provider: 'web_local' });
  expect(rules.validarWhatsappConfig(config, {}).errors).toEqual({
    webBaseUrl: 'URL local do WhatsApp Web e obrigatoria',
    webInstance: 'Instancia do WhatsApp Web e obrigatoria',
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
cd backend
npm.cmd test -- whatsappConfigRules.test.js
```

Expected: FAIL because `web_local` is not accepted.

- [ ] **Step 3: Add config fields**

In `backend/database.js`, add columns to `whatsapp_config` using migrations:

```sql
ALTER TABLE whatsapp_config ADD COLUMN web_base_url TEXT
ALTER TABLE whatsapp_config ADD COLUMN web_instance TEXT
ALTER TABLE whatsapp_config ADD COLUMN web_api_key TEXT
```

In the `whatsapp_config` table definitions, include the same columns.

- [ ] **Step 4: Extend config rules**

Update `backend/domain/whatsappConfigRules.js`:

```js
const PROVIDERS_VALIDOS = ["meta", "web_local", "manual"];
```

Add normalized fields:

```js
webBaseUrl: cleanText(input.webBaseUrl ?? input.web_base_url, 255),
webInstance: cleanText(input.webInstance ?? input.web_instance, 80),
webApiKey: cleanText(input.webApiKey ?? input.web_api_key, 255),
```

In validation, require Meta fields only when `provider === "meta"` and require web fields only when `provider === "web_local"`:

```js
if (config.enabled && config.provider === "meta") {
  if (!config.phoneId) errors.phoneId = "Phone Number ID e obrigatorio";
  if (!config.token && !tokenConfigurado) errors.token = "Token e obrigatorio";
}

if (config.enabled && config.provider === "web_local") {
  if (!config.webBaseUrl) errors.webBaseUrl = "URL local do WhatsApp Web e obrigatoria";
  if (!config.webInstance) errors.webInstance = "Instancia do WhatsApp Web e obrigatoria";
}
```

- [ ] **Step 5: Persist and resolve web settings**

Update `backend/routes/configuracoes.js` `PUT /whatsapp` SQL to include `web_base_url`, `web_instance`, and `web_api_key`. Preserve existing API key when the submitted value is blank:

```js
const webApiKey = config.webApiKey || atual.web_api_key || null;
```

Update `backend/utils/whatsappConfig.js` selects and return objects with:

```js
webBaseUrl: row.web_base_url || env.WHATSAPP_WEB_BASE_URL || "",
webInstance: row.web_instance || env.WHATSAPP_WEB_INSTANCE || "loja",
webApiKey: row.web_api_key || env.WHATSAPP_WEB_API_KEY || "",
```

- [ ] **Step 6: Add status endpoint**

In `backend/routes/configuracoes.js`, add:

```js
router.get("/whatsapp/web-status", auth(["admin"]), async (_req, res, next) => {
  try {
    const runtime = getWhatsappRuntimeConfig();
    if (runtime.provider !== "web_local" || !runtime.webBaseUrl || !runtime.webInstance) {
      return res.json({ connected: false, state: "not_configured", qr: null });
    }
    const { createWhatsappWebProvider } = require("../utils/whatsappWebProvider");
    const provider = createWhatsappWebProvider({
      baseUrl: runtime.webBaseUrl,
      instance: runtime.webInstance,
      apiKey: runtime.webApiKey,
    });
    res.json(await provider.getStatus());
  } catch (e) { next(e); }
});
```

- [ ] **Step 7: Start worker from server**

In `backend/server.js`, after `initDB()` and before `app.listen`, add guarded startup:

```js
if (process.env.WHATSAPP_WEB_ENABLED === "true") {
  const { getWhatsappRuntimeConfig } = require("./utils/whatsappConfig");
  const { createWhatsappWebProvider } = require("./utils/whatsappWebProvider");
  const { createWhatsappWorker } = require("./utils/whatsappWorker");
  const runtime = getWhatsappRuntimeConfig();
  if (runtime.provider === "web_local" && runtime.enabled && runtime.webBaseUrl && runtime.webInstance) {
    const provider = createWhatsappWebProvider({
      baseUrl: runtime.webBaseUrl,
      instance: runtime.webInstance,
      apiKey: runtime.webApiKey,
    });
    createWhatsappWorker({ provider }).start();
    console.log("[WhatsAppWorker] Fila automatica ativa.");
  }
}
```

- [ ] **Step 8: Run tests**

Run:

```powershell
cd backend
npm.cmd test -- whatsappConfigRules.test.js whatsappWebProvider.test.js whatsappWorker.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add backend/database.js backend/domain/whatsappConfigRules.js backend/utils/whatsappConfig.js backend/routes/configuracoes.js backend/server.js backend/__tests__/whatsappConfigRules.test.js
git commit -m "feat: configure whatsapp web provider"
```

---

### Task 6: Configuration UI

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`

- [ ] **Step 1: Extend empty form state**

In `frontend/src/pages/Configuracoes.jsx`, add to `EMPTY_WHATSAPP`:

```js
webBaseUrl: '',
webInstance: 'loja',
webApiKey: '',
```

In `normalizeLoadedWhatsapp`, map:

```js
webBaseUrl: whatsapp.webBaseUrl || '',
webInstance: whatsapp.webInstance || 'loja',
webApiKey: '',
```

- [ ] **Step 2: Save web fields**

In `saveWhatsapp`, include:

```js
webBaseUrl: whatsappForm.webBaseUrl.trim(),
webInstance: whatsappForm.webInstance.trim(),
webApiKey: whatsappForm.webApiKey.trim(),
```

- [ ] **Step 3: Add provider options**

In the provider select, replace the single option with:

```jsx
<option value="manual">Manual assistido</option>
<option value="meta">Meta Cloud API</option>
<option value="web_local">WhatsApp Web local</option>
```

- [ ] **Step 4: Render provider-specific fields**

For `meta`, show existing Phone Number ID, token, and template fields.

For `web_local`, show:

```jsx
<Field label="URL local" name="webBaseUrl" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField} />
<Field label="Instancia" name="webInstance" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField} />
<Field label="Chave local" name="webApiKey" form={whatsappForm} errors={whatsappErrors} onChange={setWhatsappField}>
  <input id="webApiKey" className="form-input" type="password" value={whatsappForm.webApiKey} onChange={(e) => setWhatsappField('webApiKey', e.target.value)} aria-label="Chave local do WhatsApp Web" />
</Field>
```

Keep template fields visible for `web_local`, because the system still uses local text templates from `montarMensagemAviso()`.

- [ ] **Step 5: Add status refresh**

Add state:

```js
const [whatsappWebStatus, setWhatsappWebStatus] = useState(null);
```

Add loader:

```js
async function loadWhatsappWebStatus() {
  const { data } = await api.get('/configuracoes/whatsapp/web-status');
  setWhatsappWebStatus(data);
}
```

Render a compact status row when `whatsappForm.provider === 'web_local'`:

```jsx
<div className="settings-info-grid">
  <InfoRow label="Sessao" value={whatsappWebStatus?.connected ? 'Conectado' : whatsappWebStatus?.state || 'Nao consultado'} />
  <InfoRow label="Instancia" value={whatsappForm.webInstance || '-'} />
  <button type="button" className="btn btn-secondary" onClick={loadWhatsappWebStatus}>Atualizar status</button>
</div>
```

- [ ] **Step 6: Run frontend build**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: PASS and `dist` generated.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/pages/Configuracoes.jsx
git commit -m "feat: expose whatsapp web settings"
```

---

### Task 7: Full Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused backend tests**

Run:

```powershell
cd backend
npm.cmd test -- whatsappAvisosSchema.test.js whatsappQueueRules.test.js whatsappAvisosRoutes.test.js whatsappConfigRules.test.js whatsappWebProvider.test.js whatsappWorker.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full backend tests**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: clean working tree after the planned commits.
