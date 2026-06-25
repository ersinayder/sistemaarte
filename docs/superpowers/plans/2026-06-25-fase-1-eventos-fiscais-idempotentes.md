# Fase 1 - Eventos Fiscais Idempotentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar CC-e e cancelamento idempotentes, auditaveis e resistentes a timeout, sem alterar a UI.

**Architecture:** Criar regras puras para resultado de evento fiscal, tabelas de tentativas/transicoes de evento e um servico injetavel que orquestra CC-e/cancelamento. As rotas de `backend/routes/nfe.js` continuam validando HTTP e delegam a execucao ao servico.

**Tech Stack:** Node.js 22, CommonJS, Express 4, better-sqlite3, SQLite WAL, Vitest 4.1, nfewizard-io.

---

## File Map

- Create: `backend/domain/nfeEventoRules.js`
  - Estados ativos, classificacao de retorno de CC-e/cancelamento e extracao normalizada de `retEvento`.
- Create: `backend/__tests__/nfeEventoRules.test.js`
  - Testes unitarios das regras puras.
- Modify: `backend/database.js`
  - Schema/migration para `nfe_evento_tentativas` e `nfe_evento_transicoes`.
- Create: `backend/repositories/nfeEventoAttemptRepository.js`
  - Reserva de tentativa ativa e transicoes monotonicas.
- Create: `backend/__tests__/nfeEventoAttemptRepository.test.js`
  - Testes SQLite in-memory de bloqueio, transicao e historico.
- Create: `backend/services/nfeEventoService.js`
  - Orquestracao de timeout, transmissao, classificacao e persistencia atomica.
- Create: `backend/__tests__/nfeEventoService.test.js`
  - Testes de CC-e, cancelamento, timeout, resposta tardia e rollback.
- Modify: `backend/routes/nfe.js`
  - Rotas de CC-e/cancelamento passam a delegar ao servico.
- Modify: `backend/__tests__/routeContracts.test.js`
  - Contratos estruturais sem `guardTimeout` nos eventos fiscais e com servico dedicado.

## Task 1: Regras puras de evento fiscal

**Files:**
- Create: `backend/domain/nfeEventoRules.js`
- Create: `backend/__tests__/nfeEventoRules.test.js`

- [ ] **Step 1: Write failing tests**

Create `backend/__tests__/nfeEventoRules.test.js`:

```js
const {
  classificarResultadoEventoFiscal,
  estadoEventoBloqueiaReenvio,
  extrairRespostaEventoFiscal,
} = require('../domain/nfeEventoRules');

describe('nfeEventoRules', () => {
  it.each(['processando', 'incerto'])('bloqueia reenvio em %s', (status) => {
    expect(estadoEventoBloqueiaReenvio(status)).toBe(true);
  });

  it.each(['autorizado', 'rejeitado', 'falha_local', null, undefined])('nao bloqueia reenvio em %s', (status) => {
    expect(estadoEventoBloqueiaReenvio(status)).toBe(false);
  });

  it.each([
    ['cce', { cStat: '135' }, 'autorizado'],
    ['cancelamento', { cStat: '135' }, 'autorizado'],
    ['cancelamento', { cStat: '155' }, 'autorizado'],
    ['cce', { cStat: '155' }, 'rejeitado'],
    ['cce', { cStat: '573' }, 'rejeitado'],
    ['cancelamento', { cStat: '' }, 'incerto'],
    ['cancelamento', null, 'incerto'],
    ['cancelamento', { timeout: true }, 'incerto'],
  ])('classifica %s %j como %s', (tipo, resposta, esperado) => {
    expect(classificarResultadoEventoFiscal(tipo, resposta)).toBe(esperado);
  });

  it('extrai retEvento de resposta array da nfewizard', () => {
    const resposta = extrairRespostaEventoFiscal([
      { retEvento: { infEvento: { cStat: '135', nProt: '1352601', xMotivo: 'Evento registrado', dhRegEvento: '2026-06-25T08:00:00-03:00' } } },
    ]);
    expect(resposta).toMatchObject({
      cStat: '135',
      protocolo: '1352601',
      motivo: 'Evento registrado',
      dhEvento: '2026-06-25T08:00:00-03:00',
    });
  });

  it('extrai XML fiscal de objeto aninhado', () => {
    const resposta = extrairRespostaEventoFiscal({ xml: '<procEventoNFe />' });
    expect(resposta.xml).toBe('<procEventoNFe />');
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeEventoRules.test.js
```

Expected: FAIL because `backend/domain/nfeEventoRules.js` does not exist.

- [ ] **Step 3: Implement rules**

Create `backend/domain/nfeEventoRules.js`:

