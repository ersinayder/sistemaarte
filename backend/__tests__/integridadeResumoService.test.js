import { describe, expect, it } from "vitest";
import { montarResumoIntegridade } from "../services/integridadeResumoService.js";

describe("montarResumoIntegridade", () => {
  it("aggregates sanitized fiscal and financial integrity counters", () => {
    const resumo = montarResumoIntegridade({
      pendenciasFiscais: [
        { status: "incerto", xml_envio: "<xml/>" },
        { status: "processando", payload_json: "{}" },
      ],
      integridadeFinanceira: { total: 3, criticos: 2, avisos: 1, itens: [{ segredo: "x" }] },
      integridadeFiscalFinanceira: { meta: { total: 1, criticos: 1, avisos: 0 }, itens: [{ nfe_xml: "<xml/>" }] },
      now: () => 123,
    });

    expect(resumo).toEqual({
      fiscal: { pendencias: 2, incertas: 1, processando: 1 },
      financeiro: { apontamentos: 3, criticos: 2, avisos: 1 },
      fiscalFinanceiro: { apontamentos: 1, criticos: 1, avisos: 0 },
      meta: { total: 6, criticos: 3, avisos: 2, ts: 123 },
    });
    expect(JSON.stringify(resumo)).not.toMatch(/xml|payload|segredo|cpf|phone/i);
  });
});
