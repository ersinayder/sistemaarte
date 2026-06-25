import { describe, expect, it } from "vitest";
import {
  auditarIntegridadeFinanceiraOS,
  montarDetalheIntegridadeFinanceiraOS,
} from "../services/financeiroIntegridadeService.js";

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

  it("builds read-only detail with official saldo and launch inclusion flags", () => {
    const detalhe = montarDetalheIntegridadeFinanceiraOS({
      ordem: { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção", valortotal: 120 },
      receberGerencial: { id: 3, saldo: 85, recebido: 35 },
      lancamentos: [
        { id: 7, data: "2026-06-25", tipo: "Entrada", categoria: "Saldo OS", descricao: "Pix", pagamento: "Pix", valor: 30, pago: 1, origem: "saldoos", deletedat: null },
        { id: 8, data: "2026-06-25", tipo: "Entrada", categoria: "Saldo OS", descricao: "Pendente", pagamento: "Pix", valor: 20, pago: 0, origem: "saldoos", deletedat: null },
        { id: 9, data: "2026-06-25", tipo: "Entrada", categoria: "Saldo OS", descricao: "Excluido", pagamento: "Pix", valor: 10, pago: 1, origem: "saldoos", deletedat: "2026-06-26" },
      ],
      getResumoFinanceiroOS: () => ({
        ordem: { id: 3, numero: "OS-3", clientenome: "Caio", status: "Em Produção", valortotal: 120 },
        recebido: 30,
        saldo: 90,
      }),
    });

    expect(detalhe.resumo).toEqual({
      valorTotal: 120,
      recebidoOficial: 30,
      saldoOficial: 90,
      excedente: 0,
    });
    expect(detalhe.receberGerencial).toEqual(expect.objectContaining({ saldo: 85 }));
    expect(detalhe.lancamentos).toEqual([
      expect.objectContaining({ id: 7, consideradoNoSaldo: true }),
      expect.objectContaining({ id: 8, consideradoNoSaldo: false }),
      expect.objectContaining({ id: 9, consideradoNoSaldo: false }),
    ]);
    expect(detalhe.apontamentos).toEqual([
      expect.objectContaining({ tipo: "receber_divergente", severidade: "aviso" }),
    ]);
  });
});