```js
'use strict';

const STATUS_ATIVOS = new Set(['processando', 'incerto']);

function estadoEventoBloqueiaReenvio(status) {
  return STATUS_ATIVOS.has(String(status || ''));
}

function extrairXmlFiscal(valor, depth = 0) {
  if (!valor || depth > 5) return null;
  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto.startsWith('<')) return texto;
    if (texto.startsWith('{') || texto.startsWith('[')) {
      try { return extrairXmlFiscal(JSON.parse(texto), depth + 1); } catch (_) { return null; }
    }
    return null;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
    return null;
  }
  if (typeof valor === 'object') {
    for (const key of ['xml', 'xmlRetorno', 'procEventoNFe', 'retEvento']) {
      const xml = extrairXmlFiscal(valor[key], depth + 1);
      if (xml) return xml;
    }
    for (const item of Object.values(valor)) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
  }
  return null;
}

function extrairRespostaEventoFiscal(raw, fallbackDhEvento) {
  const retEvento =
    raw?.[0]?.retEvento?.infEvento ||
    raw?.retEnvEvento?.retEvento?.[0]?.infEvento ||
    raw?.retEvento?.infEvento ||
    raw?.infEvento ||
    raw?.[0] ||
    raw ||
    {};
  return {
    raw,
    cStat: String(retEvento?.cStat || '').trim(),
    protocolo: String(retEvento?.nProt || '').trim(),
    motivo: String(retEvento?.xMotivo || '').trim(),
    dhEvento: retEvento?.dhRegEvento || fallbackDhEvento || new Date().toISOString(),
    xml: extrairXmlFiscal(raw),
  };
}

function classificarResultadoEventoFiscal(tipo, resposta) {
  if (!resposta || resposta.timeout) return 'incerto';
  const cStat = String(resposta.cStat || '').trim();
  if (tipo === 'cancelamento' && (cStat === '135' || cStat === '155')) return 'autorizado';
  if (tipo === 'cce' && cStat === '135') return 'autorizado';
  if (!cStat) return 'incerto';
  return 'rejeitado';
}

module.exports = {
  classificarResultadoEventoFiscal,
  estadoEventoBloqueiaReenvio,
  extrairRespostaEventoFiscal,
  extrairXmlFiscal,
};
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd test -- nfeEventoRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/nfeEventoRules.js backend/__tests__/nfeEventoRules.test.js
git commit -m "test: define regras de evento fiscal"
```

## Task 2: Schema e repositório de tentativas de evento

**Files:**
- Modify: `backend/database.js`
- Create: `backend/repositories/nfeEventoAttemptRepository.js`
- Create: `backend/__tests__/nfeEventoAttemptRepository.test.js`

- [ ] **Step 1: Write failing repository tests**

Create `backend/__tests__/nfeEventoAttemptRepository.test.js` with an in-memory database:

```js
import Database from 'better-sqlite3';
import { describe, expect, it, beforeEach } from 'vitest';
import { createNfeEventoAttemptRepository } from '../repositories/nfeEventoAttemptRepository.js';

const NOW = '2026-06-25T08:00:00.000Z';

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nfe_evento_tentativas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid INTEGER NOT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL DEFAULT 1,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      cstat TEXT,
      motivo TEXT,
      protocolo TEXT,
      payload_json TEXT,
      xml_retorno TEXT,
      erro_local TEXT,
      solicitado_por INTEGER,
      createdat TEXT NOT NULL,
      updatedat TEXT NOT NULL,
      concluido_em TEXT
    );
    CREATE UNIQUE INDEX idx_nfe_evento_tentativa_ativa
      ON nfe_evento_tentativas(chave, tipo, nseqevento)
      WHERE status IN ('processando','incerto');
    CREATE TABLE nfe_evento_transicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tentativaid INTEGER NOT NULL,
      ordemid INTEGER NOT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL,
      status TEXT NOT NULL,
      estado_anterior TEXT,
      estado_novo TEXT,
      cstat TEXT,
      motivo TEXT,
      createdat TEXT NOT NULL
    );
  `);
  return db;
}

