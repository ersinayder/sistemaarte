# NF-e Entidade Unica e Avulsa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move NF-e storage to a canonical `nfe_notas`/`nfe_itens` model and add NF-e avulsa emission without OS or caixa side effects.

**Architecture:** Add a canonical NF-e persistence layer while keeping legacy `ordens.nfe_*` columns during Phase 1. Backend routes keep their public URLs but resolve notes through `nfe_notas`; frontend reuses the current review modal and adds an avulsa entry path. Phase 2 is documented and guarded by tests, but legacy column removal is not performed in this implementation.

**Tech Stack:** Node.js 22, Express 4, CommonJS backend, SQLite with `better-sqlite3`, Vitest 4.1, React 18, Vite 8, React Testing Library.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-07-01-nfe-entidade-unica-avulsa-design.md`
- Required context: `AGENTS.md`
- Canonical NF-e route today: `backend/routes/nfe.js`
- Canonical NF-e rules today: `backend/domain/nfeRules.js`
- Current emission validation helpers: `backend/domain/nfeEmissionRules.js`
- Current database schema/migrations: `backend/database.js`
- Current NF-e UI: `frontend/src/pages/NotasFiscais.jsx`

## Planned File Map

- Create `backend/domain/nfeNotasRules.js`
  - Pure helpers for parsing snapshots, serializing note rows, normalizing avulsa items, and enforcing active-note rules.
- Create `backend/services/nfeNotasService.js`
  - Database-backed service for listing notes, creating/backfilling notes, resolving by id/chave, persisting authorization/rejection/cancelamento, and saving item snapshots.
- Modify `backend/database.js`
  - Add `nfe_notas`, `nfe_itens`, `nfe_eventos.nfeid`, indexes, and a Phase 1 backfill call.
- Modify `backend/domain/nfeEmissionRules.js`
  - Add support for full avulsa item normalization while preserving OS item override behavior.
- Modify `backend/domain/nfeRules.js`
  - Keep public `montarNFe()` contract and ensure it accepts a neutral order-shaped fiscal DTO.
- Modify `backend/routes/nfe.js`
  - Route reads, events, XML, DANFE, lixeira, CC-e, cancelamento, OS emission, and avulsa emission through `nfeNotasService`.
- Modify `backend/routes/ordens.js`
  - Attach NF-e summary from `nfe_notas` for OS screens without exposing XML to `oficina`.
- Modify `backend/services/nfeInutilizacaoService.js`
  - Check used numbers in `nfe_notas`, with Phase 1 fallback to `ordens.nfe_numero`.
- Modify `frontend/src/pages/NotasFiscais.jsx`
  - Add mode switch `Por OS` / `Avulsa`, avulsa cliente/product item entry, shared review, origin-aware listing.
- Modify tests:
  - `backend/__tests__/nfeNotasRules.test.js`
  - `backend/__tests__/nfeNotasService.test.js`
  - `backend/__tests__/nfeEmissionRules.test.js`
  - `backend/__tests__/nfeInutilizacaoService.test.js`
  - `backend/__tests__/routeContracts.test.js`
  - `frontend/src/pages/NotasFiscais.test.jsx`

## Execution Notes

- Preserve exact OS statuses with accents in code and data, especially `Em Produção`; this note intentionally names the accented production status from `AGENTS.md`.
- Do not create `ordens`, `lancamentos`, or `lancamento_itens` from NF-e avulsa.
- Do not remove `ordens.nfe_*` in Phase 1.
- Every production change must follow RED -> GREEN -> REFACTOR.
- Use `npm.cmd`, not `npm`, in PowerShell verification commands.
- Because the repository already has unrelated dirty files, stage only files touched by the current task.

---

### Task 1: NF-e Note Rules and Database Schema

**Files:**
- Create: `backend/domain/nfeNotasRules.js`
- Create: `backend/__tests__/nfeNotasRules.test.js`
- Create: `backend/__tests__/nfeNotasDatabase.test.js`
- Modify: `backend/database.js`

- [ ] **Step 1: Write failing rules tests**

Add `backend/__tests__/nfeNotasRules.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  buildNfeListRow,
  isNotaAtivaParaOrdem,
  parseJsonSnapshot,
  sanitizeOrigemNfe,
} from '../domain/nfeNotasRules.js';

describe('nfeNotasRules', () => {
  it('normalizes supported NF-e origins', () => {
    expect(sanitizeOrigemNfe('ordem')).toBe('ordem');
    expect(sanitizeOrigemNfe('avulsa')).toBe('avulsa');
    expect(() => sanitizeOrigemNfe('caixa')).toThrow(/origem/i);
  });

  it('detects active OS notes only for emitindo and autorizado records', () => {
    expect(isNotaAtivaParaOrdem({ status: 'emitindo', deletedat: null })).toBe(true);
    expect(isNotaAtivaParaOrdem({ status: 'autorizado', deletedat: null })).toBe(true);
    expect(isNotaAtivaParaOrdem({ status: 'cancelado', deletedat: null })).toBe(false);
    expect(isNotaAtivaParaOrdem({ status: 'rejeitado', deletedat: null })).toBe(false);
    expect(isNotaAtivaParaOrdem({ status: 'autorizado', deletedat: '2026-07-01' })).toBe(false);
  });

  it('parses JSON snapshots without throwing on legacy blanks', () => {
    expect(parseJsonSnapshot('{"nome":"Cliente"}')).toEqual({ nome: 'Cliente' });
    expect(parseJsonSnapshot('')).toEqual({});
    expect(parseJsonSnapshot(null)).toEqual({});
    expect(parseJsonSnapshot('{broken')).toEqual({});
  });

  it('builds a list row compatible with the current NotasFiscais UI', () => {
    const row = buildNfeListRow({
      id: 8,
      origem: 'avulsa',
      ordemid: null,
      cliente_snapshot: JSON.stringify({ nome: 'Cliente Avulso' }),
      valortotal: 99.9,
      status: 'autorizado',
      numero: '281',
      serie: '1',
      chave: '31260600000000000000550010000002811000000010',
      protocolo: '131260000001',
      createdat: '2026-07-01 10:00:00',
    });

    expect(row).toMatchObject({
      id: 8,
      origem: 'avulsa',
      ordemid: null,
      numero: 'Avulsa',
      clientenome: 'Cliente Avulso',
      servico: 'NF-e avulsa',
      valortotal: 99.9,
      nfe_status: 'autorizado',
      nfe_numero: '281',
      nfe_serie: '1',
      nfe_chave: '31260600000000000000550010000002811000000010',
      nfe_protocolo: '131260000001',
    });
  });
});
```

- [ ] **Step 2: Run rules tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasRules.test.js
```

Expected: FAIL because `../domain/nfeNotasRules.js` does not exist.

- [ ] **Step 3: Implement pure rules**

Create `backend/domain/nfeNotasRules.js`:

