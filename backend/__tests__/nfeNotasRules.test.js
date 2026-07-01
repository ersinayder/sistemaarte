import { describe, expect, it } from 'vitest';
import {
  buildNfeListRow,
  isNotaAtivaParaOrdem,
  parseJsonSnapshot,
  sanitizeOrigemNfe,
} from '../domain/nfeNotasRules.js';

describe('nfeNotasRules', () => {
  it('normalizes supported NF-e origins', () => {
    expect(sanitizeOrigemNfe('ordem')).toBe('ordem');
    expect(sanitizeOrigemNfe('avulsa')).toBe('avulsa');
    expect(() => sanitizeOrigemNfe('caixa')).toThrow(/origem/i);
  });

  it('detects active OS notes only for emitindo and autorizado records', () => {
    expect(isNotaAtivaParaOrdem({ status: 'emitindo', deletedat: null })).toBe(true);
    expect(isNotaAtivaParaOrdem({ status: 'autorizado', deletedat: null })).toBe(true);
    expect(isNotaAtivaParaOrdem({ status: 'cancelado', deletedat: null })).toBe(false);
    expect(isNotaAtivaParaOrdem({ status: 'rejeitado', deletedat: null })).toBe(false);
    expect(isNotaAtivaParaOrdem({ status: 'autorizado', deletedat: '2026-07-01' })).toBe(false);
  });

  it('parses JSON snapshots without throwing on legacy blanks', () => {
    expect(parseJsonSnapshot('{"nome":"Cliente"}')).toEqual({ nome: 'Cliente' });
    expect(parseJsonSnapshot('')).toEqual({});
    expect(parseJsonSnapshot(null)).toEqual({});
    expect(parseJsonSnapshot('{broken')).toEqual({});
  });

  it('builds a list row compatible with the current NotasFiscais UI', () => {
    const row = buildNfeListRow({
      id: 8,
      origem: 'avulsa',
      ordemid: null,
      cliente_snapshot: JSON.stringify({ nome: 'Cliente Avulso' }),
      valortotal: 99.9,
      status: 'autorizado',
      numero: '281',
      serie: '1',
      chave: '31260600000000000000550010000002811000000010',
      protocolo: '131260000001',
      createdat: '2026-07-01 10:00:00',
    });

    expect(row).toMatchObject({
      id: 8,
      origem: 'avulsa',
      ordemid: null,
      numero: 'Avulsa',
      clientenome: 'Cliente Avulso',
      servico: 'NF-e avulsa',
      valortotal: 99.9,
      nfe_status: 'autorizado',
      nfe_numero: '281',
      nfe_serie: '1',
      nfe_chave: '31260600000000000000550010000002811000000010',
      nfe_protocolo: '131260000001',
    });
  });
});
