import { describe, expect, it } from 'vitest';

const { renderPropostaHtml } = await import('../utils/propostaPdf.js');

describe('propostaPdf', () => {
  it('renders printable proposal HTML with customer, items, totals and print action', () => {
    const html = renderPropostaHtml({
      proposta: {
        numero: 'PROP-0007',
        clientenome: 'Cliente Teste',
        status: 'Orcamento enviado',
        valortotal: 250.5,
        prazoentrega: '10 dias uteis',
        observacoes: 'Entrega combinada no balcao',
        createdat: '2026-05-19 10:30:00',
      },
      itens: [
        { nome: 'Moldura preta', quantidade: 2, preco_unitario: 100 },
        { nome: 'Vidro antirreflexo', quantidade: 1, preco_unitario: 50.5 },
        { nome: 'Linha avulsa personalizada', quantidade: 1, preco_unitario: 0 },
      ],
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('PROPOSTA COMERCIAL');
    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('Arte e Molduras');
    expect(html).toContain('0007');
    expect(html).not.toContain('PROP-0007');
    expect(html).not.toContain('Status');
    expect(html).not.toContain('Orcamento enviado');
    expect(html).not.toContain('Origem');
    expect(html).not.toContain('Balcao');
    expect(html).toContain('Cliente Teste');
    expect(html).toContain('10 dias uteis');
    expect(html).toContain('Moldura preta');
    expect(html).toContain('Vidro antirreflexo');
    expect(html).toContain('Linha avulsa personalizada');
    expect(html).toContain('R$&nbsp;250,50');
    expect(html).toContain('Imprimir / salvar PDF');
    expect(html).toContain('window.print();');
    expect(html).toContain('.no-print { display: none !important; }');
  });

  it('escapes proposal and item data before rendering', () => {
    const html = renderPropostaHtml({
      proposta: {
        numero: 'PROP-<1>',
        clientenome: '<script>alert(1)</script>',
        status: 'Novo lead',
        valortotal: 10,
      },
      itens: [{ nome: '<b>Item</b>', quantidade: 1, preco_unitario: 10 }],
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>Item</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Item&lt;/b&gt;');
  });
});
