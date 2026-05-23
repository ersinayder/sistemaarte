import { describe, expect, it } from 'vitest';

const { renderOrdemServicoHtml } = await import('../utils/print/ordemServico.js');

describe('ordemServico print', () => {
  it('renders a branded service order with client, items, totals and signatures', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-0042',
        status: 'Em Produ\u00e7\u00e3o',
        prioridade: 'Urgente',
        createdat: '2026-05-20 09:00:00',
        prazoentrega: '2026-05-28',
        clientenome: 'Cliente Teste',
        clientetelefone: '(31) 99999-0000',
        clientecpf: '123.456.789-09',
        servico: 'Quadro',
        descricao: 'Moldura preta 40x60',
        observacoes: 'Cuidado com vidro',
        criadopornome: 'Atendente',
      },
      itens: [
        { nome: 'Moldura preta', quantidade: 1, preco_unitario: 120 },
        { nome: 'Vidro antirreflexo', quantidade: 1, preco_unitario: 80 },
      ],
      resumo: {
        total: 200,
        recebido: 50,
        saldo: 150,
      },
    });

    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('Ordem de Servico');
    expect(html).toContain('OS-0042');
    expect(html).toContain('Cliente Teste');
    expect(html).toContain('Moldura preta');
    expect(html).toContain('Vidro antirreflexo');
    expect(html).toContain('R$&nbsp;200,00');
    expect(html).toContain('R$&nbsp;150,00');
    expect(html).toContain('Assinatura do Cliente');
    expect(html).toContain('Responsavel pela Entrega');
  });

  it('escapes service order data', () => {
    const html = renderOrdemServicoHtml({
      ordem: {
        numero: 'OS-<1>',
        clientenome: '<script>alert(1)</script>',
        servico: 'Quadro',
        status: 'Aguardando',
      },
      itens: [{ nome: '<b>Item</b>', quantidade: 1, preco_unitario: 10 }],
      resumo: { total: 10, recebido: 0, saldo: 10 },
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Item</b>');
    expect(html).toContain('OS-&lt;1&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Item&lt;/b&gt;');
  });
});