```js
'use strict';

const ORIGENS_NFE = new Set(['ordem', 'avulsa']);
const STATUS_ATIVOS_ORDEM = new Set(['emitindo', 'autorizado']);

function parseJsonSnapshot(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeOrigemNfe(origem) {
  const value = String(origem || '').trim().toLowerCase();
  if (!ORIGENS_NFE.has(value)) {
    throw new Error(`Origem de NF-e invalida: ${origem || ''}`);
  }
  return value;
}

function isNotaAtivaParaOrdem(nota) {
  if (!nota || nota.deletedat) return false;
  return STATUS_ATIVOS_ORDEM.has(String(nota.status || '').trim());
}

function buildNfeListRow(row = {}) {
  const cliente = parseJsonSnapshot(row.cliente_snapshot);
  const origem = row.origem || 'ordem';
  const isAvulsa = origem === 'avulsa';
  const numeroOs = row.numero_os || row.ordem_numero || row.numero || null;
  const servico = row.servico || (isAvulsa ? 'NF-e avulsa' : '');

  return {
    id: row.id,
    origem,
    ordemid: row.ordemid || null,
    numero: isAvulsa ? 'Avulsa' : numeroOs,
    numero_os: numeroOs,
    clienteid: row.clienteid || null,
    clientenome: row.clientenome || cliente.nome || cliente.clientenome || cliente.name || 'Cliente nao informado',
    servico,
    status: row.ordem_status || row.status_os || null,
    valortotal: Number(row.valortotal || 0),
    nfe_numero: row.numero_nfe || row.nfe_numero || row.numero || null,
    nfe_serie: row.serie || row.nfe_serie || '1',
    nfe_chave: row.chave || row.nfe_chave || null,
    nfe_protocolo: row.protocolo || row.nfe_protocolo || null,
    nfe_status: row.status || row.nfe_status || null,
    nfe_emitida_em: row.emitida_em || row.nfe_emitida_em || row.createdat || null,
    nfe_cancelado_em: row.cancelado_em || row.nfe_cancelado_em || null,
    nfe_cancel_protocolo: row.cancel_protocolo || row.nfe_cancel_protocolo || null,
    nfe_cancel_motivo: row.cancel_motivo || row.nfe_cancel_motivo || null,
    nfe_deletedat: row.deletedat || row.nfe_deletedat || null,
    nfe_deletedpor: row.deletedpor || row.nfe_deletedpor || null,
    nfe_deletedreason: row.deletedreason || row.nfe_deletedreason || null,
    nfe_rejeicao_cstat: row.rejeicao_cstat || row.nfe_rejeicao_cstat || null,
    nfe_rejeicao_motivo: row.rejeicao_motivo || row.nfe_rejeicao_motivo || null,
    nfe_cce_count: Number(row.nfe_cce_count || 0),
    nfe_cce_ultima_em: row.nfe_cce_ultima_em || null,
    nfe_eventos_count: Number(row.nfe_eventos_count || 0),
  };
}

module.exports = {
  buildNfeListRow,
  isNotaAtivaParaOrdem,
  parseJsonSnapshot,
  sanitizeOrigemNfe,
};
```

- [ ] **Step 4: Run rules tests and verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasRules.test.js
```

Expected: PASS for `nfeNotasRules.test.js`.

- [ ] **Step 5: Write failing database schema tests**

Add `backend/__tests__/nfeNotasDatabase.test.js`:

```js
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

describe('nfe_notas database schema', () => {
  it('declares canonical NF-e note and item tables', () => {
    expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS nfe_notas/);
    expect(databaseSource).toMatch(/origem\s+TEXT NOT NULL/);
    expect(databaseSource).toMatch(/ordemid\s+INTEGER DEFAULT NULL/);
    expect(databaseSource).toMatch(/cliente_snapshot\s+TEXT NOT NULL/);
    expect(databaseSource).toMatch(/emitente_snapshot\s+TEXT NOT NULL/);
    expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS nfe_itens/);
    expect(databaseSource).toMatch(/nfeid\s+INTEGER NOT NULL/);
    expect(databaseSource).toMatch(/origem_fiscal\s+TEXT NOT NULL DEFAULT '0'/);
  });

  it('adds indexes needed by list, key lookup, trash, sequence checks, and events', () => {
    expect(databaseSource).toMatch(/idx_nfe_notas_chave/);
    expect(databaseSource).toMatch(/idx_nfe_notas_origem_ordemid/);
    expect(databaseSource).toMatch(/idx_nfe_notas_status/);
    expect(databaseSource).toMatch(/idx_nfe_notas_deletedat/);
    expect(databaseSource).toMatch(/idx_nfe_notas_numero_serie_ambiente/);
    expect(databaseSource).toMatch(/idx_nfe_itens_nfeid/);
    expect(databaseSource).toMatch(/idx_nfe_eventos_nfeid/);
  });

  it('keeps legacy ordem NF-e columns in phase 1', () => {
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_numero TEXT/);
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_xml TEXT/);
    expect(databaseSource).not.toMatch(/DROP COLUMN nfe_/);
  });
});
```

- [ ] **Step 6: Run database schema tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasDatabase.test.js
```

Expected: FAIL because `nfe_notas`, `nfe_itens`, and indexes are absent.

- [ ] **Step 7: Add schema and migrations**

Modify `backend/database.js`:

Add `nfe_notas` and `nfe_itens` to the `SCHEMA` string after `nfe_autxml` or near existing NF-e tables:

```sql
CREATE TABLE IF NOT EXISTS nfe_notas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  origem            TEXT NOT NULL,
  ordemid           INTEGER DEFAULT NULL,
  clienteid         INTEGER DEFAULT NULL,
  cliente_snapshot  TEXT NOT NULL DEFAULT '{}',
  emitente_snapshot TEXT NOT NULL DEFAULT '{}',
  valortotal        REAL NOT NULL DEFAULT 0,
  descontovalor     REAL NOT NULL DEFAULT 0,
  pagamento         TEXT DEFAULT 'Pix',
  ambiente          INTEGER NOT NULL DEFAULT 2,
  numero            TEXT,
  serie             TEXT NOT NULL DEFAULT '1',
  chave             TEXT,
  protocolo         TEXT,
  status            TEXT NOT NULL,
  xml               TEXT,
  rejeicao_cstat    TEXT,
  rejeicao_motivo   TEXT,
  cancelado_em      TEXT,
  cancel_protocolo  TEXT,
  cancel_motivo     TEXT,
  deletedat         TEXT DEFAULT NULL,
  deletedpor        INTEGER DEFAULT NULL,
  deletedreason     TEXT DEFAULT NULL,
  criadopor         INTEGER DEFAULT NULL,
  imported_legacy   INTEGER NOT NULL DEFAULT 0,
  createdat         TEXT DEFAULT (datetime('now','localtime')),
  updatedat         TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS nfe_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nfeid           INTEGER NOT NULL,
  ordem_item_id   INTEGER DEFAULT NULL,
  produto_id      INTEGER DEFAULT NULL,
  nome            TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1,
  preco_unitario  REAL NOT NULL DEFAULT 0,
  subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  avulso          INTEGER DEFAULT 0,
  ncm             TEXT NOT NULL,
  cfop            TEXT NOT NULL,
  csosn           TEXT NOT NULL,
  origem_fiscal   TEXT NOT NULL DEFAULT '0',
  unidade         TEXT NOT NULL DEFAULT 'UN',
  createdat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfe_notas_chave
  ON nfe_notas(chave)
  WHERE chave IS NOT NULL AND chave <> '';
CREATE INDEX IF NOT EXISTS idx_nfe_notas_origem_ordemid ON nfe_notas(origem, ordemid);
CREATE INDEX IF NOT EXISTS idx_nfe_notas_status ON nfe_notas(status);
CREATE INDEX IF NOT EXISTS idx_nfe_notas_deletedat ON nfe_notas(deletedat);
CREATE INDEX IF NOT EXISTS idx_nfe_notas_numero_serie_ambiente ON nfe_notas(ambiente, serie, numero);
CREATE INDEX IF NOT EXISTS idx_nfe_notas_legacy_ordemid ON nfe_notas(imported_legacy, ordemid);
CREATE INDEX IF NOT EXISTS idx_nfe_itens_nfeid ON nfe_itens(nfeid);
CREATE INDEX IF NOT EXISTS idx_nfe_eventos_nfeid ON nfe_eventos(nfeid);
```

Append these statements to the `migrations[]` array:

