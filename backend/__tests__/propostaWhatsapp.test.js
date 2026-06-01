import { describe, expect, it } from 'vitest';

const {
  buildPropostaWhatsappUrl,
  formatarTelefoneWhatsapp,
} = await import('../../frontend/src/utils/propostaWhatsapp.js');

describe('propostaWhatsapp frontend helper', () => {
  it('normalizes Brazilian phone numbers for wa.me', () => {
    expect(formatarTelefoneWhatsapp('(31) 99999-0000')).toBe('5531999990000');
    expect(formatarTelefoneWhatsapp('5531999990000')).toBe('5531999990000');
    expect(formatarTelefoneWhatsapp('')).toBeNull();
  });

  it('builds a WhatsApp URL with proposal summary and no public link', () => {
    const url = buildPropostaWhatsappUrl({
      numero: 'PROP-0007',
      clientenome: 'Maria Silva',
      clientetelefone: '(31) 99999-0000',
      valortotal: 1234.5,
      prazoentrega: '2026-05-28',
    });

    expect(url).toMatch(/^https:\/\/wa\.me\/5531999990000\?text=/);

    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Proposta PROP-0007');
    expect(text).toContain('Maria Silva');
    expect(text).toContain('R$ 1.234,50');
    expect(text).toContain('28/05/2026');
    expect(text).toContain('PDF');
    expect(text).not.toContain('/api/propostas/7/pdf');
    expect(text).not.toContain('http');
  });

  it('returns null when proposal has no client phone', () => {
    expect(buildPropostaWhatsappUrl({ numero: 'PROP-0008', clientenome: 'Sem Telefone' })).toBeNull();
  });

  it('keeps textual production deadlines in WhatsApp messages', () => {
    const url = buildPropostaWhatsappUrl({
      numero: 'PROP-0009',
      clientenome: 'Maria Silva',
      clientetelefone: '(31) 99999-0000',
      valortotal: 100,
      prazoentrega: '10 dias uteis',
    });

    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('Prazo previsto: 10 dias uteis');
  });
});
