import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  centavos,
  contribuicaoRecebida,
  ordensAfetadas,
  projetarSaldoCentavos,
} = require('../domain/ordemPagamentoRules');

describe('ordemPagamentoRules', () => {
  it('identifica duas OS afetadas quando vinculo muda', () => {
    expect(ordensAfetadas({ ordemid: 9 }, { ordemid: 4 })).toEqual([4, 9]);
    expect(ordensAfetadas({ ordemid: 9 }, { ordemid: '9' })).toEqual([9]);
  });

  it('contribuicao considera pago/deletedat/ordemid e negativo com centavos', () => {
    expect(contribuicaoRecebida({ ordemid: 1, pago: 1, deletedat: null, valor: 10.235 })).toBe(1024);
    expect(contribuicaoRecebida({ ordemid: 1, pago: 0, deletedat: null, valor: 10 })).toBe(0);
    expect(contribuicaoRecebida({ ordemid: 1, pago: 1, deletedat: '2026-06-01', valor: 10 })).toBe(0);
    expect(contribuicaoRecebida({ ordemid: null, pago: 1, deletedat: null, valor: 10 })).toBe(0);
    expect(contribuicaoRecebida({ ordemid: 1, pago: 1, deletedat: null, valor: -12.345 })).toBe(-1234);
  });

  it('projeta saldo removendo antigo e adicionando novo', () => {
    const saldo = projetarSaldoCentavos({
      ordemId: 1,
      total: 100,
      recebidoAtual: 80,
      antigo: { ordemid: 1, pago: 1, deletedat: null, valor: 30 },
      novo: { ordemid: 1, pago: 1, deletedat: null, valor: 20 },
    });

    expect(saldo).toBe(3000);
  });

  it('saldo nunca fica negativo', () => {
    expect(centavos(0.105)).toBe(11);
    expect(projetarSaldoCentavos({
      ordemId: 1,
      total: 100,
      recebidoAtual: 130,
      antigo: { ordemid: 1, pago: 1, deletedat: null, valor: 10 },
      novo: { ordemid: 1, pago: 1, deletedat: null, valor: 20 },
    })).toBe(0);
  });
});