```js
`CREATE TABLE IF NOT EXISTS nfe_notas (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  origem            TEXT NOT NULL,
  ordemid           INTEGER DEFAULT NULL,
  clienteid         INTEGER DEFAULT NULL,
  cliente_snapshot  TEXT NOT NULL DEFAULT '{}',
  emitente_snapshot TEXT NOT NULL DEFAULT '{}',
  valortotal        REAL NOT NULL DEFAULT 0,
  descontovalor     REAL NOT NULL DEFAULT 0,
  pagamento         TEXT DEFAULT 'Pix',
  ambiente          INTEGER NOT NULL DEFAULT 2,
  numero            TEXT,
  serie             TEXT NOT NULL DEFAULT '1',
  chave             TEXT,
  protocolo         TEXT,
  status            TEXT NOT NULL,
  xml               TEXT,
  rejeicao_cstat    TEXT,
  rejeicao_motivo   TEXT,
  cancelado_em      TEXT,
  cancel_protocolo  TEXT,
  cancel_motivo     TEXT,
  deletedat         TEXT DEFAULT NULL,
  deletedpor        INTEGER DEFAULT NULL,
  deletedreason     TEXT DEFAULT NULL,
  criadopor         INTEGER DEFAULT NULL,
  imported_legacy   INTEGER NOT NULL DEFAULT 0,
  createdat         TEXT DEFAULT (datetime('now','localtime')),
  updatedat         TEXT DEFAULT (datetime('now','localtime'))
)`,
`CREATE TABLE IF NOT EXISTS nfe_itens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nfeid           INTEGER NOT NULL,
  ordem_item_id   INTEGER DEFAULT NULL,
  produto_id      INTEGER DEFAULT NULL,
  nome            TEXT NOT NULL,
  quantidade      REAL NOT NULL DEFAULT 1,
  preco_unitario  REAL NOT NULL DEFAULT 0,
  subtotal        REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
  avulso          INTEGER DEFAULT 0,
  ncm             TEXT NOT NULL,
  cfop            TEXT NOT NULL,
  csosn           TEXT NOT NULL,
  origem_fiscal   TEXT NOT NULL DEFAULT '0',
  unidade         TEXT NOT NULL DEFAULT 'UN',
  createdat       TEXT DEFAULT (datetime('now','localtime'))
)`,
"ALTER TABLE nfe_eventos ADD COLUMN nfeid INTEGER DEFAULT NULL",
`CREATE UNIQUE INDEX IF NOT EXISTS idx_nfe_notas_chave
  ON nfe_notas(chave)
  WHERE chave IS NOT NULL AND chave <> ''`,
"CREATE INDEX IF NOT EXISTS idx_nfe_notas_origem_ordemid ON nfe_notas(origem, ordemid)",
"CREATE INDEX IF NOT EXISTS idx_nfe_notas_status ON nfe_notas(status)",
"CREATE INDEX IF NOT EXISTS idx_nfe_notas_deletedat ON nfe_notas(deletedat)",
"CREATE INDEX IF NOT EXISTS idx_nfe_notas_numero_serie_ambiente ON nfe_notas(ambiente, serie, numero)",
"CREATE INDEX IF NOT EXISTS idx_nfe_notas_legacy_ordemid ON nfe_notas(imported_legacy, ordemid)",
"CREATE INDEX IF NOT EXISTS idx_nfe_itens_nfeid ON nfe_itens(nfeid)",
"CREATE INDEX IF NOT EXISTS idx_nfe_eventos_nfeid ON nfe_eventos(nfeid)",
```

- [ ] **Step 8: Run database schema tests and verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasDatabase.test.js databaseMigrations.test.js
```

Expected: PASS for schema tests and existing migration safety tests.

- [ ] **Step 9: Commit Task 1**

Run:

```powershell
git add backend/domain/nfeNotasRules.js backend/__tests__/nfeNotasRules.test.js backend/__tests__/nfeNotasDatabase.test.js backend/database.js
git commit -m "feat: add canonical nfe note schema"
```

---

### Task 2: NF-e Backfill and Service Read Model

**Files:**
- Create: `backend/services/nfeNotasService.js`
- Create: `backend/__tests__/nfeNotasService.test.js`
- Modify: `backend/database.js`
- Modify: `backend/routes/nfe.js`

- [ ] **Step 1: Write failing service tests**

Add `backend/__tests__/nfeNotasService.test.js` with in-memory SQLite setup:

```js
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  backfillNfeNotasFromOrdens,
  listarNotasFiscais,
  resolverNotaPorChave,
} from '../services/nfeNotasService.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE clientes (
      id INTEGER PRIMARY KEY,
      name TEXT,
      cpf TEXT,
      ie TEXT,
      logradouro TEXT,
      numero TEXT,
      bairro TEXT,
      cidade TEXT,
      uf TEXT,
      cep TEXT,
      deletedat TEXT
    );
    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      numero TEXT,
      clienteid INTEGER,
      clientenome TEXT,
      servico TEXT,
      valortotal REAL,
      descontovalor REAL,
      pagamento TEXT,
      status TEXT,
      deletedat TEXT,
      nfe_numero TEXT,
      nfe_serie TEXT,
      nfe_chave TEXT,
      nfe_protocolo TEXT,
      nfe_status TEXT,
      nfe_xml TEXT,
      nfe_emitida_em TEXT,
      nfe_cancelado_em TEXT,
      nfe_cancel_protocolo TEXT,
      nfe_cancel_motivo TEXT,
      nfe_deletedat TEXT,
      nfe_deletedpor INTEGER,
      nfe_deletedreason TEXT
    );
    CREATE TABLE produtos (
      id INTEGER PRIMARY KEY,
      nome TEXT,
      unidade TEXT,
      ncm TEXT,
      cfop TEXT,
      csosn TEXT,
      origem_fiscal INTEGER
    );
    CREATE TABLE ordem_itens (
      id INTEGER PRIMARY KEY,
      ordemid INTEGER,
      produto_id INTEGER,
      nome TEXT,
      quantidade REAL,
      preco_unitario REAL,
      avulso INTEGER
    );
    CREATE TABLE nfe_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origem TEXT NOT NULL,
      ordemid INTEGER DEFAULT NULL,
      clienteid INTEGER DEFAULT NULL,
      cliente_snapshot TEXT NOT NULL DEFAULT '{}',
      emitente_snapshot TEXT NOT NULL DEFAULT '{}',
      valortotal REAL NOT NULL DEFAULT 0,
      descontovalor REAL NOT NULL DEFAULT 0,
      pagamento TEXT DEFAULT 'Pix',
      ambiente INTEGER NOT NULL DEFAULT 2,
      numero TEXT,
      serie TEXT NOT NULL DEFAULT '1',
      chave TEXT,
      protocolo TEXT,
      status TEXT NOT NULL,
      xml TEXT,
      rejeicao_cstat TEXT,
      rejeicao_motivo TEXT,
      cancelado_em TEXT,
      cancel_protocolo TEXT,
      cancel_motivo TEXT,
      deletedat TEXT DEFAULT NULL,
      deletedpor INTEGER DEFAULT NULL,
      deletedreason TEXT DEFAULT NULL,
      criadopor INTEGER DEFAULT NULL,
      imported_legacy INTEGER NOT NULL DEFAULT 0,
      createdat TEXT DEFAULT (datetime('now','localtime')),
      updatedat TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE nfe_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nfeid INTEGER NOT NULL,
      ordem_item_id INTEGER DEFAULT NULL,
      produto_id INTEGER DEFAULT NULL,
      nome TEXT NOT NULL,
      quantidade REAL NOT NULL DEFAULT 1,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
      avulso INTEGER DEFAULT 0,
      ncm TEXT NOT NULL,
      cfop TEXT NOT NULL,
      csosn TEXT NOT NULL,
      origem_fiscal TEXT NOT NULL DEFAULT '0',
      unidade TEXT NOT NULL DEFAULT 'UN',
      createdat TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE nfe_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nfeid INTEGER,
      ordemid INTEGER,
      chave TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nseqevento INTEGER NOT NULL DEFAULT 1,
      protocolo TEXT,
      cstat TEXT,
      motivo TEXT,
      texto TEXT,
      xml TEXT,
      createdat TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

