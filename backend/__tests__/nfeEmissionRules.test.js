import { describe, it, expect } from 'vitest';
import {
  aplicarOverridesItensNFe,
  normalizarItemFiscalOverride,
  serializarItemPreviaNFe,
} from '../domain/nfeEmissionRules.js';

describe('nfeEmissionRules', () => {
  it('applies per-emission fiscal overrides without mutating the original item', () => {
    const itens = [{
      id: 10,
      produto_id: 4,
      nome: 'Trofeu 3d',
      quantidade: 2,
      preco_unitario: 50,
      ncm: '49119900',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    }];

    const resultado = aplicarOverridesItensNFe(itens, [{
      id: 10,
      ncm: ' 3926.90.90 ',
      cfop: '6102',
      csosn: '102',
      origem_fiscal: '1',
      unidade: 'pc',
    }]);

    expect(resultado.ok).toBe(true);
    expect(resultado.itens[0]).toMatchObject({
      ncm: '39269090',
      cfop: '6102',
      csosn: '102',
      origem_fiscal: '1',
      unidade: 'PC',
    });
    expect(itens[0].ncm).toBe('49119900');
  });

  it('rejects invalid NCM overrides before the SEFAZ lock is acquired', () => {
    const resultado = normalizarItemFiscalOverride({ id: 10, ncm: '123' });

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toContain('NCM');
  });

  it('serializes NF-e preview items with fiscal defaults and commercial totals', () => {
    const item = serializarItemPreviaNFe({
      id: 7,
      produto_id: 2,
      nome: 'Quadro acrilico',
      quantidade: 3,
      preco_unitario: 20,
    });

    expect(item).toMatchObject({
      id: 7,
      produto_id: 2,
      nome: 'Quadro acrilico',
      quantidade: 3,
      preco_unitario: 20,
      subtotal: 60,
      ncm: '49119900',
      cfop: '5102',
      csosn: '400',
      origem_fiscal: '0',
      unidade: 'UN',
    });
  });
});
