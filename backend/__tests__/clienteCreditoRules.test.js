import { describe, expect, it } from "vitest";
import {
  calcularSaldoCredito,
  validarUsoCredito,
  validarInvarianteCredito,
} from "../domain/clienteCreditoRules.js";

describe("Task 3: clienteCreditoRules", () => {
  it("calcula saldo somando entradas e subtraindo saídas/usos/devoluções com precisão de centavos", () => {
    const movimentos = [
      { id: 1, tipo: "gerado", valor: 100.5 },
      { id: 2, tipo: "saldo_inicial", valor: 50.25 },
      { id: 3, tipo: "usado", valor: -30.0 },
      { id: 4, tipo: "devolvido", valor: -20.5 },
      { id: 5, tipo: "ajuste_entrada", valor: 10.0 },
      { id: 6, tipo: "ajuste_saida", valor: -5.25 },
    ];
    // 100.5 + 50.25 - 30.0 - 20.5 + 10.0 - 5.25 = 105.00
    expect(calcularSaldoCredito(movimentos)).toBe(105);
  });

  it("retorna zero para lista vazia ou sem movimentos válidos", () => {
    expect(calcularSaldoCredito([])).toBe(0);
    expect(calcularSaldoCredito(null)).toBe(0);
  });

  it("anula movimentos que foram estornados mutuamente", () => {
    const movimentos = [
      { id: 1, tipo: "gerado", valor: 100 },
      { id: 2, tipo: "estorno", valor: -100, estorna_id: 1 },
      { id: 3, tipo: "saldo_inicial", valor: 45 },
    ];
    expect(calcularSaldoCredito(movimentos)).toBe(45);
  });

  it("valida uso de crédito impedindo valor menor ou igual a zero e maior que saldo disponível", () => {
    expect(validarUsoCredito({ saldoDisponivel: 100, valorDesejado: 50 })).toEqual({ valido: true });
    expect(validarUsoCredito({ saldoDisponivel: 100, valorDesejado: 100 })).toEqual({ valido: true });

    expect(validarUsoCredito({ saldoDisponivel: 100, valorDesejado: 0 })).toEqual({
      valido: false,
      erro: "Valor do crédito a utilizar deve ser maior que zero.",
    });

    expect(validarUsoCredito({ saldoDisponivel: 100, valorDesejado: -10 })).toEqual({
      valido: false,
      erro: "Valor do crédito a utilizar deve ser maior que zero.",
    });

    expect(validarUsoCredito({ saldoDisponivel: 100, valorDesejado: 100.01 })).toEqual({
      valido: false,
      erro: "Saldo de crédito insuficiente (disponível: R$ 100.00).",
    });
  });

  it("valida a invariante contábil com precisão de 2 casas: SUM(movimentos nao-saldo_inicial) == -SUM(lancamentos CreditoLoja) - SUM(saidas credito_devolvido)", () => {
    // Exemplo:
    // Movimentos não saldo inicial:
    // - gerado: +100
    // - usado: -40
    // - devolvido: -20
    // Total movimentos não saldo inicial = +40
    //
    // Lançamentos correspondentes:
    // - gerado (tipo Entrada, valor -100, pagamento CreditoLoja)
    // - usado (tipo Entrada, valor +40, pagamento CreditoLoja)
    // Soma lancamentos CreditoLoja = -100 + 40 = -60. Negativo disso = +60.
    // - devolvido (tipo Saida, valor +20, origem credito_devolvido). Menos saidas = -20.
    // Total esperado = +60 - 20 = +40.
    // Bate exatamente!

    const inv = validarInvarianteCredito({
      totalMovimentosSemSaldoInicial: 40,
      totalLancamentosCreditoLoja: -60,
      totalSaidasDevolvido: 20,
    });

    expect(inv.valido).toBe(true);
    expect(inv.diferenca).toBe(0);

    const invInvalida = validarInvarianteCredito({
      totalMovimentosSemSaldoInicial: 40,
      totalLancamentosCreditoLoja: -50,
      totalSaidasDevolvido: 20,
    });
    expect(invInvalida.valido).toBe(false);
    expect(invInvalida.diferenca).not.toBe(0);
  });
});