describe('nfeNotasService', () => {
  it('backfills legacy OS NF-e rows once and snapshots items', () => {
    const db = makeDb();
    db.prepare("INSERT INTO clientes (id, name, cpf, logradouro, numero, bairro, cidade, uf, cep) VALUES (1, 'Cliente OS', '12345678901', 'Rua A', '10', 'Centro', 'Ipatinga', 'MG', '35160000')").run();
    db.prepare("INSERT INTO produtos (id, nome, unidade, ncm, cfop, csosn, origem_fiscal) VALUES (5, 'Moldura cadastrada', 'UN', '44151000', '5102', '400', 0)").run();
    db.prepare("INSERT INTO ordens (id, numero, clienteid, clientenome, servico, valortotal, descontovalor, pagamento, status, nfe_numero, nfe_serie, nfe_chave, nfe_protocolo, nfe_status, nfe_xml, nfe_emitida_em) VALUES (10, 'OS-10', 1, 'Cliente OS', 'Quadro', 120, 0, 'Pix', 'Pronto', '281', '1', '31260600000000000000550010000002811000000010', '131260000001', 'autorizado', '<nfeProc />', '2026-07-01T10:00:00-03:00')").run();
    db.prepare("INSERT INTO ordem_itens (id, ordemid, produto_id, nome, quantidade, preco_unitario, avulso) VALUES (20, 10, 5, 'Nome customizado', 2, 60, 0)").run();

    const first = backfillNfeNotasFromOrdens(db, { ambiente: 2, emitente: { xNome: 'Arte' } });
    const second = backfillNfeNotasFromOrdens(db, { ambiente: 2, emitente: { xNome: 'Arte' } });

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS total FROM nfe_notas').get().total).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS total FROM nfe_itens').get().total).toBe(1);
    expect(db.prepare('SELECT nome, ncm, cfop, csosn FROM nfe_itens').get()).toMatchObject({
      nome: 'Nome customizado',
      ncm: '44151000',
      cfop: '5102',
      csosn: '400',
    });
  });

  it('lists OS and avulsa notes through a compatible read model', () => {
    const db = makeDb();
    db.prepare("INSERT INTO nfe_notas (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, protocolo, status, createdat) VALUES ('avulsa', ?, '{}', 50, 2, '300', '1', '31260600000000000000550010000003001000000010', '131', 'autorizado', '2026-07-01 10:00:00')").run(JSON.stringify({ nome: 'Cliente Avulso' }));

    const rows = listarNotasFiscais(db, { lixeira: false });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origem: 'avulsa',
      numero: 'Avulsa',
      clientenome: 'Cliente Avulso',
      nfe_status: 'autorizado',
      nfe_numero: '300',
    });
  });

  it('resolves note by key for fiscal XML and events', () => {
    const db = makeDb();
    db.prepare("INSERT INTO nfe_notas (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, chave, protocolo, status, xml) VALUES ('avulsa', '{}', '{}', 50, 2, '300', '1', '31260600000000000000550010000003001000000010', '131', 'autorizado', '<nfeProc />')").run();

    const nota = resolverNotaPorChave(db, '31260600000000000000550010000003001000000010');

    expect(nota).toMatchObject({
      origem: 'avulsa',
      status: 'autorizado',
      xml: '<nfeProc />',
    });
  });
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasService.test.js
```

Expected: FAIL because `../services/nfeNotasService.js` does not exist.

- [ ] **Step 3: Implement minimal read/backfill service**

Create `backend/services/nfeNotasService.js` with these exports:

```js
'use strict';

const {
  buildNfeListRow,
  isNotaAtivaParaOrdem,
  parseJsonSnapshot,
} = require('../domain/nfeNotasRules');

function json(value) {
  return JSON.stringify(value || {});
}