describe('nfeEventoAttemptRepository', () => {
  let db;
  let repo;
  beforeEach(() => {
    db = createDb();
    repo = createNfeEventoAttemptRepository(db, { agora: () => NOW });
  });

  it('cria tentativa processando e transicao inicial', () => {
    const tentativa = repo.criar({ ordemId: 7, chave: '35160607500718000196550010000002811000002810', tipo: 'cce', nSeqEvento: 2, usuarioId: 3 });
    expect(tentativa).toMatchObject({ ordemid: 7, tipo: 'cce', nseqevento: 2, status: 'processando' });
    expect(db.prepare('SELECT status, estado_novo FROM nfe_evento_transicoes').get())
      .toMatchObject({ status: 'processando', estado_novo: 'processando' });
  });

  it('bloqueia segunda tentativa ativa para chave tipo e sequencia', () => {
    const input = { ordemId: 7, chave: '35160607500718000196550010000002811000002810', tipo: 'cancelamento', nSeqEvento: 1, usuarioId: 3 };
    repo.criar(input);
    expect(() => repo.criar(input)).toThrowError(expect.objectContaining({ status: 409, code: 'nfe_evento_tentativa_ativa' }));
  });

  it('nao permite regressao de autorizado para rejeitado', () => {
    const tentativa = repo.criar({ ordemId: 7, chave: '35160607500718000196550010000002811000002810', tipo: 'cce', nSeqEvento: 1 });
    repo.transicionar(tentativa.id, 'autorizado', { cStat: '135' });
    expect(() => repo.transicionar(tentativa.id, 'rejeitado', { cStat: '573' }))
      .toThrowError(expect.objectContaining({ code: 'nfe_evento_transicao_invalida' }));
  });

  it('permite nova tentativa depois de rejeicao final', () => {
    const input = { ordemId: 7, chave: '35160607500718000196550010000002811000002810', tipo: 'cce', nSeqEvento: 1 };
    const primeira = repo.criar(input);
    repo.transicionar(primeira.id, 'rejeitado', { cStat: '573' });
    const segunda = repo.criar(input);
    expect(segunda.id).not.toBe(primeira.id);
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test -- nfeEventoAttemptRepository.test.js
```

Expected: FAIL because repository does not exist.

- [ ] **Step 3: Add schema to `backend/database.js`**

Add a statement array near `NFE_EMISSAO_SCHEMA_STATEMENTS`:

```js
const NFE_EVENTO_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS nfe_evento_tentativas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordemid INTEGER NOT NULL,
    chave TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('cce','cancelamento')),
    nseqevento INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('processando','incerto','autorizado','rejeitado','falha_local')),
    cstat TEXT,
    motivo TEXT,
    protocolo TEXT,
    payload_json TEXT,
    xml_retorno TEXT,
    erro_local TEXT,
    solicitado_por INTEGER,
    createdat TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updatedat TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    concluido_em TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_nfe_evento_tentativa_ativa
    ON nfe_evento_tentativas(chave, tipo, nseqevento)
    WHERE status IN ('processando','incerto')`,
  `CREATE INDEX IF NOT EXISTS idx_nfe_evento_tentativas_chave
    ON nfe_evento_tentativas(chave, tipo, createdat DESC)`,
  `CREATE TABLE IF NOT EXISTS nfe_evento_transicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tentativaid INTEGER NOT NULL,
    ordemid INTEGER NOT NULL,
    chave TEXT NOT NULL,
    tipo TEXT NOT NULL,
    nseqevento INTEGER NOT NULL,
    status TEXT NOT NULL,
    estado_anterior TEXT,
    estado_novo TEXT,
    cstat TEXT,
    motivo TEXT,
    createdat TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_nfe_evento_transicoes_tentativa
    ON nfe_evento_transicoes(tentativaid, id)`,
];
```

Spread `...NFE_EVENTO_SCHEMA_STATEMENTS` into `SCHEMA` after `nfe_eventos` and append it to `migrations[]`.

- [ ] **Step 4: Implement repository**

Create `backend/repositories/nfeEventoAttemptRepository.js`:

```js
'use strict';

const TRANSICOES_PERMITIDAS = {
  processando: new Set(['incerto', 'autorizado', 'rejeitado', 'falha_local']),
  incerto: new Set(['autorizado', 'rejeitado']),
};
const STATUS_FINAIS = new Set(['autorizado', 'rejeitado', 'falha_local']);

function repositoryError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizePayload(payload) {
  if (!payload) return null;
  return JSON.stringify(payload).slice(0, 20000);
}

function createNfeEventoAttemptRepository(db, deps = {}) {
  const agora = deps.agora || (() => new Date().toISOString());

  function buscarPorId(id) {
    return db.prepare('SELECT * FROM nfe_evento_tentativas WHERE id = ?').get(id) || null;
  }

  function buscarAtiva({ chave, tipo, nSeqEvento }) {
    return db.prepare(`
      SELECT * FROM nfe_evento_tentativas
      WHERE chave = ? AND tipo = ? AND nseqevento = ?
        AND status IN ('processando','incerto')
      ORDER BY id DESC
      LIMIT 1
    `).get(String(chave), String(tipo), Number(nSeqEvento || 1)) || null;
  }

  const criarTx = db.transaction((input) => {
    const chave = String(input.chave || '').trim();
    const tipo = String(input.tipo || '').trim();
    const nSeqEvento = Number(input.nSeqEvento || input.nseqevento || 1);
    const ativa = buscarAtiva({ chave, tipo, nSeqEvento });
    if (ativa) {
      throw repositoryError(409, 'nfe_evento_tentativa_ativa', 'Ja existe tentativa ativa para este evento fiscal.');
    }
    const timestamp = agora();
    const idempotencyKey = `${tipo}:${chave}:${nSeqEvento}:${timestamp}`;
    const insert = db.prepare(`
      INSERT INTO nfe_evento_tentativas
        (ordemid, chave, tipo, nseqevento, idempotency_key, status, payload_json, solicitado_por, createdat, updatedat)
      VALUES (?, ?, ?, ?, ?, 'processando', ?, ?, ?, ?)
    `).run(
      Number(input.ordemId),
      chave,
      tipo,
      nSeqEvento,
      idempotencyKey,
      sanitizePayload(input.payload),
      input.usuarioId ?? null,
      timestamp,
      timestamp
    );
    db.prepare(`
      INSERT INTO nfe_evento_transicoes
        (tentativaid, ordemid, chave, tipo, nseqevento, status, estado_anterior, estado_novo, createdat)
      VALUES (?, ?, ?, ?, ?, 'processando', NULL, 'processando', ?)
    `).run(insert.lastInsertRowid, Number(input.ordemId), chave, tipo, nSeqEvento, timestamp);
    return buscarPorId(insert.lastInsertRowid);
  });

  function criar(input) {
    return criarTx.immediate(input);
  }

  function transicionarNaTransacao(id, status, dados = {}) {
    if (!db.inTransaction) {
      throw repositoryError(500, 'nfe_evento_transacao_obrigatoria', 'transicionarNaTransacao exige transacao ativa.');
    }
    const atual = buscarPorId(id);
    if (!atual) throw repositoryError(404, 'nfe_evento_tentativa_nao_encontrada', 'Tentativa de evento fiscal nao encontrada.');
    if (status === atual.status) return atual;
    if (!TRANSICOES_PERMITIDAS[atual.status]?.has(status)) {
      throw repositoryError(409, 'nfe_evento_transicao_invalida', 'Transicao de evento fiscal invalida.');
    }
    const timestamp = agora();
    const concluidoEm = STATUS_FINAIS.has(status) ? timestamp : atual.concluido_em;
    db.prepare(`
      UPDATE nfe_evento_tentativas
      SET status=?, cstat=?, motivo=?, protocolo=?, xml_retorno=?, erro_local=?, updatedat=?, concluido_em=?
      WHERE id=?
    `).run(
      status,
      dados.cStat ?? dados.cstat ?? atual.cstat,
      dados.motivo ?? atual.motivo,
      dados.protocolo ?? atual.protocolo,
      dados.xmlRetorno ?? dados.xml_retorno ?? atual.xml_retorno,
      dados.erroLocal ?? dados.erro_local ?? atual.erro_local,
      timestamp,
      concluidoEm,
      id
    );
    db.prepare(`
      INSERT INTO nfe_evento_transicoes
        (tentativaid, ordemid, chave, tipo, nseqevento, status, estado_anterior, estado_novo, cstat, motivo, createdat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      atual.ordemid,
      atual.chave,
      atual.tipo,
      atual.nseqevento,
      status,
      atual.status,
      status,
      dados.cStat ?? dados.cstat ?? null,
      dados.motivo ?? null,
      timestamp
    );
    return buscarPorId(id);
  }

  const transicionarTx = db.transaction(transicionarNaTransacao);
  function transicionar(id, status, dados = {}) {
    return transicionarTx.immediate(id, status, dados);
  }

  return { criar, buscarPorId, buscarAtiva, transicionar, transicionarNaTransacao };
}

