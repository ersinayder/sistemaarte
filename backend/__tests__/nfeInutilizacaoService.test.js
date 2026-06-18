import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createNfeInutilizacaoService } from '../services/nfeInutilizacaoService.js';

function createDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ordens (
      id INTEGER PRIMARY KEY,
      nfe_numero TEXT,
      nfe_serie TEXT
    );
    CREATE TABLE nfe_sequencias (
      serie TEXT PRIMARY KEY,
      ultimo_numero INTEGER NOT NULL
    );
    INSERT INTO nfe_sequencias (serie, ultimo_numero) VALUES ('1', 281);
    CREATE TABLE nfe_inutilizacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ambiente INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      modelo TEXT NOT NULL DEFAULT '55',
      serie TEXT NOT NULL,
      numero_inicial INTEGER NOT NULL,
      numero_final INTEGER NOT NULL,
      justificativa TEXT NOT NULL,
      status TEXT NOT NULL,
      protocolo TEXT,
      cstat TEXT,
      motivo TEXT,
      xml_envio TEXT,
      xml_retorno TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      solicitado_por INTEGER,
      solicitado_em TEXT NOT NULL,
      concluido_em TEXT,
      createdat TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  return db;
}

const pedidoBase = {
  ano: 2026,
  numeroInicial: 280,
  numeroFinal: 280,
  justificativa: 'Quebra de sequencia por rejeicao fiscal durante emissao da OS-0259',
  confirmacao: 'INUTILIZAR 280',
  idempotencyKey: 'req-280',
};

const contextoBase = {
  ambiente: 2,
  cUF: 31,
  cnpj: '07500718000196',
  modelo: '55',
  serie: '1',
  ultimoNumero: 281,
};

describe('nfe inutilizacao service', () => {
  let db;
  let transmitir;
  let salvarXml;
  let service;

  beforeEach(() => {
    db = createDb();
    transmitir = vi.fn().mockResolvedValue({
      cStat: '102',
      xMotivo: 'Inutilizacao de numero homologado',
      nProt: '131260000000001',
      dhRecbto: '2026-06-18T12:00:00-03:00',
      xmlEnvio: '<inutNFe><infInut /></inutNFe>',
      xmlRetorno: '<retInutNFe><infInut /></retInutNFe>',
    });
    salvarXml = vi.fn().mockReturnValue({ ok: true });
    service = createNfeInutilizacaoService({
      db,
      obterContexto: () => contextoBase,
      transmitir,
      salvarXml,
      agora: () => '2026-06-18T15:00:00.000Z',
      classificarErro: () => ({ tipo: 'comunicacao', mensagem: 'Falha de comunicacao' }),
    });
  });

  afterEach(() => db.close());

  it('reserva localmente antes de transmitir e autoriza somente com cStat 102', async () => {
    transmitir.mockImplementation(async () => {
      const row = db.prepare('SELECT status FROM nfe_inutilizacoes WHERE idempotency_key = ?').get('req-280');
      expect(row.status).toBe('processando');
      return {
        cStat: '102',
        xMotivo: 'Inutilizacao homologada',
        nProt: '131260000000001',
        dhRecbto: '2026-06-18T12:00:00-03:00',
        xmlEnvio: '<inutNFe />',
        xmlRetorno: '<retInutNFe />',
      };
    });

    const result = await service.solicitar(pedidoBase, 7);

    expect(result.httpStatus).toBe(201);
    expect(result.registro).toMatchObject({
      status: 'autorizado',
      cstat: '102',
      protocolo: '131260000000001',
    });
    expect(transmitir).toHaveBeenCalledWith(expect.objectContaining({
      cUF: 31,
      CNPJ: '07500718000196',
      ano: '26',
      mod: '55',
      serie: '1',
      nNFIni: '280',
      nNFFin: '280',
    }));
    expect(salvarXml).toHaveBeenCalledTimes(2);
  });

  it('reproduz resposta pela chave idempotente sem nova transmissao', async () => {
    const first = await service.solicitar(pedidoBase, 7);
    const second = await service.solicitar(pedidoBase, 7);

    expect(first.registro.id).toBe(second.registro.id);
    expect(second.httpStatus).toBe(200);
    expect(second.replayed).toBe(true);
    expect(transmitir).toHaveBeenCalledTimes(1);
  });

  it('bloqueia faixa contendo numero fiscal ja registrado em ordem', async () => {
    db.prepare("INSERT INTO ordens (id, nfe_numero, nfe_serie) VALUES (1, '000000280', '1')").run();

    await expect(service.solicitar(pedidoBase, 7)).rejects.toMatchObject({
      status: 409,
      code: 'numero_utilizado',
    });
    expect(transmitir).not.toHaveBeenCalled();
  });

  it('bloqueia sobreposicao processando, autorizada ou incerta e permite adjacencia', async () => {
    const insert = db.prepare(`
      INSERT INTO nfe_inutilizacoes
        (ambiente, ano, modelo, serie, numero_inicial, numero_final, justificativa,
         status, idempotency_key, solicitado_em)
      VALUES (2, 2026, '55', '1', ?, ?, 'Faixa anterior suficientemente detalhada',
              ?, ?, '2026-06-18T14:00:00.000Z')
    `);
    insert.run(270, 279, 'autorizado', 'old-authorized');

    await expect(service.solicitar({
      ...pedidoBase,
      numeroInicial: 279,
      confirmacao: 'INUTILIZAR 279-280',
      idempotencyKey: 'overlap',
    }, 7)).rejects.toMatchObject({ status: 409, code: 'faixa_sobreposta' });

    await expect(service.solicitar(pedidoBase, 7)).resolves.toMatchObject({ httpStatus: 201 });
  });

  it('persiste rejeicao fiscal definitiva como rejeitado', async () => {
    transmitir.mockResolvedValue({
      cStat: '241',
      xMotivo: 'Rejeicao: Um numero da faixa ja foi utilizado',
      xmlEnvio: '<inutNFe />',
      xmlRetorno: '<retInutNFe />',
    });

    const result = await service.solicitar(pedidoBase, 7);

    expect(result.httpStatus).toBe(422);
    expect(result.registro).toMatchObject({
      status: 'rejeitado',
      cstat: '241',
      motivo: 'Rejeicao: Um numero da faixa ja foi utilizado',
    });
  });

  it('persiste timeout como incerto e impede reenvio cego da faixa', async () => {
    transmitir.mockRejectedValue(new Error('Timeout SEFAZ'));

    const first = await service.solicitar(pedidoBase, 7);

    expect(first.httpStatus).toBe(504);
    expect(first.registro.status).toBe('incerto');

    await expect(service.solicitar({
      ...pedidoBase,
      idempotencyKey: 'retry-different-key',
    }, 7)).rejects.toMatchObject({ status: 409, code: 'faixa_sobreposta' });
    expect(transmitir).toHaveBeenCalledTimes(1);
  });

  it('mantem autorizacao quando a copia em disco falha', async () => {
    salvarXml.mockImplementation(() => {
      throw new Error('Disco indisponivel');
    });

    const result = await service.solicitar(pedidoBase, 7);

    expect(result.httpStatus).toBe(201);
    expect(result.registro.status).toBe('autorizado');
    expect(result.alertas).toContain('XML autorizado salvo no banco, mas houve falha ao gravar arquivo em disco.');
  });
});
