import { describe, expect, it } from 'vitest';

const {
  montarFechamentoCaixa,
  renderFechamentoCaixaHtml,
} = await import('../utils/print/caixaFechamento.js');

describe('caixa fechamento print', () => {
  const lancamentos = [
    {
      id: 1,
      data: '2026-05-23',
      tipo: 'Entrada',
      categoria: 'Pagamento OS',
      descricao: 'Entrada OS-0001',
      pagamento: 'Cart\u00e3o Cr\u00e9dito',
      valor: 100,
      ordemnumero: 'OS-0001',
    },
    {
      id: 2,
      data: '2026-05-23',
      tipo: 'Entrada',
      categoria: 'Venda avulsa',
      descricao: 'Venda avulsa',
      pagamento: 'Cartao de Credito',
      valor: 50,
      itens_resumo: '1x Moldura',
    },
    {
      id: 3,
      data: '2026-05-23',
      tipo: 'Sa\u00edda',
      categoria: 'Fornecedor',
      descricao: 'Compra material',
      pagamento: 'Pix',
      valor: 40,
    },
  ];

  it('calculates backend totals and consolidates credit card aliases', () => {
    const fechamento = montarFechamentoCaixa({ data: '2026-05-23', lancamentos });

    expect(fechamento.entrada).toBe(150);
    expect(fechamento.saida).toBe(40);
    expect(fechamento.saldo).toBe(110);
    expect(fechamento.entradasPorPagamento).toEqual([
      { pagamento: 'Credito', label: 'Cartao de Credito', total: 150, itens: expect.any(Array) },
    ]);
  });

  it('renders a branded daily closing with totals, rows and signatures', () => {
    const fechamento = montarFechamentoCaixa({ data: '2026-05-23', lancamentos });
    const html = renderFechamentoCaixaHtml({ data: '2026-05-23', fechamento, usuario: { name: 'Caixa' } });

    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('Fechamento Diario de Caixa');
    expect(html).toContain('23/05/2026');
    expect(html).toContain('Cartao de Credito');
    expect(html).toContain('R$&nbsp;150,00');
    expect(html).toContain('OS-0001');
    expect(html).toContain('1x Moldura');
    expect(html).toContain('Responsavel pelo Caixa');
    expect(html).toContain('Conferencia');
  });

  it('does not render the outgoing totals by category section', () => {
    const fechamento = montarFechamentoCaixa({ data: '2026-05-23', lancamentos });
    const html = renderFechamentoCaixaHtml({ data: '2026-05-23', fechamento, usuario: { name: 'Caixa' } });

    expect(html).not.toContain('Saidas por categoria');
  });
});