module.exports = { createNfeEventoAttemptRepository };
```

- [ ] **Step 5: Verify repository tests**

Run:

```powershell
npm.cmd test -- nfeEventoAttemptRepository.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/database.js backend/repositories/nfeEventoAttemptRepository.js backend/__tests__/nfeEventoAttemptRepository.test.js
git commit -m "feat: persistir tentativas de evento fiscal"
```

## Task 3: Serviço idempotente de evento fiscal

**Files:**
- Create: `backend/services/nfeEventoService.js`
- Create: `backend/__tests__/nfeEventoService.test.js`

- [ ] **Step 1: Write failing service tests**

Create `backend/__tests__/nfeEventoService.test.js`:

```js
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNfeEventoAttemptRepository } from '../repositories/nfeEventoAttemptRepository.js';
import { createNfeEventoService } from '../services/nfeEventoService.js';

const CHAVE = '35160607500718000196550010000002811000002810';
const NOW = '2026-06-25T08:00:00.000Z';

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      nfe_chave TEXT,
      nfe_status TEXT,
      nfe_cancelado_em TEXT,
      nfe_cancel_protocolo TEXT,
      nfe_cancel_motivo TEXT,
      deletedat TEXT
    );
    CREATE TABLE nfe_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid INTEGER,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL DEFAULT 1,
      protocolo TEXT,
      cstat TEXT,
      motivo TEXT,
      texto TEXT,
      xml TEXT,
      createdat TEXT
    );
    CREATE TABLE nfe_evento_tentativas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid INTEGER NOT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL DEFAULT 1,
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      cstat TEXT,
      motivo TEXT,
      protocolo TEXT,
      payload_json TEXT,
      xml_retorno TEXT,
      erro_local TEXT,
      solicitado_por INTEGER,
      createdat TEXT NOT NULL,
      updatedat TEXT NOT NULL,
      concluido_em TEXT
    );
    CREATE UNIQUE INDEX idx_nfe_evento_tentativa_ativa
      ON nfe_evento_tentativas(chave, tipo, nseqevento)
      WHERE status IN ('processando','incerto');
    CREATE TABLE nfe_evento_transicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tentativaid INTEGER NOT NULL,
      ordemid INTEGER NOT NULL,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL,
      status TEXT NOT NULL,
      estado_anterior TEXT,
      estado_novo TEXT,
      cstat TEXT,
      motivo TEXT,
      createdat TEXT NOT NULL
    );
    INSERT INTO ordens (id, nfe_chave, nfe_status) VALUES (7, '${CHAVE}', 'autorizado');
  `);
  return db;
}

function makeService(overrides = {}) {
  const db = createDb();
  const repo = createNfeEventoAttemptRepository(db, { agora: () => NOW });
  const transmitir = overrides.transmitir || vi.fn(async () => ({
    retEvento: { infEvento: { cStat: '135', nProt: '1352601', xMotivo: 'Evento registrado', dhRegEvento: NOW } },
    xml: '<procEventoNFe />',
  }));
  const salvarXmlDisco = overrides.salvarXmlDisco || vi.fn(() => 'ok.xml');
  const service = createNfeEventoService({
    db,
    attemptRepository: repo,
    transmitir,
    salvarXmlDisco,
    timeoutMs: overrides.timeoutMs ?? 50,
    setTimeoutFn: overrides.setTimeoutFn,
    clearTimeoutFn: overrides.clearTimeoutFn,
    agora: () => NOW,
    logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn() },
  });
  return { db, repo, service, transmitir, salvarXmlDisco };
}

describe('nfeEventoService', () => {
  beforeEach(() => vi.useRealTimers());

  it('autoriza CC-e registrando tentativa e evento', async () => {
    const h = makeService();
    const result = await h.service.executar({
      ordemId: 7,
      chave: CHAVE,
      tipo: 'cce',
      nSeqEvento: 1,
      texto: 'Correcao fiscal permitida',
      payload: { evento: [] },
    });
    expect(result).toMatchObject({ httpStatus: 200, ok: true, status: 'autorizado', protocolo: '1352601' });
    expect(h.db.prepare('SELECT tipo, cstat FROM nfe_eventos').get()).toMatchObject({ tipo: 'cce', cstat: '135' });
    expect(h.db.prepare('SELECT status FROM nfe_evento_tentativas').get().status).toBe('autorizado');
  });

  it('autoriza cancelamento atomico com OS e evento', async () => {
    const h = makeService();
    const result = await h.service.executar({
      ordemId: 7,
      chave: CHAVE,
      tipo: 'cancelamento',
      nSeqEvento: 1,
      texto: 'Cancelamento por erro operacional',
      payload: { evento: [] },
    });
    expect(result.status).toBe('autorizado');
    expect(h.db.prepare('SELECT nfe_status, nfe_cancel_protocolo FROM ordens WHERE id=7').get())
      .toMatchObject({ nfe_status: 'cancelado', nfe_cancel_protocolo: '1352601' });
    expect(h.db.prepare('SELECT tipo FROM nfe_eventos').get().tipo).toBe('cancelamento');
  });

  it('marca timeout como incerto e bloqueia segunda tentativa', async () => {
    vi.useFakeTimers();
    let resolveTransmissao;
    const h = makeService({
      timeoutMs: 10,
      transmitir: vi.fn(() => new Promise((resolve) => { resolveTransmissao = resolve; })),
    });
    const primeira = h.service.executar({ ordemId: 7, chave: CHAVE, tipo: 'cce', nSeqEvento: 1, texto: 'Correcao fiscal permitida', payload: {} });
    await vi.advanceTimersByTimeAsync(11);
    await expect(primeira).resolves.toMatchObject({ httpStatus: 409, status: 'incerto' });
    await expect(h.service.executar({ ordemId: 7, chave: CHAVE, tipo: 'cce', nSeqEvento: 1, texto: 'Correcao fiscal permitida', payload: {} }))
      .resolves.toMatchObject({ httpStatus: 409, code: 'nfe_evento_tentativa_ativa' });
    resolveTransmissao({ retEvento: { infEvento: { cStat: '135', nProt: '1352601', xMotivo: 'Evento registrado', dhRegEvento: NOW } }, xml: '<procEventoNFe />' });
    await vi.runAllTimersAsync();
    expect(h.db.prepare('SELECT status FROM nfe_evento_tentativas').get().status).toBe('autorizado');
  });

  it('reverte cancelamento quando registro de evento falha', async () => {
    const h = makeService();
    h.db.exec('DROP TABLE nfe_eventos');
    await expect(h.service.executar({ ordemId: 7, chave: CHAVE, tipo: 'cancelamento', nSeqEvento: 1, texto: 'Cancelamento por erro operacional', payload: {} }))
      .resolves.toMatchObject({ httpStatus: 409, status: 'incerto' });
    expect(h.db.prepare('SELECT nfe_status FROM ordens WHERE id=7').get().nfe_status).toBe('autorizado');
  });
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test -- nfeEventoService.test.js
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Create `backend/services/nfeEventoService.js`:

```js
'use strict';

