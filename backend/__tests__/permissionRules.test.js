import { describe, expect, it } from "vitest";

const {
  PERMISSIONS,
  DEFAULT_PROFILE_PERMISSIONS,
  isKnownPermission,
  getDefaultPermissionsForProfile,
  hasPermission,
  hasAnyPermission,
  assertKnownPermissions,
} = await import("../domain/permissionRules.js");

describe("permissionRules", () => {
  it("keeps admin as the complete permission set", () => {
    expect(getDefaultPermissionsForProfile("admin")).toEqual(PERMISSIONS);
  });

  it("keeps caixa operational but not administrative", () => {
    const caixa = getDefaultPermissionsForProfile("caixa");

    expect(caixa).toContain("atendimento.ver");
    expect(caixa).toContain("ordens.criar");
    expect(caixa).toContain("caixa.criar_lancamento");
    expect(caixa).toContain("clientes.editar");
    expect(caixa).toContain("produtos.editar");
    expect(caixa).toContain("propostas.gerar_os");
    expect(caixa).toContain("nfe.emitir");
    expect(caixa).toContain("nfe.danfe");
    expect(caixa).not.toContain("usuarios.editar");
    expect(caixa).not.toContain("configuracoes.editar_fiscal");
    expect(caixa).not.toContain("financeiro.relatorios");
    expect(caixa).not.toContain("nfe.inutilizar");
  });

  it("keeps oficina restricted to redacted workshop workflow", () => {
    const oficina = getDefaultPermissionsForProfile("oficina");

    expect(oficina).toEqual([
      "ordens.ver",
      "ordens.alterar_status",
      "ordens.whatsapp",
      "oficina.ver",
      "oficina.alterar_status",
    ]);
    expect(oficina).not.toContain("ordens.cancelar");
    expect(oficina).not.toContain("caixa.ver");
    expect(oficina).not.toContain("nfe.ver");
  });

  it("validates unknown permissions", () => {
    expect(isKnownPermission("usuarios.ver")).toBe(true);
    expect(isKnownPermission("usuarios.voar")).toBe(false);
    expect(() => assertKnownPermissions(["usuarios.ver", "usuarios.voar"])).toThrow(/Permissao desconhecida: usuarios.voar/);
  });

  it("checks one or any permission safely", () => {
    const user = { permissions: ["clientes.ver", "clientes.editar"] };

    expect(hasPermission(user, "clientes.ver")).toBe(true);
    expect(hasPermission(user, "clientes.excluir")).toBe(false);
    expect(hasPermission(null, "clientes.ver")).toBe(false);
    expect(hasPermission({ permissions: ["*"] }, "qualquer.coisa")).toBe(true);
    expect(hasAnyPermission(user, ["produtos.ver", "clientes.editar"])).toBe(true);
    expect(hasAnyPermission(user, ["produtos.ver", "clientes.excluir"])).toBe(false);
    expect(hasAnyPermission(user, [])).toBe(false);
  });

  it("does not duplicate permissions inside default profiles", () => {
    for (const [profileKey, permissions] of Object.entries(DEFAULT_PROFILE_PERMISSIONS)) {
      expect(new Set(permissions).size, profileKey).toBe(permissions.length);
    }
  });
});
