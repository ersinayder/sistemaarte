import { describe, expect, it } from 'vitest';
import { aplicarDescontoOS } from '../../frontend/src/utils/descontoOS.js';

describe('OS discount calculation', () => {
  it('applies a percentage discount to the gross total', () => {
    expect(aplicarDescontoOS(100, '10%')).toEqual({
      totalBruto: 100,
      desconto: 10,
      totalLiquido: 90,
    });
  });

  it('applies a currency discount with Brazilian decimal comma', () => {
    expect(aplicarDescontoOS('100,00', '15,50')).toEqual({
      totalBruto: 100,
      desconto: 15.5,
      totalLiquido: 84.5,
    });
  });

  it('never lets the liquid total go below zero', () => {
    expect(aplicarDescontoOS(80, '100').totalLiquido).toBe(0);
  });

  it('ignores empty or invalid discounts', () => {
    expect(aplicarDescontoOS(65, '').totalLiquido).toBe(65);
    expect(aplicarDescontoOS(65, 'abc').totalLiquido).toBe(65);
  });
});
