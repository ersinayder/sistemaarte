import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createNfeAttemptRepository } from '../repositories/nfeAttemptRepository.js';
import { createNfePersistenceService } from '../services/nfePersistenceService.js';
import { createNfeEmissaoService } from '../services/nfeEmissaoService.js';
import {
  criarNotaEmitindo,
  marcarNotaAutorizada,
  marcarNotaIncerta,
  marcarNotaRejeitada,
  substituirItensNota,
} from '../services/nfeNotasService.js';

const AGORA = '2026-06-21T10:00:00.000Z';
const CHAVE = '31260607500718000196550010000000011000000019';
const PROTOCOLO = '131260000000001';
const XML = xmlAutorizado(CHAVE);

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
      informacoes_complementares TEXT,
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

function xmlAutorizado(chave) {
  return `<nfeProc><NFe><infNFe Id="NFe${chave}" /></NFe><protNFe><infProt><chNFe>${chave}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
}

function authRawComChave(chave, protocolo = PROTOCOLO) {
  return authRaw({
    infProt: {
      chNFe: chave,
      nProt: protocolo,
    },
    xml: xmlAutorizado(chave),
  });
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
  const nfeNotasService = overrides.withCanonicalNotes ? {
    substituirItensNota,
    marcarNotaAutorizada,
  } : overrides.nfeNotasService;
  const persistenceService = createNfePersistenceService({
    db,
    attemptRepository,
    agora: () => AGORA,
    nfeNotasService,
  });
  const transmitir = overrides.transmitir || vi.fn().mockResolvedValue(authRaw());
  const montarPayload = overrides.montarPayload || vi.fn(({ numero, serie }) => ({
    infNFe: { ide: { nNF: String(numero), serie } },
  }));
  const salvarXmlDisco = overrides.salvarXmlDisco || vi.fn(() => 'arquivo.xml');
  const canonicalNotes = overrides.withCanonicalNotes ? {
    criarNotaEmitindo: (tentativa, input) => criarNotaEmitindo(db, {
      origem: 'ordem',
      ordemid: input.ordemId,
      clienteid: input.cliente?.clienteid || null,
      cliente_snapshot: input.cliente,
      emitente_snapshot: input.emitente,
      valortotal: 100,
      descontovalor: 0,
      pagamento: 'Pix',
      informacoes_complementares: input.informacoesComplementares || null,
      ambiente: input.ambiente,
      numero: String(tentativa.numero).padStart(9, '0'),
      serie: tentativa.serie,
      criadopor: input.usuarioId,
    }),
    marcarNotaRejeitada: (_tentativa, input, data) => marcarNotaRejeitada(db, input.nfeNotaId, data),
    marcarNotaIncerta: (_tentativa, input, data) => marcarNotaIncerta(db, input.nfeNotaId, data),
    marcarNotaFalhaLocal: (_tentativa, input, data) => marcarNotaRejeitada(db, input.nfeNotaId, data),
  } : overrides.canonicalNotes;
  const service = createNfeEmissaoService({
    db,
    attemptRepository,
    persistenceService,
    transmitir,
    montarPayload,
    salvarXmlDisco,
    classificarErro: overrides.classificarErro,
    timeoutMs: overrides.timeoutMs ?? 1000,
    setTimeoutFn: overrides.setTimeoutFn,
    clearTimeoutFn: overrides.clearTimeoutFn,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    canonicalNotes,
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
    expect(harness.db.prepare('SELECT nfe_status, nfe_numero, nfe_serie FROM ordens WHERE id = 17').get())
      .toEqual({ nfe_status: 'incerto', nfe_numero: '000000001', nfe_serie: '1' });
    expect(harness.db.prepare('SELECT tipo, cstat, motivo FROM nfe_eventos WHERE ordemid = 17').all())
      .toEqual([{
        tipo: 'incerto',
        cstat: 'timeout',
        motivo: 'Tempo esgotado aguardando resposta da SEFAZ.',
      }]);

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
    expect(harness.db.prepare('SELECT nfe_status, nfe_xml, nfe_numero, nfe_serie FROM ordens WHERE id = 17').get())
      .toEqual({ nfe_status: 'incerto', nfe_xml: null, nfe_numero: '000000001', nfe_serie: '1' });
    expect(harness.db.prepare('SELECT tipo, cstat, motivo FROM nfe_eventos WHERE ordemid = 17').get())
      .toEqual({
        tipo: 'incerto',
        cstat: '100',
        motivo: 'Autorizacao sem XML legal valido ou chave/protocolo divergente.',
      });
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
  });

  it('rejeicao allowlist marca rejeitado e preserva numero para reemissao da mesma OS', async () => {
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
    expect(harness.db.prepare(`
      SELECT nfe_status, nfe_numero, nfe_serie, nfe_chave, nfe_protocolo, nfe_deletedat
      FROM ordens WHERE id = 17
    `).get()).toEqual({
      nfe_status: 'rejeitado',
      nfe_numero: '000000001',
      nfe_serie: '1',
      nfe_chave: null,
      nfe_protocolo: null,
      nfe_deletedat: null,
    });
    expect(harness.db.prepare('SELECT tipo, cstat, motivo, xml FROM nfe_eventos WHERE ordemid = 17').get())
      .toEqual({
        tipo: 'rejeicao',
        cstat: '386',
        motivo: 'CFOP nao permitido',
        xml: null,
      });
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 1 });
  });

  it('rejeicao corrigivel de IE reemite a mesma OS com a mesma numeracao', async () => {
    const chaveOutraOs = `${CHAVE.slice(0, -2)}20`;
    const chaveFinal = `${CHAVE.slice(0, -2)}21`;
    harness = createHarness({
      withCanonicalNotes: true,
      transmitir: vi.fn()
        .mockResolvedValueOnce(rejeicaoRaw('232', 'IE do destinatario nao informada'))
        .mockResolvedValueOnce(authRawComChave(chaveOutraOs, '131260000000002'))
        .mockResolvedValueOnce(rejeicaoRaw('232', 'IE do destinatario nao vinculada ao CNPJ'))
        .mockResolvedValueOnce(authRawComChave(chaveFinal, '131260000000003')),
    });
    harness.db.prepare(`
      INSERT INTO ordens (id, numero, clienteid, nfe_status)
      VALUES (18, 'OS-0018', 7, NULL)
    `).run();

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 422,
      status: 'rejeitado',
      numero: 1,
      cStat: '232',
    });
    await expect(harness.service.emitir(baseInput({
      ordemId: 18,
      ordem: { id: 18, numero: 'OS-0018' },
    }))).resolves.toMatchObject({
      httpStatus: 200,
      status: 'autorizado',
      numero: 2,
      chave: chaveOutraOs,
    });
    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 422,
      status: 'rejeitado',
      numero: 1,
      cStat: '232',
    });
    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 200,
      status: 'autorizado',
      numero: 1,
      chave: chaveFinal,
    });

    expect(harness.montarPayload.mock.calls.map(([input]) => input.numero))
      .toEqual([1, 2, 1, 1]);
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 2 });
    expect(harness.db.prepare(`
      SELECT ordemid, numero, status, rejeicao_cstat, chave
      FROM nfe_notas
      ORDER BY ordemid, id
    `).all()).toEqual([
      {
        ordemid: 17,
        numero: '000000001',
        status: 'autorizado',
        rejeicao_cstat: null,
        chave: chaveFinal,
      },
      {
        ordemid: 18,
        numero: '000000002',
        status: 'autorizado',
        rejeicao_cstat: null,
        chave: chaveOutraOs,
      },
    ]);
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

  it('alimenta a entidade canonica de NF-e no fluxo idempotente de OS', async () => {
    harness = createHarness({ withCanonicalNotes: true });

    await expect(harness.service.emitir(baseInput({
      informacoesComplementares: 'Pedido interno 123.',
    }))).resolves.toMatchObject({
      httpStatus: 200,
      ok: true,
      status: 'autorizado',
      chave: CHAVE,
    });

    const nota = harness.db.prepare(`
      SELECT id, origem, ordemid, clienteid, numero, serie, chave, protocolo, status,
             informacoes_complementares, xml
      FROM nfe_notas
    `).get();
    expect(nota).toMatchObject({
      origem: 'ordem',
      ordemid: 17,
      clienteid: 7,
      numero: '000000001',
      serie: '1',
      chave: CHAVE,
      protocolo: PROTOCOLO,
      status: 'autorizado',
      informacoes_complementares: 'Pedido interno 123.',
      xml: XML,
    });
    expect(harness.db.prepare('SELECT nfeid, ordem_item_id, nome FROM nfe_itens').get())
      .toMatchObject({ nfeid: nota.id, ordem_item_id: 1, nome: 'Moldura' });
    expect(harness.db.prepare('SELECT nfeid, tipo, cstat FROM nfe_eventos').get())
      .toMatchObject({ nfeid: nota.id, tipo: 'autorizacao', cstat: '100' });
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

  it('erro classificado como validacao_xml vira falha_local, devolve numero e nao bloqueia reenvio', async () => {
    harness = createHarness({
      transmitir: vi.fn().mockRejectedValue(new Error('cvc-pattern-valid')),
      classificarErro: vi.fn(() => ({
        tipo: 'validacao_xml',
        cstat: 'xml_schema',
        mensagem: 'XML invalido antes da transmissao.',
      })),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 422,
      ok: false,
      status: 'falha_local',
      cStat: 'xml_schema',
    });
    expect(harness.attemptRepository.buscarPorId(1)).toMatchObject({
      status: 'falha_local',
      cstat: 'xml_schema',
    });
    expect(harness.attemptRepository.buscarAtivaPorOrdem(17)).toBeNull();
    expect(harness.db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie = ?').get('1'))
      .toEqual({ ultimo_numero: 0 });
  });

  it('erro classificado como rejeicao conclusiva projeta rejeicao e preserva numero fiscal', async () => {
    harness = createHarness({
      transmitir: vi.fn().mockRejectedValue(new Error('Rejeicao 386')),
      classificarErro: vi.fn(() => ({
        tipo: 'rejeicao',
        cstat: '386',
        mensagem: 'CFOP nao permitido',
      })),
    });

    await expect(harness.service.emitir(baseInput())).resolves.toMatchObject({
      httpStatus: 422,
      ok: false,
      status: 'rejeitado',
      cStat: '386',
    });
    expect(harness.db.prepare('SELECT nfe_status FROM ordens WHERE id = 17').get())
      .toEqual({ nfe_status: 'rejeitado' });
    expect(harness.db.prepare('SELECT tipo, cstat, motivo FROM nfe_eventos WHERE ordemid = 17').get())
      .toEqual({ tipo: 'rejeicao', cstat: '386', motivo: 'CFOP nao permitido' });
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
