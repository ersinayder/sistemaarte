import { describe, expect, it } from 'vitest';
import rules from '../domain/nfeExportRules.js';

const {
  normalizarPedidoExportacaoNFe,
  buildNomeArquivoZip,
  buildNomeArquivoNFe,
  buildManifestoExportacaoNFe,
} = rules;

describe('nfeExportRules', () => {
  it('normalizes valid XML and DANFE export requests', () => {
    expect(normalizarPedidoExportacaoNFe({
      tipo: 'XML',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).toEqual({
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      dias: 30,
    });

    expect(normalizarPedidoExportacaoNFe({
      tipo: 'danfe',
      inicio: '2026-06-01',
      fim: '2026-06-01',
    }).dias).toBe(1);
  });

  it('rejects invalid type and invalid ISO dates with status 400', () => {
    expect(() => normalizarPedidoExportacaoNFe({
      tipo: 'pdf',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).toThrow(/Tipo de exportacao invalido/);

    try {
      normalizarPedidoExportacaoNFe({ tipo: 'xml', inicio: '2026-02-31', fim: '2026-06-30' });
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('periodo_invalido');
    }
  });

  it('rejects inverted and oversized periods', () => {
    expect(() => normalizarPedidoExportacaoNFe({
      tipo: 'xml',
      inicio: '2026-06-30',
      fim: '2026-06-01',
    })).toThrow(/Periodo inicial nao pode ser maior/);

    expect(() => normalizarPedidoExportacaoNFe({
      tipo: 'xml',
      inicio: '2025-01-01',
      fim: '2026-12-31',
    })).toThrow(/Periodo maximo/);
  });

  it('builds safe ZIP and entry filenames', () => {
    expect(buildNomeArquivoZip({ tipo: 'xml', inicio: '2026-06-01', fim: '2026-06-30' }))
      .toBe('nfe-xml-2026-06-01-a-2026-06-30.zip');
    expect(buildNomeArquivoZip({ tipo: 'danfe', inicio: '2026-06-01', fim: '2026-06-30' }))
      .toBe('nfe-danfe-2026-06-01-a-2026-06-30.zip');

    expect(buildNomeArquivoNFe({
      nota: { id: 7, numero: '29/1', chave: '31260507500718000196550010000000291000000291' },
      pasta: 'xml',
      ext: 'xml',
    })).toBe('xml/29_1-31260507500718000196550010000000291000000291.xml');
  });

  it('builds a manifesto with exported and skipped notes', () => {
    const manifesto = buildManifestoExportacaoNFe({
      tipo: 'danfe',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      geradoEm: new Date('2026-07-01T12:00:00.000Z'),
      encontradas: 2,
      exportadas: 1,
      puladas: [{ numero: '30', chave: 'abc', motivo: 'XML ausente' }],
    });

    expect(manifesto).toContain('Tipo: DANFE PDF');
    expect(manifesto).toContain('Periodo: 2026-06-01 a 2026-06-30');
    expect(manifesto).toContain('Notas encontradas: 2');
    expect(manifesto).toContain('Arquivos exportados: 1');
    expect(manifesto).toContain('30 - abc - XML ausente');
  });
});
