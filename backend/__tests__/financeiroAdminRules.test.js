import { describe, expect, it } from 'vitest';

const {
  STATUS_CONTA_PAGAR,
  calcularResumoFinanceiroAdmin,
  normalizarStatusContaPagar,
  validarContaPagar,
} = await import('../domain/financeiroAdminRules.js');

describe('financeiroAdminRules', () => {
  it('normalizes accounts payable status aliases', () => {
    expect(STATUS_CONTA_PAGAR).toEqual(['Pendente', 'Pago', 'Cancelado']);
    expect(normalizarStatusContaPagar('paga')).toBe('Pago');
    expect(normalizarStatusContaPagar('cancelada')).toBe('Cancelado');
    expect(normalizarStatusContaPagar('')).toBe('Pendente');
  });

  it('validates required account payable fields', () => {
    const errors = validarContaPagar({
      fornecedor: '',
      descricao: '',
      valor: 0,
      vencimento: '',
    });

    expect(errors).toEqual([
      'fornecedor obrigatorio',
      'descricao obrigatoria',
      'valor deve ser maior que zero',
      'vencimento obrigatorio',
    ]);
  });

  it('calculates realized and projected financial summary', () => {
    const resumo = calcularResumoFinanceiroAdmin({
      receitaRealizada: 1000,
      saidasPagas: 250,
      contasPendentes: 300,
      contasVencidas: 80,
    });

    expect(resumo).toEqual({
      receitaRealizada: 1000,
      despesasPagas: 250,
      contasPendentes: 300,
      contasVencidas: 80,
      saldoRealizado: 750,
      saldoPrevisto: 450,
      resultadoGerencial: 750,
    });
  });
});
