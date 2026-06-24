import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createNfeAttemptRepository } from '../repositories/nfeAttemptRepository.js';
import { createNfePersistenceService } from '../services/nfePersistenceService.js';
import { createNfeEmissaoService } from '../services/nfeEmissaoService.js';

const AGORA = '2026-06-21T10:00:00.000Z';
const CHAVE = '31260607500718000196550010000000011000000019';
const PROTOCOLO = '131260000000001';
const XML = `<nfeProc><NFe><infNFe Id="NFe${CHAVE}" /></NFe><protNFe><infProt><chNFe>${CHAVE}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;

function createDb() {
  const db = new Database(':memory:');
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

function seed(db) {
  db.prepare(`
    INSERT INTO clientes
      (id, cpf, ie, logradouro, numero, bairro, cidade, uf, cep)
    VALUES (7, '12345678901', 'ISENTO', 'Rua Fiscal', '22', 'Centro', 'Belo Horizonte', 'MG', '30100000')
  `).run();
  db.prepare(`
    INSERT INTO ordens (id, numero, clienteid, nfe_status)
    VALUES (17, 'OS-0017', 7, NULL)
  `).run();
}

function authRaw(overrides = {}) {
  const xml = Object.prototype.hasOwnProperty.call(overrides, 'xml') ? overrides.xml : XML;
  return [{
    protNFe: {
      infProt: {
        cStat: '100',
        chNFe: CHAVE,
        nProt: PROTOCOLO,
        dhRecbto: AGORA,
        xMotivo: 'Autorizado o uso da NF-e',
        ...overrides.infProt,
      },
    },
    xml,
  }];
}

function rejeicaoRaw(cStat, xMotivo = `Rejeicao ${cStat}`) {
  return [{ protNFe: { infProt: { cStat, xMotivo } } }];
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function baseInput(overrides = {}) {
  return {
    ordemId: 17,
    usuarioId: 9,
    serie: '1',
    ambiente: 2,
    ordem: { id: 17, numero: 'OS-0017' },
    itens: [{ id: 1, nome: 'Moldura', quantidade: 1, preco_unitario: 100 }],
    cliente: {
      clienteid: 7,
      cpf: '12345678901',
      ie: 'ISENTO',
      logradouro: 'Rua Fiscal',
      c_numero: '22',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    },
    emitente: { CNPJ: '07500718000196' },
    autXML: [],
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  const db = createDb();
  seed(db);
  const attemptRepository = createNfeAttemptRepository(db, { agora: () => AGORA });
  const persistenceService = createNfePersistenceService({
    db,
    attemptRepository,
    agora: () => AGORA,
  });
  const transmitir = overrides.transmitir || vi.fn().mockResolvedValue(authRaw());
  const montarPayload = overrides.montarPayload || vi.fn(({ numero, serie }) => ({
    infNFe: { ide: { nNF: String(numero), serie } },
  }));
  const salvarXmlDisco = overrides.salvarXmlDisco || vi.fn(() => 'arquivo.xml');
  const service = createNfeEmissaoService({
    attemptRepository,
    persistenceService,
    transmitir,
    montarPayload,
    salvarXmlDisco,
    timeoutMs: overrides.timeoutMs ?? 1000,
    setTimeoutFn: overrides.setTimeoutFn,
    clearTimeoutFn: overrides.clearTimeoutFn,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  });

  return { db, attemptRepository, persistenceService, service, transmitir, montarPayload, salvarXmlDisco };
}

describe('nfeEmissaoService', () => {
  let harness;

  afterEach(() => {
    vi.useRealTimers();
    harness?.db.close();
    harness = null;
  });

  it('timeout marca tentativa incerta, bloqueia segunda emissao e resposta tardia autorizada persiste', async () => {
    vi.useFakeTimers();
    const deferred = createDeferred();
    harness = createHarness({
      timeoutMs: 50,
      transmitir: vi.fn(() => deferred.promise),
    });

    const emissao = harness.service.emitir(baseInput());
    await vi.advanceTimersByTimeAsync(50);

    await expect(emissao).resolves.toMatchObject({
      httpStatus: 409,
      ok: false,
      status: 'incerto',
      numero: 1,
      serie: '1',
    });
    expect(harness.attemptRepository.buscarAtivaPorOrdem(17)).toMatchObject({
      status: 'incerto',
      numero: 1,
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 409,
      status: 'incerto',
      code: 'nfe_tentativa_ativa',
    });
    expect(harness.transmitir).toHaveBeenCalledTimes(1);

    deferred.resolve(authRaw());
    await flushPromises();

    expect(harness.db.prepare('SELECT nfe_status, nfe_chave, nfe_xml FROM ordens WHERE id = 17').get())
      .toEqual({ nfe_status: 'autorizado', nfe_chave: CHAVE, nfe_xml: XML });
    expect(harness.attemptRepository.buscarPorId(1)).toMatchObject({
      status: 'autorizado',
      chave: CHAVE,
      protocolo: PROTOCOLO,
    });
  });

  it('autorizacao sem XML legal fica incerta, nao autoriza OS e nao devolve numero', async () => {
    harness = createHarness({
      transmitir: vi.fn().mockResolvedValue(authRaw({ xml: null })),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 409,
      ok: false,
      status: 'incerto',
      cStat: '100',
    });
    expect(harness.db.prepare('SELECT nfe_status, nfe_xml FROM ordens WHERE id = 17').get())
      .toEqual({ nfe_status: null, nfe_xml: null });
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
  });

  it('rejeicao allowlist marca rejeitado e devolve numero', async () => {
    harness = createHarness({
      transmitir: vi.fn().mockResolvedValue(rejeicaoRaw('386', 'CFOP nao permitido')),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 422,
      ok: false,
      status: 'rejeitado',
      cStat: '386',
    });
    expect(harness.attemptRepository.buscarPorId(1)).toMatchObject({
      status: 'rejeitado',
      cstat: '386',
    });
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 0 });
  });

  it.each([
    ['duplicidade 204', rejeicaoRaw('204', 'Duplicidade de NF-e')],
    ['duplicidade 539', rejeicaoRaw('539', 'Duplicidade com diferenca')],
    ['cStat desconhecido', rejeicaoRaw('9999', 'Retorno desconhecido')],
    ['retorno vazio', null],
  ])('%s fica incerto e nao devolve numero', async (_cenario, raw) => {
    harness = createHarness({
      transmitir: vi.fn().mockResolvedValue(raw),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 409,
      ok: false,
      status: 'incerto',
    });
    expect(harness.attemptRepository.buscarPorId(1).status).toBe('incerto');
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
  });

  it('falha ao salvar XML em disco preserva autorizacao no banco e retorna alerta', async () => {
    harness = createHarness({
      salvarXmlDisco: vi.fn(() => null),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 200,
      ok: true,
      status: 'autorizado',
      alertas: [expect.stringContaining('XML autorizado foi salvo no banco')],
    });
    expect(harness.db.prepare('SELECT nfe_status, nfe_chave, nfe_xml FROM ordens WHERE id = 17').get())
      .toEqual({ nfe_status: 'autorizado', nfe_chave: CHAVE, nfe_xml: XML });
  });

  it('erro de comunicacao apos reserva vira incerto, sem rejeitar nem devolver numero', async () => {
    harness = createHarness({
      transmitir: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 409,
      ok: false,
      status: 'incerto',
    });
    expect(harness.attemptRepository.buscarPorId(1)).toMatchObject({
      status: 'incerto',
    });
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
  });

  it('erro pre-transmissao no montarPayload vira falha_local e devolve numero', async () => {
    harness = createHarness({
      montarPayload: vi.fn(() => {
        throw new Error('payload invalido');
      }),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 500,
      ok: false,
      status: 'falha_local',
    });
    expect(harness.transmitir).not.toHaveBeenCalled();
    expect(harness.attemptRepository.buscarPorId(1)).toMatchObject({
      status: 'falha_local',
    });
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 0 });
  });

  it('segunda tentativa ativa retorna 409 antes de transmitir', async () => {
    harness = createHarness();
    harness.attemptRepository.reservar({ ordemId: 17, serie: '1', usuarioId: 9 });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 409,
      ok: false,
      code: 'nfe_tentativa_ativa',
    });
    expect(harness.transmitir).not.toHaveBeenCalled();
  });
});
