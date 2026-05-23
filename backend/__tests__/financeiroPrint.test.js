import { describe, expect, it } from 'vitest';

const reports = await import('../utils/print/financeiroReports.js');

describe('financeiro print reports', () => {
  it('renders monthly finance summary with logo and totals', () => {
    const html = reports.renderResumoFinanceiroHtml({
      mes: '2026-05',
      resumo: {
        receitaRealizada: 1000,
        despesasPagas: 300,
        contasPendentes: 200,
        contasVencidas: 50,
        saldoRealizado: 700,
        saldoPrevisto: 500,
        despesasPorCategoria: [{ categoria: 'Fornecedor', valor: 300 }],
      },
    });

    expect(html).toContain('class="brand-logo"');
    expect(html).toContain('Resumo Financeiro');
    expect(html).toContain('R$&nbsp;1.000,00');
    expect(html).toContain('Fornecedor');
  });

  it('renders DRE with result and expense rows', () => {
    const html = reports.renderDreHtml({
      mes: '2026-05',
      dre: {
        receitaBruta: 1200,
        devolucoes: 100,
        receitaLiquida: 1100,
        despesas: [{ categoria: 'Aluguel', valor: 400 }],
        totalDespesas: 400,
        resultado: 700,
      },
    });

    expect(html).toContain('DRE Gerencial');
    expect(html).toContain('Aluguel');
    expect(html).toContain('R$&nbsp;700,00');
  });

  it('renders payable and receivable reports', () => {
    const pagar = reports.renderContasPagarHtml({
      mes: '2026-05',
      contas: [{ vencimento: '2026-05-25', fornecedor: 'Fornecedor A', descricao: 'Madeira', categoria: 'Materiais', status: 'Pendente', valor: 250 }],
    });
    const receber = reports.renderContasReceberHtml({
      contas: [{ prazoentrega: '2026-05-28', numero: 'OS-0002', clientenome: 'Cliente B', status: 'Pronto', valortotal: 500, recebido: 200, saldo: 300 }],
    });

    expect(pagar).toContain('Contas a Pagar');
    expect(pagar).toContain('Fornecedor A');
    expect(receber).toContain('Contas a Receber');
    expect(receber).toContain('OS-0002');
    expect(receber).toContain('R$&nbsp;300,00');
  });
});
