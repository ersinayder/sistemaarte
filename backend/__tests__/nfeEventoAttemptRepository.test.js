import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
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
    const tentativa = repo.criar({
      ordemId: 7,
      chave: '35160607500718000196550010000002811000002810',
      tipo: 'cce',
      nSeqEvento: 2,
      usuarioId: 3,
    });

    expect(tentativa).toMatchObject({
      ordemid: 7,
      tipo: 'cce',
      nseqevento: 2,
      status: 'processando',
    });
    expect(db.prepare('SELECT status, estado_novo FROM nfe_evento_transicoes').get())
      .toMatchObject({ status: 'processando', estado_novo: 'processando' });
  });

  it('bloqueia segunda tentativa ativa para chave tipo e sequencia', () => {
    const input = {
      ordemId: 7,
      chave: '35160607500718000196550010000002811000002810',
      tipo: 'cancelamento',
      nSeqEvento: 1,
      usuarioId: 3,
    };

    repo.criar(input);

    expect(() => repo.criar(input)).toThrowError(expect.objectContaining({
      status: 409,
      code: 'nfe_evento_tentativa_ativa',
    }));
  });

  it('nao permite regressao de autorizado para rejeitado', () => {
    const tentativa = repo.criar({
      ordemId: 7,
      chave: '35160607500718000196550010000002811000002810',
      tipo: 'cce',
      nSeqEvento: 1,
    });

    repo.transicionar(tentativa.id, 'autorizado', { cStat: '135' });

    expect(() => repo.transicionar(tentativa.id, 'rejeitado', { cStat: '573' }))
      .toThrowError(expect.objectContaining({ code: 'nfe_evento_transicao_invalida' }));
  });

  it('permite nova tentativa depois de rejeicao final', () => {
    const input = {
      ordemId: 7,
      chave: '35160607500718000196550010000002811000002810',
      tipo: 'cce',
      nSeqEvento: 1,
    };

    const primeira = repo.criar(input);
    repo.transicionar(primeira.id, 'rejeitado', { cStat: '573' });
    const segunda = repo.criar(input);

    expect(segunda.id).not.toBe(primeira.id);
  });
});
