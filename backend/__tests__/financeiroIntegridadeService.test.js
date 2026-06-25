import { describe, expect, it } from "vitest";
import { auditarIntegridadeFinanceiraOS } from "../services/financeiroIntegridadeService.js";

describe("auditarIntegridadeFinanceiraOS", () => {
  const ordens = [
    { id: 1, numero: "OS-1", clientenome: "Ana", status: "Entregue" },
    { id: 2, numero: "OS-2", clientenome: "Bia", status: "Pronto" },
    { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção" },
  ];

  const resumos = new Map([
    [
      1,
      {
        ordem: { id: 1, numero: "OS-1", clientenome: "Ana", status: "Entregue", valortotal: 100 },
        recebido: 75,
        saldo: 25,
      },
    ],
    [
      2,
      {
        ordem: { id: 2, numero: "OS-2", clientenome: "Bia", status: "Pronto", valortotal: 80 },
        recebido: 95,
        saldo: 0,
      },
    ],
    [
      3,
      {
        ordem: { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção", valortotal: 120 },
        recebido: 30,
        saldo: 90,
      },
    ],
  ]);

  function auditar(receberGerencial = [{ id: 3, saldo: 90, recebido: 30 }]) {
    return auditarIntegridadeFinanceiraOS({
      ordens,
      receberGerencial,
      getResumoFinanceiroOS: (id) => resumos.get(Number(id)),
    });
  }

  it("reports delivered orders that still have official saldo", () => {
    const resultado = auditar();

    expect(resultado.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "entregue_com_saldo",
          severidade: "critico",
          ordemId: 1,
          saldoOficial: 25,
        }),
      ])
    );
    expect(resultado.criticos).toBe(1);
  });

  it("reports overpayments without making official saldo negative", () => {
    const resultado = auditar();

    expect(resultado.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "pagamento_excedente",
          severidade: "aviso",
          ordemId: 2,
          excedente: 15,
          saldoOficial: 0,
        }),
      ])
    );
  });

  it("reports open orders missing from managerial contas a receber", () => {
    const resultado = auditar([]);

    expect(resultado.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tipo: "receber_divergente",
          severidade: "aviso",
          ordemId: 3,
          saldoOficial: 90,
          saldoGerencial: 0,
        }),
      ])
    );
  });
});
