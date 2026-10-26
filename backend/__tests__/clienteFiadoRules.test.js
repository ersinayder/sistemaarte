import { describe, expect, it } from "vitest";
import { validarEntregaComSaldo } from "../domain/clienteFiadoRules.js";

describe("Task 5: clienteFiadoRules - validarEntregaComSaldo", () => {
  const usuarioCaixa = { id: 2, permissions: ["ordens.entregar_fiado"] };
  const usuarioOficina = { id: 3, permissions: ["oficina.alterar_status"] };
  const usuarioAdmin = { id: 1, permissions: ["ordens.entregar_fiado", "ordens.entregar_acima_limite"] };

  it("permite entrega quando o saldo em aberto é zero ou insignificante", () => {
    expect(validarEntregaComSaldo({ saldoOrdem: 0 })).toEqual({ ok: true });
    expect(validarEntregaComSaldo({ saldoOrdem: 0.005 })).toEqual({ ok: true });
  });

  it("bloqueia entrega com saldo se a OS não possuir cliente identificado", () => {
    const res = validarEntregaComSaldo({
      saldoOrdem: 50,
      ordem: { id: 10, clienteid: null },
      cliente: null,
      usuario: usuarioCaixa,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("CLIENTE_NAO_IDENTIFICADO");
  });

  it("bloqueia entrega com saldo se o cliente não tiver fiado ativo", () => {
    const res = validarEntregaComSaldo({
      saldoOrdem: 50,
      ordem: { id: 10, clienteid: 1 },
      cliente: { id: 1, fiado_ativo: 0, fiado_limite: 100 },
      usuario: usuarioCaixa,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FIADO_NAO_PERMITIDO");
  });

  it("bloqueia entrega com saldo se o usuário não tiver permissão ordens.entregar_fiado (ex: oficina)", () => {
    const res = validarEntregaComSaldo({
      saldoOrdem: 50,
      ordem: { id: 10, clienteid: 1 },
      cliente: { id: 1, fiado_ativo: 1, fiado_limite: 100 },
      usuario: usuarioOficina,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("SEM_PERMISSAO");
  });

  it("permite entrega quando a dívida total cabe no limite do fiado", () => {
    const res = validarEntregaComSaldo({
      saldoOrdem: 50,
      ordem: { id: 10, clienteid: 1 },
      cliente: { id: 1, fiado_ativo: 1, fiado_limite: 200 },
      dividaAtualCliente: 100,
      usuario: usuarioCaixa,
    });
    expect(res.ok).toBe(true);
    expect(res.acimaLimite).toBe(false);
  });

  it("bloqueia entrega se a nova dívida ultrapassar o limite e usuário não tiver ordens.entregar_acima_limite", () => {
    const res = validarEntregaComSaldo({
      saldoOrdem: 150,
      ordem: { id: 10, clienteid: 1 },
      cliente: { id: 1, fiado_ativo: 1, fiado_limite: 200 },
      dividaAtualCliente: 100, // total ficaria 250 > 200
      usuario: usuarioCaixa,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("FIADO_LIMITE_EXCEDIDO");
    expect(res.error).toMatch(/Limite de fiado excedido/);
  });

  it("permite entrega acima do limite se admin confirmar explicitamente", () => {
    const resSemConfirmar = validarEntregaComSaldo({
      saldoOrdem: 150,
      ordem: { id: 10, clienteid: 1 },
      cliente: { id: 1, fiado_ativo: 1, fiado_limite: 200 },
      dividaAtualCliente: 100,
      usuario: usuarioAdmin,
      confirmarAcimaLimite: false,
    });
    expect(resSemConfirmar.ok).toBe(false);
    expect(resSemConfirmar.code).toBe("FIADO_LIMITE_EXCEDIDO");

    const resComConfirmar = validarEntregaComSaldo({
      saldoOrdem: 150,
      ordem: { id: 10, clienteid: 1 },
      cliente: { id: 1, fiado_ativo: 1, fiado_limite: 200 },
      dividaAtualCliente: 100,
      usuario: usuarioAdmin,
      confirmarAcimaLimite: true,
    });
    expect(resComConfirmar.ok).toBe(true);
    expect(resComConfirmar.acimaLimite).toBe(true);
    expect(resComConfirmar.novaDivida).toBe(250);
  });
});