function hasTable(db, table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return Boolean(row);
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function buildClienteSnapshot(row) {
  return {
    id: row.clienteid || null,
    nome: row.clientenome || row.cliente_name || 'CONSUMIDOR FINAL',
    documento: row.cpf || row.clientecpf || '',
    cpf: row.cpf || row.clientecpf || '',
    ie: row.ie || '',
    logradouro: row.logradouro || '',
    numero: row.c_numero || row.numero_cliente || '',
    bairro: row.bairro || '',
    cidade: row.cidade || '',
    uf: row.uf || '',
    cep: row.cep || '',
  };
}

function backfillNfeNotasFromOrdens(db, options = {}) {
  if (!hasTable(db, 'nfe_notas') || !hasTable(db, 'ordens')) return { inserted: 0, skipped: 0 };
  const rows = db.prepare(`
    SELECT o.*, c.name AS cliente_name, c.cpf, c.ie, c.logradouro,
           c.numero AS c_numero, c.bairro, c.cidade, c.uf, c.cep
    FROM ordens o
    LEFT JOIN clientes c ON c.id = o.clienteid
    WHERE o.nfe_status IS NOT NULL
  `).all();

  let inserted = 0;
  let skipped = 0;
  const insertNota = db.prepare(`
    INSERT INTO nfe_notas
      (origem, ordemid, clienteid, cliente_snapshot, emitente_snapshot, valortotal,
       descontovalor, pagamento, ambiente, numero, serie, chave, protocolo, status, xml,
       cancelado_em, cancel_protocolo, cancel_motivo, deletedat, deletedpor,
       deletedreason, imported_legacy, createdat, updatedat)
    VALUES
      ('ordem', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
       COALESCE(?, datetime('now','localtime')), datetime('now','localtime'))
  `);
  const insertItem = db.prepare(`
    INSERT INTO nfe_itens
      (nfeid, ordem_item_id, produto_id, nome, quantidade, preco_unitario, avulso,
       ncm, cfop, csosn, origem_fiscal, unidade)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const itensStmt = db.prepare(`
    SELECT oi.*, p.ncm, p.cfop, p.csosn, p.origem_fiscal, p.unidade
    FROM ordem_itens oi
    LEFT JOIN produtos p ON p.id = oi.produto_id
    WHERE oi.ordemid = ?
    ORDER BY oi.id ASC
  `);

  for (const row of rows) {
    const exists = db.prepare("SELECT id FROM nfe_notas WHERE origem='ordem' AND ordemid=? AND imported_legacy=1").get(row.id);
    if (exists) {
      skipped += 1;
      continue;
    }
    const info = insertNota.run(
      row.id,
      row.clienteid || null,
      json(buildClienteSnapshot(row)),
      json(options.emitente || {}),
      Number(row.valortotal || 0),
      Number(row.descontovalor || 0),
      row.pagamento || 'Pix',
      Number(options.ambiente || 2),
      row.nfe_numero || null,
      row.nfe_serie || '1',
      row.nfe_chave || null,
      row.nfe_protocolo || null,
      row.nfe_status,
      row.nfe_xml || null,
      row.nfe_cancelado_em || null,
      row.nfe_cancel_protocolo || null,
      row.nfe_cancel_motivo || null,
      row.nfe_deletedat || null,
      row.nfe_deletedpor || null,
      row.nfe_deletedreason || null,
      row.nfe_emitida_em || null
    );
    const nfeid = Number(info.lastInsertRowid);
    for (const item of itensStmt.all(row.id)) {
      insertItem.run(
        nfeid,
        item.id,
        item.produto_id || null,
        item.nome || 'PRODUTO',
        Number(item.quantidade || 1),
        Number(item.preco_unitario || 0),
        item.avulso ? 1 : 0,
        String(item.ncm || '44151000').replace(/\D/g, '').padStart(8, '0').slice(-8),
        String(item.cfop || '5102').replace(/\D/g, '').slice(0, 4) || '5102',
        String(item.csosn || '400').replace(/\D/g, '').padStart(3, '0').slice(-3),
        String(item.origem_fiscal ?? '0').replace(/\D/g, '').slice(0, 1) || '0',
        String(item.unidade || 'UN').trim().toUpperCase().slice(0, 6) || 'UN'
      );
    }
    inserted += 1;
  }

  if (hasTable(db, 'nfe_eventos') && hasColumn(db, 'nfe_eventos', 'nfeid')) {
    db.prepare(`
      UPDATE nfe_eventos
      SET nfeid = (
        SELECT n.id FROM nfe_notas n
        WHERE (n.chave = nfe_eventos.chave OR (n.chave IS NULL AND n.ordemid = nfe_eventos.ordemid))
        ORDER BY n.id DESC
        LIMIT 1
      )
      WHERE nfeid IS NULL
    `).run();
  }

  return { inserted, skipped };
}

function listarNotasFiscais(db, { lixeira = false } = {}) {
  const deletedClause = lixeira ? 'n.deletedat IS NOT NULL' : 'n.deletedat IS NULL';
  const rows = db.prepare(`
    SELECT n.*,
           o.numero AS numero_os,
           o.status AS ordem_status,
           o.servico AS servico,
           COALESCE(c.name, '') AS clientenome,
           (SELECT COUNT(*) FROM nfe_eventos e WHERE e.nfeid = n.id AND e.tipo = 'cce') AS nfe_cce_count,
           (SELECT MAX(createdat) FROM nfe_eventos e WHERE e.nfeid = n.id AND e.tipo = 'cce') AS nfe_cce_ultima_em,
           (SELECT COUNT(*) FROM nfe_eventos e WHERE e.nfeid = n.id OR e.chave = n.chave) AS nfe_eventos_count
    FROM nfe_notas n
    LEFT JOIN ordens o ON o.id = n.ordemid
    LEFT JOIN clientes c ON c.id = n.clienteid
    WHERE ${deletedClause}
    ORDER BY COALESCE(n.createdat, n.updatedat) DESC, n.id DESC
  `).all();
  return rows.map(buildNfeListRow);
}

function resolverNotaPorChave(db, chave) {
  if (!chave) return null;
  return db.prepare('SELECT * FROM nfe_notas WHERE chave = ? AND deletedat IS NULL').get(chave) || null;
}

function buscarNotaAtivaParaOrdem(db, ordemid) {
  const rows = db.prepare("SELECT * FROM nfe_notas WHERE origem='ordem' AND ordemid=? AND deletedat IS NULL ORDER BY id DESC").all(ordemid);
  return rows.find(isNotaAtivaParaOrdem) || null;
}

module.exports = {
  backfillNfeNotasFromOrdens,
  buscarNotaAtivaParaOrdem,
  buildClienteSnapshot,
  listarNotasFiscais,
  parseJsonSnapshot,
  resolverNotaPorChave,
};
```

- [ ] **Step 4: Run service tests and verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasRules.test.js nfeNotasService.test.js
```

Expected: PASS for both files.

- [ ] **Step 5: Wire backfill after migrations**

Modify `backend/database.js` after `applyMigrations(db, migrations);` and after NF-e tables exist:

```js
  try {
    const { backfillNfeNotasFromOrdens } = require("./services/nfeNotasService");
    backfillNfeNotasFromOrdens(db, { ambiente: 2, emitente: {} });
  } catch (error) {
    console.warn("[database] Falha ao executar backfill inicial de NF-e:", String(error?.message || error));
  }
```

- [ ] **Step 6: Run focused backend tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasService.test.js nfeNotasDatabase.test.js databaseMigrations.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add backend/services/nfeNotasService.js backend/__tests__/nfeNotasService.test.js backend/database.js
git commit -m "feat: backfill nfe notes from legacy orders"
```

---

### Task 3: Avulsa Item Normalization and Fiscal DTOs

**Files:**
- Modify: `backend/domain/nfeEmissionRules.js`
- Modify: `backend/__tests__/nfeEmissionRules.test.js`
- Modify: `backend/domain/nfeRules.js`
- Modify: `backend/__tests__/nfe.test.js`

- [ ] **Step 1: Write failing avulsa item tests**

Append to `backend/__tests__/nfeEmissionRules.test.js`:

```js
import { normalizarItensAvulsosNFe } from '../domain/nfeEmissionRules.js';

it('normalizes full avulsa items with fiscal fields and commercial totals', () => {
  const resultado = normalizarItensAvulsosNFe([
    {
      produto_id: 3,
      nome: 'Moldura avulsa',
      quantidade: '2',
      preco_unitario: '45.50',
      avulso: false,
      ncm: '44.15.10.00',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'un',
    },
  ]);

  expect(resultado.ok).toBe(true);
  expect(resultado.itens[0]).toMatchObject({
    produto_id: 3,
    nome: 'Moldura avulsa',
    quantidade: 2,
    preco_unitario: 45.5,
    subtotal: 91,
    avulso: false,
    ncm: '44151000',
    cfop: '5102',
    csosn: '400',
    origem_fiscal: '0',
    unidade: 'UN',
  });
});

it('rejects avulsa items without commercial value before issuing NF-e', () => {
  const resultado = normalizarItensAvulsosNFe([
    {
      nome: 'Sem preco',
      quantidade: 1,
      preco_unitario: 0,
      ncm: '44151000',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    },
  ]);

  expect(resultado.ok).toBe(false);
  expect(resultado.erro).toContain('preco unitario');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeEmissionRules.test.js
```

Expected: FAIL because `normalizarItensAvulsosNFe` is not exported.

- [ ] **Step 3: Implement avulsa item normalization**

In `backend/domain/nfeEmissionRules.js`, add:

```js
function normalizarItensAvulsosNFe(rawItens = []) {
  if (!Array.isArray(rawItens) || rawItens.length === 0) {
    return { ok: false, erro: 'NF-e precisa de pelo menos um item.' };
  }

  const itens = rawItens.map((raw, index) => {
    const nome = normalizarTexto(raw?.nome ?? raw?.produto_nome, 120);
    const quantidade = moeda(raw?.quantidade || 1);
    const precoUnitario = moeda(raw?.preco_unitario ?? raw?.preco ?? 0);
    const produtoId = raw?.produto_id ?? raw?.produtoId ?? null;

    return {
      id: raw?.id ?? index + 1,
      produto_id: produtoId ? Number(produtoId) : null,
      nome,
      quantidade,
      preco_unitario: precoUnitario,
      subtotal: moeda(quantidade * precoUnitario),
      avulso: Boolean(raw?.avulso || !produtoId),
      ncm: onlyDigits(valorFiscal(raw, 'ncm', '')).padStart(8, '0').slice(-8),
      cfop: onlyDigits(valorFiscal(raw, 'cfop', '')).slice(0, 4),
      csosn: onlyDigits(valorFiscal(raw, 'csosn', '')).padStart(3, '0').slice(-3),
      origem_fiscal: onlyDigits(valorFiscal(raw, 'origem_fiscal', '')).slice(0, 1),
      unidade: valorFiscal(raw, 'unidade', '').trim().toUpperCase().slice(0, 6),
    };
  });

  const validacao = validarItensFiscaisNFe(itens);
  if (!validacao.ok) return validacao;

  return { ok: true, itens };
}
```

Export `normalizarItensAvulsosNFe`.

- [ ] **Step 4: Run emission rules tests and verify GREEN**

Run:

```powershell
cd backend
npm.cmd test -- nfeEmissionRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Write fiscal DTO test**

Append to `backend/__tests__/nfe.test.js`:

```js
it('monta NF-e from an avulsa-shaped fiscal DTO without an OS id', () => {
  const { infNFe } = montarNFe({
    ordem: { valortotal: 91, descontovalor: 0, pagamento: 'Pix' },
    itens: [{
      produto_id: null,
      nome: 'Item avulso',
      quantidade: 2,
      preco_unitario: 45.5,
      ncm: '44151000',
      cfop: '5102',
      csosn: '400',
      unidade: 'UN',
      origem_fiscal: '0',
    }],
    cliente: {
      clientenome: 'Cliente Fiscal',
      cpf: '12345678901',
      logradouro: 'Rua A',
      c_numero: '10',
      bairro: 'Centro',
      cidade: 'Ipatinga',
      uf: 'MG',
      cep: '35160000',
    },
    emitente,
    numero: 300,
    serie: '1',
    ambiente: 2,
  });

  expect(infNFe.det).toHaveLength(1);
  expect(infNFe.total.ICMSTot.vNF).toBe('91.00');
  expect(infNFe.pag.detPag[0].tPag).toBe('17');
});
```

- [ ] **Step 6: Run NF-e payload tests**

Run:

```powershell
cd backend
npm.cmd test -- nfe.test.js
```

Expected: PASS with `Pix` mapped to `tPag` value `17`, matching the current `mapTpPag()` contract.

- [ ] **Step 7: Commit Task 3**

Run:

```powershell
git add backend/domain/nfeEmissionRules.js backend/__tests__/nfeEmissionRules.test.js backend/domain/nfeRules.js backend/__tests__/nfe.test.js
git commit -m "feat: normalize avulsa nfe items"
```

---

### Task 4: Route Read Model, XML, DANFE, Events, Trash

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/services/nfeNotasService.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing route contract tests**

In `backend/__tests__/routeContracts.test.js`, update or add tests:

```js
it('routes NF-e list and fiscal document reads through nfe_notas', () => {
  const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

  expect(source).toMatch(/listarNotasFiscais/);
  expect(source).toMatch(/resolverNotaPorChave/);
  expect(source).toMatch(/nfe_notas/);
  expect(source).toMatch(/router\.get\(['"]\/:chave\/xml\/autorizacao['"]/);
  expect(source).toMatch(/renderDanfeHtml\(xml\)/);
});

it('keeps NF-e trash restrictions on canonical notes', () => {
  const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

  expect(source).toMatch(/STATUS_NFE_LIXEIRA/);
  expect(source).toMatch(/UPDATE nfe_notas SET deletedat=datetime\('now','localtime'\)/);
  expect(source).toMatch(/UPDATE nfe_notas SET deletedat=NULL/);
  expect(source).not.toMatch(/UPDATE ordens SET nfe_deletedat/);
});
```

- [ ] **Step 2: Run route contract tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL while routes still read/write `ordens.nfe_*`.

- [ ] **Step 3: Add service helpers for route reads**

In `backend/services/nfeNotasService.js`, add:

```js
function resolverNotaPorId(db, id, { includeDeleted = false } = {}) {
  const clause = includeDeleted ? 'id = ?' : 'id = ? AND deletedat IS NULL';
  return db.prepare(`SELECT * FROM nfe_notas WHERE ${clause}`).get(id) || null;
}

function listarEventosNota(db, nota) {
  return db.prepare(`
    SELECT id, nfeid, ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, texto, createdat,
           CASE WHEN xml IS NOT NULL AND length(xml) > 0 THEN 1 ELSE 0 END AS tem_xml
    FROM nfe_eventos
    WHERE nfeid = ? OR chave = ? OR (? IS NOT NULL AND ordemid = ?)
    ORDER BY createdat DESC, id DESC
  `).all(nota.id, nota.chave || '', nota.ordemid || null, nota.ordemid || null);
}

function moverNotaParaLixeira(db, id, userId, reason) {
  return db.prepare(`
    UPDATE nfe_notas
    SET deletedat=datetime('now','localtime'),
        deletedpor=?,
        deletedreason=?,
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(userId || null, reason, id);
}

function restaurarNotaDaLixeira(db, id) {
  return db.prepare(`
    UPDATE nfe_notas
    SET deletedat=NULL,
        deletedpor=NULL,
        deletedreason=NULL,
        updatedat=datetime('now','localtime')
    WHERE id=?
  `).run(id);
}
```

Export the helpers.

- [ ] **Step 4: Update route reads in `backend/routes/nfe.js`**

At the top of `backend/routes/nfe.js`, import helpers:

```js
const {
  listarEventosNota,
  listarNotasFiscais,
  moverNotaParaLixeira,
  resolverNotaPorChave,
  resolverNotaPorId,
  restaurarNotaDaLixeira,
} = require('../services/nfeNotasService');
```

Replace `GET /api/nfe` body with:

```js
const rows = listarNotasFiscais(getDB(), { lixeira: false });
const autorizadasHomologacao = rows.filter(n => n.nfe_status === 'autorizado').length;
```

Replace `GET /api/nfe/lixeira` body with:

```js
const rows = listarNotasFiscais(getDB(), { lixeira: true });
```

Replace XML and DANFE lookup from `ordens` with `resolverNotaPorChave(db, chave)` and `nota.xml`.

Replace DELETE/restore to operate on `nfe_notas` by `id`.

- [ ] **Step 5: Run route contract tests and focused service tests**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js nfeNotasService.test.js
```

Expected: PASS. If legacy contract tests still assert `ordens.nfe_deletedat`, update those tests to assert Phase 1 fallback exists only in spec/DB, not route writes.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add backend/routes/nfe.js backend/services/nfeNotasService.js backend/__tests__/routeContracts.test.js
git commit -m "feat: read fiscal notes from canonical table"
```

---

### Task 5: OS Emission Through Canonical Notes

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/services/nfeNotasService.js`
- Modify: `backend/__tests__/routeContracts.test.js`
- Modify: `backend/__tests__/nfeNotasService.test.js`

- [ ] **Step 1: Write failing active OS note test**

Append to `backend/__tests__/nfeNotasService.test.js`:

```js
import { buscarNotaAtivaParaOrdem } from '../services/nfeNotasService.js';

it('blocks a new OS emission when an active note already exists', () => {
  const db = makeDb();
  db.prepare("INSERT INTO nfe_notas (origem, ordemid, cliente_snapshot, emitente_snapshot, valortotal, ambiente, status, serie) VALUES ('ordem', 10, '{}', '{}', 120, 2, 'autorizado', '1')").run();

  const nota = buscarNotaAtivaParaOrdem(db, 10);

  expect(nota).toMatchObject({ origem: 'ordem', ordemid: 10, status: 'autorizado' });
});
```

- [ ] **Step 2: Run service tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasService.test.js
```

Expected: PASS if Task 2 already exported `buscarNotaAtivaParaOrdem`; otherwise FAIL and implement/export it.

- [ ] **Step 3: Update OS validation path**

In `backend/routes/nfe.js`, update `validarOrdemEmitivel` or the call site to check:

```js
const notaAtiva = buscarNotaAtivaParaOrdem(db, os.id);
if (notaAtiva) {
  return res.status(409).json({ erro: 'NF-e ja autorizada ou em emissao para esta OS' });
}
```

Use this before acquiring an emission lock.

- [ ] **Step 4: Persist OS emission to `nfe_notas`**

In `backend/services/nfeNotasService.js`, add functions:

```js
function criarNotaEmitindo(db, data) {
  const info = db.prepare(`
    INSERT INTO nfe_notas
      (origem, ordemid, clienteid, cliente_snapshot, emitente_snapshot, valortotal,
       descontovalor, pagamento, ambiente, numero, serie, status, criadopor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitindo', ?)
  `).run(
    data.origem,
    data.ordemid || null,
    data.clienteid || null,
    json(data.cliente_snapshot || {}),
    json(data.emitente_snapshot || {}),
    Number(data.valortotal || 0),
    Number(data.descontovalor || 0),
    data.pagamento || 'Pix',
    Number(data.ambiente || 2),
    data.numero || null,
    data.serie || '1',
    data.criadopor || null
  );
  return resolverNotaPorId(db, Number(info.lastInsertRowid), { includeDeleted: true });
}

function substituirItensNota(db, nfeid, itens = []) {
  db.prepare('DELETE FROM nfe_itens WHERE nfeid=?').run(nfeid);
  const insert = db.prepare(`
    INSERT INTO nfe_itens
      (nfeid, ordem_item_id, produto_id, nome, quantidade, preco_unitario, avulso,
       ncm, cfop, csosn, origem_fiscal, unidade)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of itens) {
    insert.run(
      nfeid,
      item.id || item.ordem_item_id || null,
      item.produto_id || null,
      item.nome || item.produto_nome || 'PRODUTO',
      Number(item.quantidade || 1),
      Number(item.preco_unitario || 0),
      item.avulso ? 1 : 0,
      item.ncm,
      item.cfop,
      item.csosn,
      String(item.origem_fiscal ?? '0'),
      item.unidade || 'UN'
    );
  }
}
```

Also add `marcarNotaAutorizada()` and `marcarNotaRejeitada()` helpers to update `nfe_notas`.

- [ ] **Step 5: Replace OS emission writes**

In `backend/routes/nfe.js`, replace the `UPDATE ordens SET nfe_status='emitindo'` lock with `criarNotaEmitindo()` after checking no active note exists. On SEFAZ communication failure or rejection, call `marcarNotaRejeitada()`. On success, call `marcarNotaAutorizada()` and `substituirItensNota()`.

Do not write active emission state to `ordens.nfe_*` in the new path. Phase 1 compatibility keeps the legacy columns in the database for rollback and backfill comparison, while route reads use `nfe_notas`.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasService.test.js routeContracts.test.js nfeEmissionRules.test.js nfe.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Run:

```powershell
git add backend/routes/nfe.js backend/services/nfeNotasService.js backend/__tests__/nfeNotasService.test.js backend/__tests__/routeContracts.test.js
git commit -m "feat: emit order nfe through canonical notes"
```

---

### Task 6: Avulsa Backend Endpoints

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/services/nfeNotasService.js`
- Modify: `backend/__tests__/routeContracts.test.js`
- Modify: `backend/__tests__/nfeNotasService.test.js`

- [ ] **Step 1: Write failing route authorization contract**

In `backend/__tests__/routeContracts.test.js`, extend fiscal route restrictions:

```js
expect(routeRoles(nfeRouter, 'get', '/avulsa/preview')).toEqual(['admin', 'caixa']);
expect(routeRoles(nfeRouter, 'post', '/avulsa/preview')).toEqual(['admin', 'caixa']);
expect(routeRoles(nfeRouter, 'post', '/avulsa')).toEqual(['admin', 'caixa']);
```

- [ ] **Step 2: Run route contract test and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL because avulsa routes do not exist.

- [ ] **Step 3: Add avulsa preview service**

In `backend/services/nfeNotasService.js`, add:

```js
function montarDocumentoFiscalAvulso({ cliente, itens, pagamento = 'Pix' }) {
  const total = itens.reduce((acc, item) => acc + Number(item.quantidade || 1) * Number(item.preco_unitario || 0), 0);
  return {
    valortotal: Math.round(total * 100) / 100,
    descontovalor: 0,
    pagamento,
    cliente,
    itens,
  };
}
```

Export it.

- [ ] **Step 4: Add avulsa routes**

In `backend/routes/nfe.js`, add static avulsa routes before dynamic `/:chave` routes:

```js
router.get('/avulsa/preview', auth(['admin', 'caixa']), (req, res) => {
  res.json({
    origem: 'avulsa',
    ordem: {
      numero: 'Avulsa',
      servico: 'NF-e avulsa',
      pagamento: 'Pix',
      valortotal: 0,
      descontovalor: 0,
    },
    cliente: {
      id: null,
      nome: '',
      documento: '',
      ie: '',
      logradouro: '',
      numero: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
    },
    emitente: getEmitenteConfig(),
    fiscal: {
      ambiente: tpAmbAtual(),
      serie: getSerieNFe(),
      autXML: [],
    },
    itens: [],
  });
});
```

`POST /avulsa/preview` normalizes `req.body.itens` with `normalizarItensAvulsosNFe`, applies and validates the customer shape with existing customer helpers, and returns the same preview shape with totals.

`POST /avulsa` mirrors the OS emission pipeline with `origem='avulsa'`, no `ordemid`, and no inserts into caixa/OS tables.

- [ ] **Step 5: Add service test for no caixa side effects**

Append to `backend/__tests__/nfeNotasService.test.js`:

```js
it('creates avulsa notes without requiring ordem or caixa tables', () => {
  const db = makeDb();
  const nota = db.prepare(`
    INSERT INTO nfe_notas
      (origem, cliente_snapshot, emitente_snapshot, valortotal, ambiente, numero, serie, status)
    VALUES ('avulsa', '{}', '{}', 80, 2, '301', '1', 'emitindo')
    RETURNING *
  `).get();

  expect(nota.origem).toBe('avulsa');
  expect(nota.ordemid).toBeNull();
});
```

- [ ] **Step 6: Run backend tests**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js nfeNotasService.test.js nfeEmissionRules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

Run:

```powershell
git add backend/routes/nfe.js backend/services/nfeNotasService.js backend/__tests__/routeContracts.test.js backend/__tests__/nfeNotasService.test.js
git commit -m "feat: add avulsa nfe backend flow"
```

---

### Task 7: Events, CC-e, Cancelamento, and Inutilizacao

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/services/nfeNotasService.js`
- Modify: `backend/services/nfeInutilizacaoService.js`
- Modify: `backend/__tests__/nfeInutilizacaoService.test.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing inutilizacao test**

In `backend/__tests__/nfeInutilizacaoService.test.js`, add a test table row for `nfe_notas` and assert used number blocks inutilizacao:

```js
it('bloqueia inutilizacao quando numero existe em nfe_notas', async () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nfe_notas (
      id INTEGER PRIMARY KEY,
      ambiente INTEGER,
      numero TEXT,
      serie TEXT,
      status TEXT
    );
  `);
  db.prepare("INSERT INTO nfe_notas (ambiente, numero, serie, status) VALUES (2, '000000280', '1', 'autorizado')").run();

  await expect(service.solicitar({
    ...pedidoBase,
    idempotencyKey: 'req-280-nfe-notas',
  }, 7)).rejects.toMatchObject({ code: 'numero_utilizado' });
});
```

- [ ] **Step 2: Run inutilizacao tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeInutilizacaoService.test.js
```

Expected: FAIL because `buscarNumeroUtilizado()` only checks `ordens`.

- [ ] **Step 3: Update used-number lookup**

Modify `buscarNumeroUtilizado()` in `backend/services/nfeInutilizacaoService.js` to query `nfe_notas` first when table exists:

```js
function tabelaExiste(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
```

Then:

```js
if (tabelaExiste(db, 'nfe_notas')) {
  const rowsNotas = db.prepare(`
    SELECT id, numero AS nfe_numero, serie AS nfe_serie
    FROM nfe_notas
    WHERE numero IS NOT NULL
      AND COALESCE(serie, '1') = ?
      AND status IN ('emitindo', 'autorizado', 'cancelado')
  `).all(String(serie));
  const notaUsada = rowsNotas.find((row) => {
    const numero = normalizarNumeroNFeParaComparacao(row.nfe_numero);
    return numero >= inicio && numero <= fim;
  });
  if (notaUsada) return notaUsada;
}
```

Keep the existing `ordens` fallback for Phase 1.

- [ ] **Step 4: Update CC-e and cancelamento route resolution**

In `backend/routes/nfe.js`, replace `SELECT * FROM ordens WHERE nfe_chave = ?` with `resolverNotaPorChave(db, chave)`. Use note fields:

- `nota.status` instead of `os.nfe_status`
- `nota.createdat` for timing in Phase 1, because canonical notes persist the authorization timestamp there during backfill and successful emission
- `nota.protocolo` instead of `os.nfe_protocolo`
- `nota.id` for `registrarEventoFiscal({ nfeid: nota.id, ordemid: nota.ordemid })`

Update `registrarEventoFiscal()` to insert `nfeid` when provided.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeInutilizacaoService.test.js routeContracts.test.js nfeCommunication.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

Run:

```powershell
git add backend/routes/nfe.js backend/services/nfeNotasService.js backend/services/nfeInutilizacaoService.js backend/__tests__/nfeInutilizacaoService.test.js backend/__tests__/routeContracts.test.js
git commit -m "feat: resolve fiscal events through nfe notes"
```

---

### Task 8: OS API NF-e Summary Compatibility

**Files:**
- Modify: `backend/routes/ordens.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Write failing source contract test**

In `backend/__tests__/routeContracts.test.js`, add:

```js
it('hydrates OS NF-e summary from nfe_notas instead of legacy ordem columns', () => {
  const source = fs.readFileSync(new URL('../routes/ordens.js', import.meta.url), 'utf8');

  expect(source).toMatch(/nfe_notas/);
  expect(source).toMatch(/nfe_status/);
  expect(source).not.toMatch(/o\.nfe_xml/);
});
```

- [ ] **Step 2: Run route contract tests and verify RED**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: FAIL if `SEL_ORDEM` still reads only `ordens.nfe_*`.

- [ ] **Step 3: Update order select**

In `backend/routes/ordens.js`, modify `SEL_ORDEM` to left join latest canonical NF-e for each OS:

```sql
LEFT JOIN nfe_notas nn ON nn.id = (
  SELECT n2.id
  FROM nfe_notas n2
  WHERE n2.origem = 'ordem'
    AND n2.ordemid = o.id
    AND n2.deletedat IS NULL
  ORDER BY
    CASE n2.status WHEN 'autorizado' THEN 1 WHEN 'emitindo' THEN 2 WHEN 'rejeitado' THEN 3 WHEN 'cancelado' THEN 4 ELSE 5 END,
    n2.id DESC
  LIMIT 1
)
```

Expose aliases:

```sql
nn.status AS nfe_status,
nn.chave AS nfe_chave,
nn.protocolo AS nfe_protocolo,
nn.numero AS nfe_numero,
nn.serie AS nfe_serie,
nn.createdat AS nfe_emitida_em,
nn.rejeicao_motivo AS nfe_rejeicao_motivo,
nn.cancelado_em AS nfe_cancelado_em,
nn.cancel_protocolo AS nfe_cancel_protocolo,
nn.cancel_motivo AS nfe_cancel_motivo
```

Do not expose `nn.xml` to the OS route.

- [ ] **Step 4: Run tests**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

Run:

```powershell
git add backend/routes/ordens.js backend/__tests__/routeContracts.test.js
git commit -m "feat: hydrate order nfe summary from notes"
```

---

### Task 9: Frontend Avulsa UI

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Modify: `frontend/src/pages/NotasFiscais.test.jsx`

- [ ] **Step 1: Write failing frontend tests**

Update `frontend/src/pages/NotasFiscais.test.jsx` to include `post` mock and user-event:

```js
import userEvent from '@testing-library/user-event';
```

Extend API mock:

```js
default: {
  get: vi.fn(),
  post: vi.fn(),
}
```

Add:

```js
it('opens avulsa mode from the emission modal', async () => {
  api.get.mockImplementation((url) => {
    if (url === '/nfe') return Promise.resolve({ data: { notas: [], meta: { ambiente: 1 } } });
    if (url === '/ordens') return Promise.resolve({ data: { ordens: [] } });
    if (url === '/produtos') return Promise.resolve({ data: [] });
    if (url === '/clientes') return Promise.resolve({ data: { clientes: [] } });
    if (url === '/nfe/avulsa/preview') {
      return Promise.resolve({
        data: {
          origem: 'avulsa',
          ordem: { numero: 'Avulsa', servico: 'NF-e avulsa', pagamento: 'Pix', valortotal: 0 },
          cliente: { nome: '', documento: '', ie: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '' },
          emitente: { xNome: 'Arte' },
          fiscal: { ambiente: 1, serie: '1' },
          itens: [],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });

  render(<NotasFiscais />);

  await userEvent.click(await screen.findByRole('button', { name: /emitir nf-e/i }));
  await userEvent.click(await screen.findByRole('button', { name: /avulsa/i }));

  expect(await screen.findByText(/NF-e avulsa/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/buscar produto cadastrado/i)).toBeInTheDocument();
});
```

Add a list rendering test:

```js
it('renders avulsa origin in the NF-e list', async () => {
  api.get.mockResolvedValue({
    data: {
      notas: [{
        id: 1,
        origem: 'avulsa',
        numero: 'Avulsa',
        clientenome: 'Cliente Avulso',
        servico: 'NF-e avulsa',
        valortotal: 80,
        nfe_status: 'autorizado',
        nfe_numero: '301',
        nfe_serie: '1',
      }],
      meta: { ambiente: 1 },
    },
  });

  render(<NotasFiscais />);

  expect(await screen.findByText('Avulsa')).toBeInTheDocument();
  expect(screen.getByText('Cliente Avulso')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
cd frontend
npm.cmd test -- NotasFiscais.test.jsx
```

Expected: FAIL because Avulsa mode/UI does not exist and API mock lacks some calls.

- [ ] **Step 3: Add avulsa UI state and loaders**

In `frontend/src/pages/NotasFiscais.jsx`, extend `ModalEmitir`:

- add `modo` state: `'os' | 'avulsa'`
- load `/produtos` and `/clientes` when modal opens
- add `carregarPreviaAvulsa()`
- add `criarPreviaAvulsa()` using `/nfe/avulsa/preview`
- add `handleEmitirAvulsa()` using `/nfe/avulsa`

- [ ] **Step 4: Add compact item picker inside `NotasFiscais.jsx`**

Implement a local `NfeItemPicker` based on `Atendimento.jsx` but preserving fiscal fields:

```js
function produtoParaItemNfe(p) {
  return {
    produto_id: p.id,
    nome: p.nome,
    quantidade: 1,
    preco_unitario: Number(p.preco || 0),
    avulso: false,
    ncm: String(p.ncm || '44151000').replace(/\D/g, '').padStart(8, '0').slice(-8),
    cfop: String(p.cfop || '5102').replace(/\D/g, '').slice(0, 4) || '5102',
    csosn: String(p.csosn || '400').replace(/\D/g, '').padStart(3, '0').slice(-3),
    origem_fiscal: String(p.origem_fiscal ?? '0').replace(/\D/g, '').slice(0, 1) || '0',
    unidade: String(p.unidade || 'UN').trim().toUpperCase().slice(0, 6) || 'UN',
  };
}
```

For item avulso, create the same shape with `produto_id: null`, price `0`, and default fiscal fields visible for review.

- [ ] **Step 5: Update listing origin column**

Change table headers and row cells from `OS` to `Origem`, rendering:

```jsx
{n.origem === 'avulsa' ? 'Avulsa' : (n.numero || n.numero_os || '-')}
```

Keep actions XML/DANFE/CC-e/cancelamento by `n.nfe_chave`.

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
cd frontend
npm.cmd test -- NotasFiscais.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 9**

Run:

```powershell
git add frontend/src/pages/NotasFiscais.jsx frontend/src/pages/NotasFiscais.test.jsx
git commit -m "feat: add avulsa nfe review flow"
```

---

### Task 10: Final Verification and Phase 2 Guard

**Files:**
- Modify: `backend/__tests__/routeContracts.test.js`
- Modify: `docs/superpowers/specs/2026-07-01-nfe-entidade-unica-avulsa-design.md` only if implementation reveals a necessary spec correction

- [ ] **Step 1: Add Phase 2 guard test**

In `backend/__tests__/routeContracts.test.js`, add:

```js
it('documents phase 2 cleanup by keeping legacy ordem NF-e columns out of active fiscal routes', () => {
  const nfeSource = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

  expect(nfeSource).not.toMatch(/FROM ordens[\s\S]+nfe_chave/);
  expect(nfeSource).not.toMatch(/UPDATE ordens SET[\s\S]+nfe_status/);
  expect(nfeSource).toMatch(/nfe_notas/);
});
```

- [ ] **Step 2: Run all focused backend tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeNotasRules.test.js nfeNotasDatabase.test.js nfeNotasService.test.js nfeEmissionRules.test.js nfe.test.js nfeInutilizacaoService.test.js routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 3: Run backend suite**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: PASS. Record total files/tests from output.

- [ ] **Step 4: Run frontend NF-e tests and build**

Run:

```powershell
cd frontend
npm.cmd test -- NotasFiscais.test.jsx
npm.cmd run build
```

Expected: PASS and build exit code 0.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only files from this plan are modified or committed; unrelated pre-existing workspace changes remain outside this task.

- [ ] **Step 6: Commit final guard when Step 1 changed files**

Run:

```powershell
git add backend/__tests__/routeContracts.test.js docs/superpowers/specs/2026-07-01-nfe-entidade-unica-avulsa-design.md
git commit -m "test: guard canonical nfe route usage"
```

When Task 10 only verifies existing changes and creates no diff, record that no final guard commit was needed in the task summary.

---

## Implementation Order

1. Task 1: schema and pure rules.
2. Task 2: backfill/read service.
3. Task 3: avulsa item normalization.
4. Task 4: route reads, XML, DANFE, lixeira.
5. Task 5: OS emission via `nfe_notas`.
6. Task 6: avulsa backend endpoints.
7. Task 7: fiscal events and inutilizacao.
8. Task 8: OS API compatibility.
9. Task 9: frontend avulsa UI.
10. Task 10: final verification and Phase 2 guard.

Do not run Task 9 before Tasks 4-6 have backend route shape available, except for isolated frontend tests with mocks.
