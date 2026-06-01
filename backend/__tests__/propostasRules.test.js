import { describe, expect, it } from 'vitest';

const {
  STATUS_PROPOSTA_VALIDOS,
  normalizarStatusProposta,
  validarStatusProposta,
  podeGerarOS,
  normalizarItensProposta,
  calcularTotalItensProposta,
  validarDadosProposta,
} = await import('../domain/propostasRules.js');

describe('propostasRules', () => {
  it('keeps the approved commercial funnel statuses in order', () => {
    expect(STATUS_PROPOSTA_VALIDOS).toEqual([
      'Novo lead',
      'Orcamento enviado',
      'Negociacao',
      'Aprovado',
      'Perdido',
    ]);
  });

  it('normalizes accented and legacy proposal status aliases', () => {
    expect(normalizarStatusProposta('Orçamento enviado')).toBe('Orcamento enviado');
    expect(normalizarStatusProposta('Negociação')).toBe('Negociacao');
    expect(normalizarStatusProposta('aprovado')).toBe('Aprovado');
  });

  it('rejects invalid statuses', () => {
    expect(validarStatusProposta('Aprovado')).toBeNull();
    expect(validarStatusProposta('Em Produção')).toMatch(/Status de proposta invalido/);
  });

  it('allows OS generation only for approved proposals without linked OS', () => {
    expect(podeGerarOS({ status: 'Aprovado', ordemid: null })).toEqual({ ok: true });
    expect(podeGerarOS({ status: 'Negociacao', ordemid: null })).toEqual({
      ok: false,
      error: 'A proposta precisa estar aprovada para gerar OS.',
    });
    expect(podeGerarOS({ status: 'Aprovado', ordemid: 12 })).toEqual({
      ok: false,
      error: 'Esta proposta ja gerou uma OS.',
    });
  });

  it('normalizes arbitrary custom proposal items and calculates total on the backend', () => {
    const itens = normalizarItensProposta([
      { nome: 'Moldura personalizada', quantidade: '2', preco_unitario: '75.50' },
      { name: 'Acabamento especial', qty: '1.5', valor: '20' },
    ]);

    expect(itens).toEqual([
      {
        produto_id: null,
        nome: 'Moldura personalizada',
        quantidade: 2,
        preco_unitario: 75.5,
        avulso: 1,
      },
      {
        produto_id: null,
        nome: 'Acabamento especial',
        quantidade: 1.5,
        preco_unitario: 20,
        avulso: 1,
      },
    ]);
    expect(calcularTotalItensProposta(itens)).toBe(181);
  });

  it('rejects invalid proposal items instead of clamping quantity and price', () => {
    expect(validarDadosProposta({
      clientenome: 'Cliente',
      produtos: [{ nome: 'Item', quantidade: 0, preco_unitario: 10 }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('Quantidade') });

    expect(validarDadosProposta({
      clientenome: 'Cliente',
      produtos: [{ nome: 'Item', quantidade: 1, preco_unitario: Number.POSITIVE_INFINITY }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('preco') });

    expect(validarDadosProposta({
      clientenome: 'Cliente',
      produtos: [{ nome: '   ', quantidade: 1, preco_unitario: 10 }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('nome') });
  });

  it('rejects materially different frontend totals and invalid delivery deadlines', () => {
    expect(validarDadosProposta({
      clientenome: 'Cliente',
      prazoentrega: '2026/05/25',
      produtos: [{ nome: 'Item', quantidade: 1, preco_unitario: 10 }],
    })).toMatchObject({ ok: false, error: 'Prazo deve estar no formato YYYY-MM-DD.' });

    expect(validarDadosProposta({
      clientenome: 'Cliente',
      valortotal: 99,
      produtos: [{ nome: 'Item', quantidade: 1, preco_unitario: 10 }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('Total') });
  });
});
