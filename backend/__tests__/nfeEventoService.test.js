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

function respostaAutorizada() {
  return {
    retEvento: {
      infEvento: {
        cStat: '135',
        nProt: '1352601',
        xMotivo: 'Evento registrado',
        dhRegEvento: NOW,
      },
    },
    xml: '<procEventoNFe />',
  };
}

function makeService(overrides = {}) {
  const db = createDb();
  const repo = createNfeEventoAttemptRepository(db, { agora: () => NOW });
  const transmitir = overrides.transmitir || vi.fn(async () => respostaAutorizada());
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

    expect(result).toMatchObject({
      httpStatus: 200,
      ok: true,
      status: 'autorizado',
      protocolo: '1352601',
    });
    expect(h.db.prepare('SELECT tipo, cstat FROM nfe_eventos').get())
      .toMatchObject({ tipo: 'cce', cstat: '135' });
    expect(h.db.prepare('SELECT status FROM nfe_evento_tentativas').get().status).toBe('autorizado');
  });

  it('vincula evento autorizado ao nfeid canonico quando informado', async () => {
    const h = makeService();

    await h.service.executar({
      ordemId: 7,
      nfeid: 55,
      chave: CHAVE,
      tipo: 'cce',
      nSeqEvento: 1,
      texto: 'Correcao fiscal permitida',
      payload: { evento: [] },
    });

    expect(h.db.prepare('SELECT nfeid, tipo FROM nfe_eventos').get())
      .toEqual({ nfeid: 55, tipo: 'cce' });
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

    const primeira = h.service.executar({
      ordemId: 7,
      chave: CHAVE,
      tipo: 'cce',
      nSeqEvento: 1,
      texto: 'Correcao fiscal permitida',
      payload: {},
    });

    await vi.advanceTimersByTimeAsync(11);

    await expect(primeira).resolves.toMatchObject({ httpStatus: 409, status: 'incerto' });
    await expect(h.service.executar({
      ordemId: 7,
      chave: CHAVE,
      tipo: 'cce',
      nSeqEvento: 1,
      texto: 'Correcao fiscal permitida',
      payload: {},
    })).resolves.toMatchObject({ httpStatus: 409, code: 'nfe_evento_tentativa_ativa' });

    resolveTransmissao(respostaAutorizada());
    await vi.runAllTimersAsync();

    expect(h.db.prepare('SELECT status FROM nfe_evento_tentativas').get().status).toBe('autorizado');
  });

  it('reverte cancelamento quando registro de evento falha', async () => {
    const h = makeService();
    h.db.exec('DROP TABLE nfe_eventos');

    await expect(h.service.executar({
      ordemId: 7,
      chave: CHAVE,
      tipo: 'cancelamento',
      nSeqEvento: 1,
      texto: 'Cancelamento por erro operacional',
      payload: {},
    })).resolves.toMatchObject({ httpStatus: 409, status: 'incerto' });

    expect(h.db.prepare('SELECT nfe_status FROM ordens WHERE id=7').get().nfe_status).toBe('autorizado');
  });
});