const {
  classificarResultadoEventoFiscal,
  extrairRespostaEventoFiscal,
} = require('../domain/nfeEventoRules');

function onlyMessage(error) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 500);
}

function responseBase(tentativa, overrides = {}) {
  return {
    httpStatus: 200,
    ok: false,
    status: tentativa?.status || 'incerto',
    tipo: tentativa?.tipo,
    chave: tentativa?.chave,
    nSeqEvento: tentativa?.nseqevento,
    alertas: [],
    ...overrides,
  };
}

function createNfeEventoService({
  db,
  attemptRepository,
  transmitir,
  salvarXmlDisco,
  timeoutMs = 75_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  agora = () => new Date().toISOString(),
  logger = console,
}) {
  if (!db || !attemptRepository || !transmitir) {
    throw new TypeError('db, attemptRepository e transmitir sao obrigatorios.');
  }

  function runTx(fn) {
    const tx = db.transaction(fn);
    return typeof tx.immediate === 'function' ? tx.immediate() : tx();
  }

  function ativaResponse(input, error) {
    const ativa = attemptRepository.buscarAtiva({
      chave: input.chave,
      tipo: input.tipo,
      nSeqEvento: input.nSeqEvento,
    });
    return responseBase(ativa, {
      httpStatus: error.status || 409,
      ok: false,
      code: error.code || 'nfe_evento_tentativa_ativa',
      erro: error.message || 'Ja existe tentativa ativa para este evento fiscal.',
    });
  }

  function registrarEvento(input, resposta) {
    db.prepare(`
      INSERT INTO nfe_eventos
        (ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, xml, createdat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.ordemId,
      input.chave,
      input.tipo,
      input.nSeqEvento || 1,
      resposta.protocolo || null,
      resposta.cStat || null,
      resposta.motivo || null,
      input.texto || null,
      resposta.xml || null,
      resposta.dhEvento || agora()
    );
  }

  function concluirAutorizado(tentativa, input, resposta) {
    const final = runTx(() => {
      if (input.tipo === 'cancelamento') {
        db.prepare(`
          UPDATE ordens
          SET nfe_status='cancelado',
              nfe_cancelado_em=?,
              nfe_cancel_protocolo=?,
              nfe_cancel_motivo=?
          WHERE id=? AND nfe_chave=?
        `).run(resposta.dhEvento || agora(), resposta.protocolo || null, input.texto || null, input.ordemId, input.chave);
      }
      registrarEvento(input, resposta);
      return attemptRepository.transicionarNaTransacao(tentativa.id, 'autorizado', {
        cStat: resposta.cStat,
        motivo: resposta.motivo,
        protocolo: resposta.protocolo,
        xmlRetorno: resposta.xml,
      });
    });
    const alertas = [];
    if (salvarXmlDisco && resposta.xml) {
      try {
        const suffix = input.tipo === 'cce' ? `cce-${String(input.nSeqEvento || 1).padStart(2, '0')}` : 'canc';
        const saved = salvarXmlDisco(`${input.chave}-${suffix}.xml`, resposta.xml);
        if (!saved) alertas.push('XML do evento salvo no banco, mas nao gravado no disco.');
      } catch (error) {
        logger.error?.('[NF-e] Falha ao salvar XML de evento em disco:', onlyMessage(error));
        alertas.push('XML do evento salvo no banco, mas nao gravado no disco.');
      }
    }
    return responseBase(final, {
      httpStatus: 200,
      ok: true,
      status: 'autorizado',
      protocolo: resposta.protocolo,
      dhEvento: resposta.dhEvento,
      cStat: resposta.cStat,
      alertas,
    });
  }

  function concluirRejeitado(tentativa, resposta) {
    const final = attemptRepository.transicionar(tentativa.id, 'rejeitado', {
      cStat: resposta.cStat,
      motivo: resposta.motivo || `cStat ${resposta.cStat}`,
      protocolo: resposta.protocolo,
      xmlRetorno: resposta.xml,
    });
    return responseBase(final, {
      httpStatus: 422,
      ok: false,
      status: 'rejeitado',
      cStat: resposta.cStat,
      erro: resposta.motivo || `Evento fiscal rejeitado: cStat ${resposta.cStat}`,
    });
  }

  function marcarIncerto(tentativa, dados = {}) {
    let final;
    try {
      final = attemptRepository.transicionar(tentativa.id, 'incerto', dados);
    } catch (error) {
      logger.warn?.('[NF-e] Falha ao marcar evento incerto:', onlyMessage(error));
      final = attemptRepository.buscarPorId(tentativa.id) || tentativa;
    }
    return responseBase(final, {
      httpStatus: 409,
      ok: false,
      status: 'incerto',
      cStat: dados.cStat ?? dados.cstat,
      erro: dados.motivo || 'Resultado do evento fiscal ficou incerto. Consulte antes de reenviar.',
    });
  }

  async function processarResposta(raw, tentativa, input) {
    const resposta = extrairRespostaEventoFiscal(raw, input.dhEvento);
    const classificacao = classificarResultadoEventoFiscal(input.tipo, resposta);
    if (classificacao === 'autorizado') {
      try {
        return concluirAutorizado(tentativa, input, resposta);
      } catch (error) {
        logger.error?.('[NF-e] Evento autorizado mas persistencia ficou incerta:', onlyMessage(error));
        return marcarIncerto(tentativa, {
          cStat: resposta.cStat,
          motivo: 'Evento autorizado, mas persistencia local ficou incerta.',
          protocolo: resposta.protocolo,
          xmlRetorno: resposta.xml,
          erroLocal: onlyMessage(error),
        });
      }
    }
    if (classificacao === 'rejeitado') return concluirRejeitado(tentativa, resposta);
    return marcarIncerto(tentativa, {
      cStat: resposta.cStat || null,
      motivo: resposta.motivo || 'Resposta de evento fiscal vazia ou inconclusiva.',
      protocolo: resposta.protocolo,
      xmlRetorno: resposta.xml,
    });
  }

  async function executar(input) {
    let tentativa;
    try {
      tentativa = attemptRepository.criar({
        ordemId: input.ordemId,
        chave: input.chave,
        tipo: input.tipo,
        nSeqEvento: input.nSeqEvento || 1,
        usuarioId: input.usuarioId,
        payload: input.payload,
      });
    } catch (error) {
      if (error.status === 409) return ativaResponse(input, error);
      throw error;
    }

    let timeoutId;
    const transmissao = Promise.resolve()
      .then(() => transmitir(input.payload, tentativa))
      .then((raw) => processarResposta(raw, tentativa, input))
      .catch((error) => marcarIncerto(tentativa, {
        cStat: 'comunicacao',
        motivo: 'Falha de comunicacao com a SEFAZ apos iniciar evento fiscal.',
        erroLocal: onlyMessage(error),
      }));
    transmissao.catch((error) => logger.error?.('[NF-e] Erro tardio no evento fiscal:', onlyMessage(error)));

    const timeout = new Promise((resolve) => {
      timeoutId = setTimeoutFn(() => {
        resolve({
          __timeout: true,
          ...marcarIncerto(tentativa, {
            cStat: 'timeout',
            motivo: 'Tempo esgotado aguardando resposta da SEFAZ para evento fiscal.',
          }),
        });
      }, timeoutMs);
    });

    const result = await Promise.race([transmissao, timeout]);
    if (!result.__timeout) clearTimeoutFn(timeoutId);
    const { __timeout: _omit, ...publicResult } = result;
    return publicResult;
  }

  return { executar };
}

module.exports = { createNfeEventoService };
```

- [ ] **Step 4: Verify service tests**

Run:

```powershell
npm.cmd test -- nfeEventoService.test.js nfeEventoAttemptRepository.test.js nfeEventoRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/nfeEventoService.js backend/__tests__/nfeEventoService.test.js
git commit -m "feat: orquestrar eventos fiscais idempotentes"
```

## Task 4: Integrar rotas de CC-e e cancelamento

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route contracts**

Add to `backend/__tests__/routeContracts.test.js`:

```js
it('delegates CC-e and cancellation to the idempotent fiscal event service', () => {
  const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');
  const cceStart = source.indexOf("router.post('/:chave/cce'");
  const cancelarStart = source.indexOf("router.post('/:chave/cancelar'");
  const cceSource = source.slice(cceStart, cancelarStart);
  const cancelarSource = source.slice(cancelarStart);

  expect(source).toMatch(/createNfeEventoService/);
  expect(source).toMatch(/createNfeEventoAttemptRepository/);
  expect(cceSource).not.toMatch(/guardTimeout/);
  expect(cancelarSource).not.toMatch(/guardTimeout/);
  expect(cceSource).not.toMatch(/wizard\.NFE_CartaDeCorrecao/);
  expect(cancelarSource).not.toMatch(/wizard\.NFE_Cancelamento/);
  expect(cceSource).toMatch(/service\.executar/);
  expect(cancelarSource).toMatch(/service\.executar/);
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because routes still call wizard directly and use `guardTimeout`.

- [ ] **Step 3: Modify imports and route dependencies**

In `backend/routes/nfe.js`, add:

```js
const { createNfeEventoAttemptRepository } = require('../repositories/nfeEventoAttemptRepository');
const { createNfeEventoService } = require('../services/nfeEventoService');
```

Keep `parseRetEvento` available only if still used by other helpers; remove it if unused after integration.

- [ ] **Step 4: Replace CC-e execution body**

After existing CC-e validations and `eventoPayload` creation, replace direct `guardTimeout`, wizard call, parsing and persistence with:

```js
const service = createNfeEventoService({
  db,
  attemptRepository: createNfeEventoAttemptRepository(db),
  timeoutMs: NFE_ROUTE_TIMEOUT_MS,
  logger: console,
  salvarXmlDisco,
  transmitir: async (payload) => {
    const wizard = await getNFEWizard();
    return callSEFAZ(() => wizard.NFE_CartaDeCorrecao(payload));
  },
});

const result = await service.executar({
  ordemId: os.id,
  chave,
  tipo: 'cce',
  nSeqEvento,
  texto: correcao,
  payload: eventoPayload,
  usuarioId: req.user?.id || null,
  dhEvento,
});
return res.status(result.httpStatus).json(result);
```

Preserve all validations before this point.

- [ ] **Step 5: Replace cancellation execution body**

After existing cancellation validations and `eventoPayload` creation, replace direct `guardTimeout`, wizard call, parsing, `UPDATE ordens` and `registrarEventoFiscal` with:

```js
const service = createNfeEventoService({
  db,
  attemptRepository: createNfeEventoAttemptRepository(db),
  timeoutMs: NFE_ROUTE_TIMEOUT_MS,
  logger: console,
  salvarXmlDisco,
  transmitir: async (payload) => {
    const wizard = await getNFEWizard();
    return callSEFAZ(() => wizard.NFE_Cancelamento(payload));
  },
});

const result = await service.executar({
  ordemId: os.id,
  chave,
  tipo: 'cancelamento',
  nSeqEvento: 1,
  texto: motivoStr,
  payload: eventoPayload,
  usuarioId: req.user?.id || null,
  dhEvento,
});
return res.status(result.httpStatus).json(result);
```

- [ ] **Step 6: Verify focused tests**

Run:

```powershell
npm.cmd test -- routeContracts.test.js nfeEventoService.test.js nfeEventoAttemptRepository.test.js nfeEventoRules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "fix: delegar eventos fiscais a servico idempotente"
```

## Task 5: Regressao e documentacao

**Files:**
- Modify: `backend/ARCHITECTURE.md`
- Modify if needed: `README.md`

- [ ] **Step 1: Document backend boundary**

Add a short paragraph to `backend/ARCHITECTURE.md` near the NF-e section:

```md
Eventos fiscais posteriores a autorizacao, como CC-e e cancelamento, usam
`services/nfeEventoService.js` com tentativas em `nfe_evento_tentativas` e
transicoes em `nfe_evento_transicoes`. Estados `processando` e `incerto`
bloqueiam retransmissao para evitar duplicidade legal quando a resposta da
SEFAZ nao e conclusiva.
```

- [ ] **Step 2: Run full backend tests**

Run:

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 3: Run frontend tests and build**

Run:

```powershell
cd ..\frontend
npm.cmd test
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 4: Run WhatsApp tests**

Run:

```powershell
cd ..\whatsapp-service
npm.cmd test
```

Expected: PASS.

- [ ] **Step 5: Run audits**

Run in root, backend, frontend and whatsapp-service:

```powershell
npm.cmd audit --omit=dev
```

Expected: 0 vulnerabilities or explicitly recorded known external issue.

- [ ] **Step 6: Final invariant checks**

Run:

```powershell
rg -n "guardTimeout|NFE_CartaDeCorrecao|NFE_Cancelamento|detalhe:\s*e\.message" backend/routes/nfe.js
rg -n "nfe_evento_tentativas|nfe_evento_transicoes|idx_nfe_evento_tentativa_ativa" backend/database.js
git diff --check
git status --short
```

Expected: no direct `guardTimeout`, direct wizard event call, or exposed internal detail in the route bodies; event schema present.

- [ ] **Step 7: Commit docs**

```powershell
git add backend/ARCHITECTURE.md README.md
git commit -m "docs: registrar eventos fiscais idempotentes"
```

Skip README if unchanged.
