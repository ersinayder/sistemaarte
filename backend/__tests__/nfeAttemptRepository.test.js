import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { createNfeAttemptRepository } from '../repositories/nfeAttemptRepository.js';

const require = createRequire(import.meta.url);

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nfe_sequencias (
      serie TEXT PRIMARY KEY,
      ultimo_numero INTEGER DEFAULT 0
    );
    CREATE TABLE nfe_emissao_tentativas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ordemid INTEGER NOT NULL,
      operacao TEXT NOT NULL DEFAULT 'emissao',
      idempotency_key TEXT NOT NULL UNIQUE,
      numero INTEGER NOT NULL,
      serie TEXT NOT NULL,
      lote TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processando','incerto','autorizado','rejeitado','falha_local')),
      cstat TEXT,
      motivo TEXT,
      chave TEXT,
      protocolo TEXT,
      xml_envio TEXT,
      xml_retorno TEXT,
      erro_local TEXT,
      solicitado_por INTEGER,
      createdat TEXT DEFAULT (datetime('now','localtime')),
      updatedat TEXT DEFAULT (datetime('now','localtime')),
      concluido_em TEXT
    );
    CREATE UNIQUE INDEX idx_nfe_emissao_tentativas_ativa
      ON nfe_emissao_tentativas(ordemid, operacao)
      WHERE status IN ('processando','incerto');
    CREATE TABLE nfe_emissao_transicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tentativaid INTEGER NOT NULL,
      ordemid INTEGER NOT NULL,
      status TEXT NOT NULL,
      cstat TEXT,
      motivo TEXT,
      createdat TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

