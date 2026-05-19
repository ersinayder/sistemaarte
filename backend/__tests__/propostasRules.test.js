import { describe, expect, it } from 'vitest';

const {
  STATUS_PROPOSTA_VALIDOS,
  normalizarStatusProposta,
  validarStatusProposta,
  podeGerarOS,
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
});
