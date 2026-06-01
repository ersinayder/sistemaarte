import { describe, expect, it } from 'vitest';
import { calcularDescontoOS } from '../domain/descontoRules.js';

describe('calcularDescontoOS', () => {
  it('calcula desconto percentual sobre o total bruto', () => {
    expect(calcularDescontoOS(100, '10%')).toEqual({
      descontoinput: '10%',
      descontovalor: 10,
      valortotal: 90,
    });
  });

  it('calcula desconto em valor com virgula decimal', () => {
    expect(calcularDescontoOS('100,00', '15,50')).toEqual({
      descontoinput: '15,50',
      descontovalor: 15.5,
      valortotal: 84.5,
    });
  });

  it('limita desconto ao total bruto', () => {
    expect(calcularDescontoOS(80, '100')).toEqual({
      descontoinput: '100',
      descontovalor: 80,
      valortotal: 0,
    });
  });

  it('ignora desconto vazio ou invalido', () => {
    expect(calcularDescontoOS(65, '').valortotal).toBe(65);
    expect(calcularDescontoOS(65, 'abc').valortotal).toBe(65);
  });
});