describe('nfeAttemptRepository', () => {
  let db;
  let repository;

  beforeEach(() => {
    db = createDb();
    repository = createNfeAttemptRepository(db, {
      agora: () => '2026-06-20T12:00:00.000Z',
    });
  });

  afterEach(() => db.close());

  it('reserva numero, tentativa e transicao atomicamente', () => {
    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    expect(tentativa).toMatchObject({
      ordemid: 17,
      operacao: 'emissao',
      numero: 1,
      serie: '1',
      lote: '000000001',
      status: 'processando',
      idempotency_key: 'emissao:17:1:1:a1',
      solicitado_por: 9,
    });
    expect(db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
    expect(db.prepare('SELECT tentativaid, ordemid, status FROM nfe_emissao_transicoes').all())
      .toEqual([{ tentativaid: tentativa.id, ordemid: 17, status: 'processando' }]);
  });

  it('rejeita segunda tentativa ativa sem consumir numero', () => {
    repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    expect(() => repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 }))
      .toThrow(expect.objectContaining({
        status: 409,
        code: 'nfe_tentativa_ativa',
      }));
    expect(db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
    expect(db.prepare('SELECT COUNT(*) AS total FROM nfe_emissao_tentativas').get())
      .toEqual({ total: 1 });
  });

  it('mantem tentativa incerta como bloqueio para nova reserva', () => {
    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
    repository.transicionar(tentativa.id, 'incerto', {
      motivo: 'Timeout ao aguardar a SEFAZ',
    });

    expect(repository.buscarAtivaPorOrdem(17)).toMatchObject({
      id: tentativa.id,
      status: 'incerto',
    });
    expect(() => repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 }))
      .toThrow(expect.objectContaining({
        status: 409,
        code: 'nfe_tentativa_ativa',
      }));
    expect(db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
  });

  it('permite processando para incerto para autorizado com historico correto', () => {
    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    repository.transicionar(tentativa.id, 'incerto', {
      cstat: 'timeout',
      motivo: 'Resposta nao confirmada',
      xml_envio: '<enviNFe />',
    });
    const autorizada = repository.transicionar(tentativa.id, 'autorizado', {
      cstat: '100',
      motivo: 'Autorizado o uso da NF-e',
      chave: '31260607500718000196550010000000011000000019',
      protocolo: '131260000000001',
      xml_retorno: '<nfeProc />',
    });

    expect(autorizada).toMatchObject({
      status: 'autorizado',
      cstat: '100',
      motivo: 'Autorizado o uso da NF-e',
      chave: '31260607500718000196550010000000011000000019',
      protocolo: '131260000000001',
      xml_envio: '<enviNFe />',
      xml_retorno: '<nfeProc />',
      concluido_em: '2026-06-20T12:00:00.000Z',
    });
    expect(db.prepare(`
      SELECT status, cstat, motivo
      FROM nfe_emissao_transicoes
      WHERE tentativaid = ?
      ORDER BY id
    `).all(tentativa.id)).toEqual([
      { status: 'processando', cstat: null, motivo: null },
      { status: 'incerto', cstat: 'timeout', motivo: 'Resposta nao confirmada' },
      { status: 'autorizado', cstat: '100', motivo: 'Autorizado o uso da NF-e' },
    ]);
  });

  it.each(['autorizado', 'rejeitado', 'falha_local'])(
    'nao permite regressao a partir do estado terminal %s',
    (estadoTerminal) => {
      const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
      repository.transicionar(tentativa.id, estadoTerminal);

      expect(() => repository.transicionar(tentativa.id, 'incerto'))
        .toThrow(expect.objectContaining({
          status: 409,
          code: 'nfe_transicao_invalida',
        }));
      expect(repository.buscarPorId(tentativa.id).status).toBe(estadoTerminal);
    }
  );

  it('torna repeticao do mesmo estado idempotente sem duplicar transicao', () => {
    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    const repetida = repository.transicionar(tentativa.id, 'processando', {
      motivo: 'Nao deve sobrescrever nem criar evento',
    });

    expect(repetida.status).toBe('processando');
    expect(repetida.motivo).toBeNull();
    expect(db.prepare(`
      SELECT COUNT(*) AS total
      FROM nfe_emissao_transicoes
      WHERE tentativaid = ?
    `).get(tentativa.id)).toEqual({ total: 1 });
  });

  it('retorna erros tipados para tentativa ausente e transicao invalida', () => {
    expect(() => repository.transicionar(999, 'incerto'))
      .toThrow(expect.objectContaining({
        status: 404,
        code: 'nfe_tentativa_nao_encontrada',
      }));

    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
    expect(() => repository.transicionar(tentativa.id, 'status-inexistente'))
      .toThrow(expect.objectContaining({
        status: 409,
        code: 'nfe_transicao_invalida',
      }));
  });

  it('participa de transacao externa sem abrir transacao aninhada', () => {
    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
    const transacaoExterna = db.transaction(() => {
      repository.transicionarNaTransacao(tentativa.id, 'autorizado', {
        cstat: '100',
      });
      throw new Error('forcar rollback externo');
    });

    expect(() => transacaoExterna()).toThrow('forcar rollback externo');
    expect(repository.buscarPorId(tentativa.id).status).toBe('processando');
    expect(db.prepare(`
      SELECT COUNT(*) AS total
      FROM nfe_emissao_transicoes
      WHERE tentativaid = ?
    `).get(tentativa.id)).toEqual({ total: 1 });
  });

  it.each(['rejeitado', 'falha_local'])(
    'devolve o ultimo numero em %s sem alterar status ou historico',
    (estado) => {
      const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
      repository.transicionar(tentativa.id, estado, { cstat: '386' });
      const transicoesAntes = db.prepare(`
        SELECT COUNT(*) AS total
        FROM nfe_emissao_transicoes
        WHERE tentativaid = ?
      `).get(tentativa.id).total;

      expect(repository.devolverNumero(tentativa.id)).toBe(true);
      expect(db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
        .toEqual({ ultimo_numero: 0 });
      expect(repository.buscarPorId(tentativa.id).status).toBe(estado);
      expect(db.prepare(`
        SELECT COUNT(*) AS total
        FROM nfe_emissao_transicoes
        WHERE tentativaid = ?
      `).get(tentativa.id)).toEqual({ total: transicoesAntes });
    }
  );

  it('nao devolve numero quando a sequencia da serie ja avancou', () => {
    const primeira = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
    repository.transicionar(primeira.id, 'rejeitado');
    repository.reservar({ ordemId: 18, serie: '1', usuarioId: 9 });

    expect(repository.devolverNumero(primeira.id)).toBe(false);
    expect(db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 2 });
  });

  it.each(['processando', 'incerto', 'autorizado'])(
    'nao devolve numero no estado %s',
    (estado) => {
      const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
      if (estado !== 'processando') repository.transicionar(tentativa.id, estado);

      expect(repository.devolverNumero(tentativa.id)).toBe(false);
      expect(db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
        .toEqual({ ultimo_numero: 1 });
    }
  );

  it('reutiliza numero devolvido com nova tentativa versionada sem alterar a anterior', () => {
    const primeira = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });
    repository.transicionar(primeira.id, 'rejeitado', {
      cStat: '386',
      motivo: 'CFOP incompativel',
    });
    expect(repository.devolverNumero(primeira.id)).toBe(true);

    const segunda = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    expect(primeira.idempotency_key).toBe('emissao:17:1:1:a1');
    expect(segunda).toMatchObject({
      numero: 1,
      idempotency_key: 'emissao:17:1:1:a2',
      status: 'processando',
    });
    expect(repository.buscarPorId(primeira.id)).toMatchObject({
      status: 'rejeitado',
      cstat: '386',
      motivo: 'CFOP incompativel',
    });
    expect(db.prepare(`
      SELECT idempotency_key, status
      FROM nfe_emissao_tentativas
      ORDER BY id
    `).all()).toEqual([
      { idempotency_key: 'emissao:17:1:1:a1', status: 'rejeitado' },
      { idempotency_key: 'emissao:17:1:1:a2', status: 'processando' },
    ]);
  });

  it('persiste todos os campos do contrato publico camelCase', () => {
    const tentativa = repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    const atualizada = repository.transicionar(tentativa.id, 'autorizado', {
      cStat: '100',
      xmlEnvio: '<enviNFe />',
      xmlRetorno: '<nfeProc />',
      erroLocal: 'alerta recuperavel',
      chave: '31260607500718000196550010000000011000000019',
      protocolo: '131260000000001',
      motivo: 'Autorizado o uso da NF-e',
    });

    expect(atualizada).toMatchObject({
      cstat: '100',
      xml_envio: '<enviNFe />',
      xml_retorno: '<nfeProc />',
      erro_local: 'alerta recuperavel',
      chave: '31260607500718000196550010000000011000000019',
      protocolo: '131260000000001',
      motivo: 'Autorizado o uso da NF-e',
    });
  });

  it('nao converte conflito UNIQUE generico em tentativa ativa', () => {
    db.exec('CREATE UNIQUE INDEX teste_lote_unico ON nfe_emissao_tentativas(lote)');
    db.prepare(`
      INSERT INTO nfe_emissao_tentativas
        (ordemid, idempotency_key, numero, serie, lote, status, createdat, updatedat)
      VALUES (99, 'historico:outro', 99, '1', '000000001', 'rejeitado', 'agora', 'agora')
    `).run();

    expect(() => repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 }))
      .toThrow(expect.not.objectContaining({
        code: 'nfe_tentativa_ativa',
      }));
  });

  it.each([
    ['insert da tentativa', 'nfe_emissao_tentativas'],
    ['insert da transicao', 'nfe_emissao_transicoes'],
  ])('faz rollback da sequencia se o %s falhar', (_cenario, tabela) => {
    db.exec(`
      CREATE TRIGGER falha_reserva
      BEFORE INSERT ON ${tabela}
      BEGIN
        SELECT RAISE(ABORT, 'falha injetada');
      END;
    `);

    expect(() => repository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 }))
      .toThrow('falha injetada');
    expect(db.prepare('SELECT * FROM nfe_sequencias').all()).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS total FROM nfe_emissao_tentativas').get())
      .toEqual({ total: 0 });
    expect(db.prepare('SELECT COUNT(*) AS total FROM nfe_emissao_transicoes').get())
      .toEqual({ total: 0 });
  });

  it('aplica DDL exportado com constraints e indices operacionais reais', () => {
    const { getNfeEmissaoSchemaStatements } = require('../database.js');
    expect(getNfeEmissaoSchemaStatements).toBeTypeOf('function');

    const schemaDb = new Database(':memory:');
    try {
      schemaDb.exec(getNfeEmissaoSchemaStatements().join(';\n'));

      const columns = schemaDb.prepare('PRAGMA table_info(nfe_emissao_tentativas)').all();
      const byName = Object.fromEntries(columns.map((column) => [column.name, column]));
      expect(byName.lote.notnull).toBe(0);
      expect(byName.createdat.notnull).toBe(1);
      expect(byName.updatedat.notnull).toBe(1);
      expect(byName.concluido_em.notnull).toBe(0);

      const indexes = schemaDb.prepare('PRAGMA index_list(nfe_emissao_tentativas)').all();
      expect(indexes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'idx_nfe_emissao_tentativa_ativa',
          unique: 1,
          partial: 1,
        }),
        expect.objectContaining({
          name: 'idx_nfe_emissao_tentativas_ordem',
          unique: 0,
          partial: 0,
        }),
      ]));
      expect(schemaDb.prepare('PRAGMA index_info(idx_nfe_emissao_tentativa_ativa)').all()
        .map((column) => column.name)).toEqual(['ordemid', 'operacao']);
      expect(schemaDb.prepare('PRAGMA index_list(nfe_emissao_transicoes)').all())
        .toEqual(expect.arrayContaining([
          expect.objectContaining({
            name: 'idx_nfe_emissao_transicoes_tentativa',
            unique: 0,
            partial: 0,
          }),
        ]));
      expect(schemaDb.prepare('PRAGMA index_info(idx_nfe_emissao_transicoes_tentativa)').all()
        .map((column) => column.name)).toEqual(['tentativaid', 'id']);
      const partialSql = schemaDb.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_nfe_emissao_tentativa_ativa'
      `).get().sql;
      expect(partialSql).toContain("WHERE status IN ('processando','incerto')");

      const insert = schemaDb.prepare(`
        INSERT INTO nfe_emissao_tentativas
          (ordemid, idempotency_key, numero, serie, status)
        VALUES (?, ?, ?, '1', ?)
      `);
      insert.run(17, 'ativa-1', 1, 'processando');
      expect(() => insert.run(17, 'ativa-2', 2, 'incerto')).toThrow();
      insert.run(18, 'final-1', 3, 'rejeitado');
      insert.run(18, 'ativa-3', 4, 'processando');
      expect(() => insert.run(19, 'status-invalido', 5, 'emitindo')).toThrow();
      expect(() => schemaDb.prepare(`
        INSERT INTO nfe_emissao_tentativas
          (ordemid, idempotency_key, numero, serie, status, createdat, updatedat)
        VALUES (20, 'datas-nulas', 6, '1', 'processando', NULL, NULL)
      `).run()).toThrow();
    } finally {
      schemaDb.close();
    }
  });
});
