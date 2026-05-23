import { describe, expect, it } from 'vitest';

const rules = await import('../domain/pagamentosRules.js');

describe('pagamentosRules', () => {
  it('normalizes credit card aliases into one canonical key', () => {
    expect(rules.normalizarPagamento('Cartao Credito')).toBe('Credito');
    expect(rules.normalizarPagamento('Cartao de Credito')).toBe('Credito');
    expect(rules.normalizarPagamento('Cart\u00e3o Cr\u00e9dito')).toBe('Credito');
    expect(rules.normalizarPagamento('Cart\u00e3o de Cr\u00e9dito')).toBe('Credito');
    expect(rules.normalizarPagamento('credito')).toBe('Credito');
  });

  it('normalizes debit, transfer, link, boleto and unknown payments', () => {
    expect(rules.normalizarPagamento('Cart\u00e3o de D\u00e9bito')).toBe('Debito');
    expect(rules.normalizarPagamento('Transfer\u00eancia')).toBe('Transferencia');
    expect(rules.normalizarPagamento('Link de Cobran\u00e7a')).toBe('Link');
    expect(rules.normalizarPagamento('Boleto')).toBe('Boleto');
    expect(rules.normalizarPagamento('Vale estranho')).toBe('Outros');
  });

  it('groups rows by canonical payment and keeps display labels', () => {
    const grupos = rules.agruparPorPagamento([
      { pagamento: 'Cart\u00e3o Cr\u00e9dito', valor: 10 },
      { pagamento: 'Cartao de Credito', valor: 15 },
      { pagamento: 'Pix', valor: 7 },
    ]);

    expect(grupos).toEqual([
      { pagamento: 'Credito', label: 'Cartao de Credito', total: 25, itens: expect.any(Array) },
      { pagamento: 'Pix', label: 'Pix', total: 7, itens: expect.any(Array) },
    ]);
    expect(grupos[0].itens).toHaveLength(2);
  });
});
