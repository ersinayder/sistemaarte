import { describe, expect, it } from 'vitest';

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
      {
        retEvento: {
          infEvento: {
            cStat: '135',
            nProt: '1352601',
            xMotivo: 'Evento registrado',
            dhRegEvento: '2026-06-25T08:00:00-03:00',
          },
        },
      },
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
