import { describe, expect, it } from "vitest";
import { normalizarPagamento, labelPagamento, PAGAMENTOS_CANONICOS } from "../domain/pagamentosRules.js";
import { mapTpPag } from "../domain/nfeRules.js";

describe("Task 2: Forma de Pagamento CreditoLoja e Mapeamento Fiscal", () => {
  it("inclui CreditoLoja em PAGAMENTOS_CANONICOS", () => {
    expect(PAGAMENTOS_CANONICOS).toContain("CreditoLoja");
  });

  it("diferencia perfeitamente Credito (cartao) de CreditoLoja (haver)", () => {
    expect(normalizarPagamento("credito")).toBe("Credito");
    expect(normalizarPagamento("cartao de credito")).toBe("Credito");
    expect(normalizarPagamento("cartao credito")).toBe("Credito");
    expect(normalizarPagamento("cardcredito")).toBe("Credito");

    expect(normalizarPagamento("creditoloja")).toBe("CreditoLoja");
    expect(normalizarPagamento("crédito loja")).toBe("CreditoLoja");
    expect(normalizarPagamento("credito da loja")).toBe("CreditoLoja");
    expect(normalizarPagamento("haver")).toBe("CreditoLoja");
    expect(normalizarPagamento("valecredito")).toBe("CreditoLoja");
    expect(normalizarPagamento("vale-crédito")).toBe("CreditoLoja");
  });

  it("retorna o label operacional correto", () => {
    expect(labelPagamento("CreditoLoja")).toBe("Crédito Loja");
    expect(labelPagamento("creditoloja")).toBe("Crédito Loja");
    expect(labelPagamento("Credito")).toBe("Cartao de Credito");
  });

  it("mapeia para tPag da NF-e oficial '05' para CreditoLoja e aceita chaves canônicas", () => {
    // Código oficial da SEFAZ para Crédito Loja é '05'
    expect(mapTpPag("CreditoLoja")).toBe("05");
    expect(mapTpPag("Crédito Loja")).toBe("05");

    // Chaves canônicas e rótulos legados
    expect(mapTpPag("Pix")).toBe("17");
    expect(mapTpPag("Dinheiro")).toBe("01");
    expect(mapTpPag("Credito")).toBe("03");
    expect(mapTpPag("Cartão Crédito")).toBe("03");
    expect(mapTpPag("Debito")).toBe("04");
    expect(mapTpPag("Cartão Débito")).toBe("04");
    expect(mapTpPag("Boleto")).toBe("15");
  });
});
