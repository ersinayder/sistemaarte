import { describe, expect, it } from 'vitest';
import {
  descricaoVendaAvulsa,
  normalizarItensVendaAvulsa,
  totalItensVendaAvulsa,
} from '../domain/caixaRules.js';

describe('normalizarItensVendaAvulsa', () => {
  it('keeps valid sale items and totals them', () => {
    const itens = normalizarItensVendaAvulsa([
      { produto_id: 10, nome: 'Porta retrato', quantidade: 2, preco_unitario: 39.9 },
      { nome: 'Item avulso', quantidade: 1, preco: 15 },
      { nome: '', quantidade: 1, preco_unitario: 99 },
      { nome: 'Sem valor', quantidade: 1, preco_unitario: 0 },
    ]);

    expect(itens).toEqual([
      { produto_id: 10, nome: 'Porta retrato', quantidade: 2, preco_unitario: 39.9, avulso: 0 },
      { produto_id: null, nome: 'Item avulso', quantidade: 1, preco_unitario: 15, avulso: 1 },
    ]);
    expect(totalItensVendaAvulsa(itens)).toBeCloseTo(94.8);
  });

  it('builds a short readable description from sale items', () => {
    const desc = descricaoVendaAvulsa([
      { nome: 'Porta retrato', quantidade: 2, preco_unitario: 39.9 },
      { nome: 'Moldura preta', quantidade: 1, preco_unitario: 58 },
    ]);

    expect(desc).toBe('Venda avulsa: 2x Porta retrato, 1x Moldura preta');
  });

  it('limits long descriptions without losing item count signal', () => {
    const desc = descricaoVendaAvulsa([
      { nome: 'Produto 1', quantidade: 1, preco_unitario: 10 },
      { nome: 'Produto 2', quantidade: 1, preco_unitario: 10 },
      { nome: 'Produto 3', quantidade: 1, preco_unitario: 10 },
      { nome: 'Produto 4', quantidade: 1, preco_unitario: 10 },
    ]);

    expect(desc).toBe('Venda avulsa: 1x Produto 1, 1x Produto 2, 1x Produto 3 +1 item(ns)');
  });
});
