import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createNfeAttemptRepository } from '../repositories/nfeAttemptRepository.js';
import { createNfePersistenceService } from '../services/nfePersistenceService.js';

const AGORA = '2026-06-20T15:00:00.000Z';
const CHAVE = '31260607500718000196550010000000011000000019';
const OUTRA_CHAVE = '31260607500718000196550010000000021000000024';
const PROTOCOLO = '131260000000001';
const XML = `<nfeProc><NFe><infNFe Id="NFe${CHAVE}" /></NFe><protNFe><infProt><chNFe>${CHAVE}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const XML_OUTRA_CHAVE = `<nfeProc><NFe><infNFe Id="NFe${OUTRA_CHAVE}" /></NFe><protNFe><infProt><chNFe>${OUTRA_CHAVE}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const XML_REJEITADO = `<nfeProc><NFe><infNFe Id="NFe${CHAVE}" /></NFe><protNFe><infProt><chNFe>${CHAVE}</chNFe><cStat>204</cStat></infProt></protNFe></nfeProc>`;

function createDb(options) {
  const db = new Database(':memory:', options);
  db.exec(`
    CREATE TABLE clientes (
      id INTEGER PRIMARY KEY,
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
      numero TEXT NOT NULL,
      clienteid INTEGER,
      deletedat TEXT,
      nfe_status TEXT,
      nfe_numero TEXT,
      nfe_serie TEXT,
      nfe_chave TEXT,
      nfe_protocolo TEXT,
      nfe_emitida_em TEXT,
      nfe_xml TEXT,
      nfe_cancelado_em TEXT,
      nfe_cancel_protocolo TEXT,
      nfe_cancel_motivo TEXT,
      nfe_deletedat TEXT,
      nfe_deletedpor INTEGER,
      nfe_deletedreason TEXT
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
      lote TEXT,
      status TEXT NOT NULL,
      cstat TEXT,
      motivo TEXT,
      chave TEXT,
      protocolo TEXT,
      xml_envio TEXT,
      xml_retorno TEXT,
      erro_local TEXT,
      solicitado_por INTEGER,
      createdat TEXT NOT NULL,
      updatedat TEXT NOT NULL,
      concluido_em TEXT
    );
    CREATE UNIQUE INDEX idx_nfe_emissao_tentativa_ativa
      ON nfe_emissao_tentativas(ordemid, operacao)
      WHERE status IN ('processando','incerto');
    CREATE TABLE nfe_emissao_transicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tentativaid INTEGER NOT NULL,
      ordemid INTEGER NOT NULL,
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

function seed(db, { tentativaStatus = 'processando', ordemDeleted = false, clienteDeleted = false } = {}) {
  db.prepare(`
    INSERT INTO clientes
      (id, cpf, ie, logradouro, numero, bairro, cidade, uf, cep, deletedat)
    VALUES (7, 'antigo', 'antiga', 'Rua Antiga', '1', 'Centro', 'Cidade', 'MG', '00000', ?)
  `).run(clienteDeleted ? AGORA : null);
  db.prepare(`
    INSERT INTO clientes (id, cpf, deletedat)
    VALUES (8, 'nao-alterar', NULL)
  `).run();
  db.prepare(`
    INSERT INTO ordens
      (id, numero, clienteid, deletedat, nfe_status, nfe_cancelado_em,
       nfe_cancel_protocolo, nfe_cancel_motivo, nfe_deletedat,
       nfe_deletedpor, nfe_deletedreason)
    VALUES (17, 'OS-0017', 7, ?, 'emitindo', 'cancelada', 'protocolo-antigo',
            'motivo-antigo', 'lixeira', 9, 'teste')
  `).run(ordemDeleted ? AGORA : null);
  db.prepare(`
    INSERT INTO nfe_emissao_tentativas
      (id, ordemid, idempotency_key, numero, serie, lote, status, createdat, updatedat)
    VALUES (33, 17, 'emissao:17:1:1:a1', 1, '1', '000000001', ?, ?, ?)
  `).run(tentativaStatus, AGORA, AGORA);
  db.prepare(`
    INSERT INTO nfe_emissao_transicoes
      (tentativaid, ordemid, status, estado_anterior, estado_novo, createdat)
    VALUES (33, 17, ?, NULL, ?, ?)
  `).run(tentativaStatus, tentativaStatus, AGORA);
}

function input(overrides = {}) {
  return {
    tentativaId: 33,
    ordemId: 17,
    numero: 1,
    serie: '1',
    chave: CHAVE,
    protocolo: PROTOCOLO,
    cStat: '100',
    motivo: 'Autorizado o uso da NF-e',
    xml: XML,
    cliente: {
      clienteid: 7,
      cpf: '12345678901',
      ie: 'ISENTO',
      logradouro: 'Rua Nova',
      c_numero: '22',
      bairro: 'Bairro Novo',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    },
    ...overrides,
  };
}

function snapshot(db) {
  return {
    ordem: db.prepare('SELECT * FROM ordens WHERE id = 17').get(),
    clientes: db.prepare('SELECT * FROM clientes ORDER BY id').all(),
    tentativa: db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id = 33').get(),
    eventos: db.prepare('SELECT * FROM nfe_eventos ORDER BY id').all(),
    transicoes: db.prepare('SELECT * FROM nfe_emissao_transicoes ORDER BY id').all(),
  };
}

describe('nfePersistenceService', () => {
  let db;
  let repository;
  let service;

  beforeEach(() => {
    db = createDb();
    seed(db);
    repository = createNfeAttemptRepository(db, { agora: () => AGORA });
    service = createNfePersistenceService({
      db,
      attemptRepository: repository,
      agora: () => AGORA,
    });
  });

  afterEach(() => db.close());

  it('persiste autorizacao, cliente correto, evento e historico atomicamente', () => {
    const result = service.autorizar(input());

    expect(result).toMatchObject({ id: 33, status: 'autorizado' });
    expect(db.prepare(`
      SELECT nfe_status, nfe_numero, nfe_serie, nfe_chave, nfe_protocolo,
             nfe_emitida_em, nfe_xml, nfe_cancelado_em, nfe_cancel_protocolo,
             nfe_cancel_motivo, nfe_deletedat, nfe_deletedpor, nfe_deletedreason
      FROM ordens WHERE id = 17
    `).get()).toEqual({
      nfe_status: 'autorizado',
      nfe_numero: '000000001',
      nfe_serie: '1',
      nfe_chave: CHAVE,
      nfe_protocolo: PROTOCOLO,
      nfe_emitida_em: AGORA,
      nfe_xml: XML,
      nfe_cancelado_em: null,
      nfe_cancel_protocolo: null,
      nfe_cancel_motivo: null,
      nfe_deletedat: null,
      nfe_deletedpor: null,
      nfe_deletedreason: null,
    });
    expect(db.prepare(`
      SELECT cpf, ie, logradouro, numero, bairro, cidade, uf, cep
      FROM clientes WHERE id = 7
    `).get()).toEqual({
      cpf: '12345678901',
      ie: 'ISENTO',
      logradouro: 'Rua Nova',
      numero: '22',
      bairro: 'Bairro Novo',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    });
    expect(db.prepare('SELECT cpf FROM clientes WHERE id = 8').get())
      .toEqual({ cpf: 'nao-alterar' });
    expect(db.prepare(`
      SELECT ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, xml, createdat
      FROM nfe_eventos
    `).get()).toEqual({
      ordemid: 17,
      chave: CHAVE,
      tipo: 'autorizacao',
      nseqevento: 1,
      protocolo: PROTOCOLO,
      cstat: '100',
      motivo: 'Autorizado o uso da NF-e',
      xml: XML,
      createdat: AGORA,
    });
    expect(repository.buscarPorId(33)).toMatchObject({
      status: 'autorizado',
      chave: CHAVE,
      protocolo: PROTOCOLO,
      cstat: '100',
      xml_retorno: XML,
    });
    expect(db.prepare(`
      SELECT estado_anterior, estado_novo
      FROM nfe_emissao_transicoes
      WHERE tentativaid = 33
      ORDER BY id DESC LIMIT 1
    `).get()).toEqual({
      estado_anterior: 'processando',
      estado_novo: 'autorizado',
    });
  });

  it('autoriza tentativa incerta mantendo a transicao auditavel', () => {
    repository.transicionar(33, 'incerto', {
      cStat: 'timeout',
      motivo: 'Resposta nao confirmada',
    });

    expect(service.autorizar(input())).toMatchObject({
      id: 33,
      status: 'autorizado',
    });
    expect(db.prepare(`
      SELECT estado_anterior, estado_novo
      FROM nfe_emissao_transicoes
      WHERE tentativaid = 33
      ORDER BY id DESC LIMIT 1
    `).get()).toEqual({
      estado_anterior: 'incerto',
      estado_novo: 'autorizado',
    });
  });

  it('autoriza sem clienteid sem alterar o cadastro existente', () => {
    const clientesAntes = db.prepare('SELECT * FROM clientes ORDER BY id').all();

    expect(service.autorizar(input({
      cliente: { cpf: 'nao-persistir' },
    }))).toMatchObject({ status: 'autorizado' });
    expect(db.prepare('SELECT * FROM clientes ORDER BY id').all()).toEqual(clientesAntes);
  });

  it('persiste numero fiscal vindo de cliente.numero quando c_numero esta ausente', () => {
    const { c_numero: _omitido, ...clienteSemCNumero } = input().cliente;

    expect(service.autorizar(input({
      cliente: {
        ...clienteSemCNumero,
        numero: '22',
      },
    }))).toMatchObject({ status: 'autorizado' });
    expect(db.prepare('SELECT numero FROM clientes WHERE id = 7').get()).toEqual({
      numero: '22',
    });
  });

  it('reverte OS, cliente e tentativa quando o evento falha', () => {
    const before = snapshot(db);
    db.exec(`
      CREATE TRIGGER falha_evento
      BEFORE INSERT ON nfe_eventos
      BEGIN
        SELECT RAISE(ABORT, 'falha evento');
      END;
    `);

    expect(() => service.autorizar(input())).toThrow('falha evento');
    expect(snapshot(db)).toEqual(before);
  });

  it('reverte evento, OS e cliente quando a transicao ou historico falha', () => {
    const before = snapshot(db);
    db.exec(`
      CREATE TRIGGER falha_historico
      BEFORE INSERT ON nfe_emissao_transicoes
      WHEN NEW.status = 'autorizado'
      BEGIN
        SELECT RAISE(ABORT, 'falha historico');
      END;
    `);

    expect(() => service.autorizar(input())).toThrow('falha historico');
    expect(snapshot(db)).toEqual(before);
  });

  it.each([
    ['outra OS', { ordemId: 18 }],
    ['outro numero', { numero: 2 }],
    ['outra serie', { serie: '2' }],
  ])('recusa tentativa vinculada a %s sem escritas', (_cenario, overrides) => {
    const before = snapshot(db);

    expect(() => service.autorizar(input(overrides))).toThrow(expect.objectContaining({
      status: 409,
      code: 'nfe_tentativa_incompativel',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it('recusa tentativa inexistente sem escritas', () => {
    db.prepare('DELETE FROM nfe_emissao_transicoes WHERE tentativaid = 33').run();
    db.prepare('DELETE FROM nfe_emissao_tentativas WHERE id = 33').run();
    const before = snapshot(db);

    expect(() => service.autorizar(input())).toThrow(expect.objectContaining({
      status: 404,
      code: 'nfe_tentativa_nao_encontrada',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it('recusa tentativa terminal sem duplicar evento', () => {
    service.autorizar(input());
    const before = snapshot(db);

    expect(() => service.autorizar(input())).toThrow(expect.objectContaining({
      status: 409,
      code: 'nfe_tentativa_terminal',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it.each([
    ['inexistente', () => db.prepare('DELETE FROM ordens WHERE id = 17').run()],
    ['deletada', () => db.prepare('UPDATE ordens SET deletedat = ? WHERE id = 17').run(AGORA)],
  ])('reverte quando a OS esta %s', (_cenario, arrange) => {
    arrange();
    const before = snapshot(db);

    expect(() => service.autorizar(input())).toThrow(expect.objectContaining({
      status: 409,
      code: 'nfe_ordem_invalida',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it('recusa cliente de outra OS sem alterar qualquer cadastro', () => {
    const before = snapshot(db);

    expect(() => service.autorizar(input({
      cliente: { ...input().cliente, clienteid: 8, cpf: 'corrompido' },
    }))).toThrow(expect.objectContaining({
      status: 409,
      code: 'nfe_cliente_invalido',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it('recusa cliente deletado e reverte a autorizacao', () => {
    db.prepare('UPDATE clientes SET deletedat = ? WHERE id = 7').run(AGORA);
    const before = snapshot(db);

    expect(() => service.autorizar(input())).toThrow(expect.objectContaining({
      status: 409,
      code: 'nfe_cliente_invalido',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it.each([null, undefined, '', '   '])('recusa XML vazio (%s) sem escritas', (xml) => {
    const before = snapshot(db);

    expect(() => service.autorizar(input({ xml }))).toThrow(expect.objectContaining({
      status: 400,
      code: 'nfe_xml_invalido',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['204', '204'],
    ['386', '386'],
  ])('recusa autorizacao com cStat %s sem escritas', (_cenario, cStat) => {
    const before = snapshot(db);

    expect(() => service.autorizar(input({ cStat }))).toThrow(expect.objectContaining({
      status: 400,
      code: 'nfe_autorizacao_invalida',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it.each([
    ['JSON', JSON.stringify({ nfeProc: true })],
    ['sem nfeProc', `<retEnviNFe><cStat>204</cStat></retEnviNFe>`],
    ['sem protNFe', `<nfeProc><NFe><infNFe Id="NFe${CHAVE}" /></NFe></nfeProc>`],
    ['cStat nao 100 no XML', XML_REJEITADO],
    ['XML de outra chave', XML_OUTRA_CHAVE],
  ])('recusa XML de autorizacao invalido: %s', (_cenario, xml) => {
    const before = snapshot(db);

    expect(() => service.autorizar(input({ xml }))).toThrow(expect.objectContaining({
      status: 400,
      code: 'nfe_xml_invalido',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it.each([
    ['chave curta', { chave: '123' }],
    ['chave com letras', { chave: `${CHAVE.slice(0, 43)}X` }],
    ['protocolo vazio', { protocolo: '' }],
    ['protocolo em branco', { protocolo: '   ' }],
  ])('recusa %s antes de persistir', (_cenario, overrides) => {
    const before = snapshot(db);

    expect(() => service.autorizar(input(overrides))).toThrow(expect.objectContaining({
      status: 400,
      code: 'nfe_autorizacao_invalida',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it('aceita factory com nfeAttemptRepository', () => {
    const serviceComAlias = createNfePersistenceService({
      db,
      nfeAttemptRepository: repository,
      agora: () => AGORA,
    });

    expect(serviceComAlias.autorizar(input())).toMatchObject({ id: 33, status: 'autorizado' });
  });

  it.each([
    ['cpf', { cpf: '' }],
    ['logradouro', { logradouro: '' }],
    ['numero', { c_numero: '' }],
    ['bairro', { bairro: '' }],
    ['cidade', { cidade: '' }],
    ['uf', { uf: '' }],
    ['cep', { cep: '' }],
  ])('recusa clienteid com %s essencial ausente sem nulificar cadastro', (_campo, overrideCliente) => {
    const before = snapshot(db);

    expect(() => service.autorizar(input({
      cliente: { ...input().cliente, ...overrideCliente },
    }))).toThrow(expect.objectContaining({
      status: 400,
      code: 'nfe_cliente_fiscal_invalido',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it.each([
    ['ja autorizada com chave diferente', { nfe_status: 'autorizado', nfe_chave: OUTRA_CHAVE }],
    ['cancelada', { nfe_status: 'cancelada', nfe_chave: CHAVE }],
    ['cancelado', { nfe_status: 'cancelado', nfe_chave: CHAVE }],
  ])('recusa OS %s sem sobrescrever dados fiscais', (_cenario, estado) => {
    db.prepare('UPDATE ordens SET nfe_status = ?, nfe_chave = ? WHERE id = 17')
      .run(estado.nfe_status, estado.nfe_chave);
    const before = snapshot(db);

    expect(() => service.autorizar(input())).toThrow(expect.objectContaining({
      status: 409,
      code: 'nfe_ordem_ja_finalizada',
    }));
    expect(snapshot(db)).toEqual(before);
  });

  it('mantem idempotencia quando OS ja esta autorizada com a mesma chave', () => {
    db.prepare('UPDATE ordens SET nfe_status = ?, nfe_chave = ? WHERE id = 17')
      .run('autorizado', CHAVE);

    expect(service.autorizar(input())).toMatchObject({ id: 33, status: 'autorizado' });
    expect(db.prepare('SELECT nfe_status, nfe_chave FROM ordens WHERE id = 17').get()).toEqual({
      nfe_status: 'autorizado',
      nfe_chave: CHAVE,
    });
  });

  it('executa com BEGIN IMMEDIATE e transiciona dentro da transacao', () => {
    db.close();
    const sqlLog = [];
    db = createDb({ verbose: (sql) => sqlLog.push(sql) });
    seed(db);
    const realRepository = createNfeAttemptRepository(db, { agora: () => AGORA });
    let transicionouEmTransacao = false;
    const observedRepository = {
      buscarPorId: (...args) => realRepository.buscarPorId(...args),
      transicionarNaTransacao: (...args) => {
        transicionouEmTransacao = db.inTransaction;
        return realRepository.transicionarNaTransacao(...args);
      },
    };
    service = createNfePersistenceService({
      db,
      attemptRepository: observedRepository,
      agora: () => AGORA,
    });
    sqlLog.length = 0;

    service.autorizar(input());

    expect(sqlLog).toContain('BEGIN IMMEDIATE');
    expect(transicionouEmTransacao).toBe(true);
  });
});
