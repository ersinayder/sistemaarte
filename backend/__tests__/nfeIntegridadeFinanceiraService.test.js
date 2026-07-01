import { describe, expect, it } from "vitest";
import {
  auditarIntegridadeFiscalFinanceiraNFe,
  montarDetalheIntegridadeFiscalFinanceiraNFe,
  prepararConciliacaoIntegridadeFiscalFinanceiraNFe,
} from "../services/nfeIntegridadeFinanceiraService.js";

describe("auditarIntegridadeFiscalFinanceiraNFe", () => {
  it("reports authorized NFe whose XML total differs from current OS total", () => {
    const result = auditarIntegridadeFiscalFinanceiraNFe([
      {
        id: 10,
        numero: "OS-10",
        clientenome: "Ana",
        status: "Pronto",
        valortotal: 120,
        nfe_status: "autorizado",
        nfe_chave: "35111111111111111111111111111111111111111111",
        nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
      },
    ]);

    expect(result.itens).toEqual([
      expect.objectContaining({
        tipo: "nfe_total_divergente",
        severidade: "critico",
        ordemId: 10,
        valorOS: 120,
        valorNFe: 100,
        diferenca: 20,
      }),
    ]);
    expect(result.meta).toEqual({ total: 1, criticos: 1, avisos: 0 });
  });

  it("does not report a divergent total already reconciled for the same local values", () => {
    const result = auditarIntegridadeFiscalFinanceiraNFe([
      {
        id: 10,
        numero: "OS-10",
        clientenome: "Ana",
        status: "Entregue",
        valortotal: 1,
        nfe_status: "autorizado",
        nfe_chave: "35111111111111111111111111111111111111111111",
        nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
        conciliacao_tipo: "nfe_total_divergente",
        conciliacao_valor_os: 1,
        conciliacao_valor_nfe: 1500,
        conciliacao_motivo: "NF-e emitida sem impacto no caixa da OS.",
        conciliacao_createdat: "2026-06-30T20:00:00.000Z",
        conciliacao_createdby: 7,
      },
    ]);

    expect(result).toEqual({
      itens: [],
      meta: { total: 0, criticos: 0, avisos: 0 },
    });
  });

  it("reports a divergent total again when current values differ from the reconciliation", () => {
    const result = auditarIntegridadeFiscalFinanceiraNFe([
      {
        id: 10,
        numero: "OS-10",
        clientenome: "Ana",
        status: "Entregue",
        valortotal: 2,
        nfe_status: "autorizado",
        nfe_chave: "35111111111111111111111111111111111111111111",
        nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
        conciliacao_tipo: "nfe_total_divergente",
        conciliacao_valor_os: 1,
        conciliacao_valor_nfe: 1500,
        conciliacao_motivo: "NF-e emitida sem impacto no caixa da OS.",
        conciliacao_createdat: "2026-06-30T20:00:00.000Z",
        conciliacao_createdby: 7,
      },
    ]);

    expect(result.itens).toEqual([
      expect.objectContaining({
        tipo: "nfe_total_divergente",
        valorOS: 2,
        valorNFe: 1500,
        diferenca: -1498,
      }),
    ]);
    expect(result.meta).toEqual({ total: 1, criticos: 1, avisos: 0 });
  });

  it("prepares an auditable reconciliation for an active divergent total", () => {
    const result = prepararConciliacaoIntegridadeFiscalFinanceiraNFe(
      {
        id: 10,
        numero: "OS-10",
        clientenome: "Ana",
        status: "Entregue",
        valortotal: 1,
        nfe_status: "autorizado",
        nfe_chave: "35111111111111111111111111111111111111111111",
        nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
      },
      {
        motivo: "NF-e emitida somente para atender pedido fiscal, sem impacto no caixa.",
        userId: 7,
        now: () => "2026-06-30T20:00:00.000Z",
      }
    );

    expect(result).toEqual({
      ok: true,
      registro: {
        ordemId: 10,
        tipo: "nfe_total_divergente",
        valorOS: 1,
        valorNFe: 1500,
        motivo: "NF-e emitida somente para atender pedido fiscal, sem impacto no caixa.",
        createdBy: 7,
        createdAt: "2026-06-30T20:00:00.000Z",
      },
    });
  });

  it("reports missing authorized XML and cancelled NFe on delivered OS", () => {
    const result = auditarIntegridadeFiscalFinanceiraNFe([
      {
        id: 11,
        numero: "OS-11",
        clientenome: "Bia",
        status: "Pronto",
        valortotal: 50,
        nfe_status: "autorizado",
        nfe_chave: "352",
        nfe_xml: null,
      },
      {
        id: 12,
        numero: "OS-12",
        clientenome: "Caio",
        status: "Entregue",
        valortotal: 80,
        nfe_status: "cancelado",
        nfe_chave: "353",
        nfe_xml: null,
      },
    ]);

    expect(result.itens).toEqual([
      expect.objectContaining({ tipo: "nfe_xml_ausente", severidade: "critico", ordemId: 11 }),
      expect.objectContaining({ tipo: "nfe_cancelada_os_entregue", severidade: "aviso", ordemId: 12 }),
    ]);
    expect(result.meta).toEqual({ total: 2, criticos: 1, avisos: 1 });
  });

  it("builds sanitized detail for divergent authorized NFe", () => {
    const detalhe = montarDetalheIntegridadeFiscalFinanceiraNFe({
      id: 10,
      numero: "OS-10",
      clientenome: "Ana",
      status: "Pronto",
      valortotal: 120,
      nfe_status: "autorizado",
      nfe_chave: "35111111111111111111111111111111111111111111",
      nfe_xml: "<nfeProc><NFe><infNFe><total><ICMSTot><vNF>100.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>",
    });

    expect(detalhe).toEqual({
      ordem: {
        id: 10,
        numero: "OS-10",
        clienteNome: "Ana",
        status: "Pronto",
        valorTotal: 120,
      },
      fiscal: {
        status: "autorizado",
        chave: "35111111111111111111111111111111111111111111",
        xmlLocal: "presente",
        valorNFe: 100,
      },
      apontamentos: [
        expect.objectContaining({
          tipo: "nfe_total_divergente",
          severidade: "critico",
          valorOS: 120,
          valorNFe: 100,
          diferenca: 20,
        }),
      ],
      orientacao: "Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e.",
    });
    expect(JSON.stringify(detalhe)).not.toMatch(/nfeProc|infNFe|vNF|nfe_xml|payload|cpf|phone/i);
  });

  it("builds detail for missing authorized XML without leaking raw XML fields", () => {
    const detalhe = montarDetalheIntegridadeFiscalFinanceiraNFe({
      id: 11,
      numero: "OS-11",
      clientenome: "Bia",
      status: "Aguardando",
      valortotal: 50,
      nfe_status: "autorizado",
      nfe_chave: "352",
      nfe_xml: null,
    });

    expect(detalhe.fiscal).toEqual({
      status: "autorizado",
      chave: "352",
      xmlLocal: "ausente",
    });
    expect(detalhe.apontamentos).toEqual([
      expect.objectContaining({ tipo: "nfe_xml_ausente", severidade: "critico" }),
    ]);
  });
});
