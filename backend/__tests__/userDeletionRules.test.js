import { describe, expect, it } from "vitest";

const {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  summarizeReferenceCounts,
  canPermanentlyDeleteUser,
} = await import("../domain/userDeletionRules.js");

describe("userDeletionRules", () => {
  it("lists historical references that block physical deletion", () => {
    expect(USER_HISTORY_REFERENCES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "ordens", column: "criadopor" }),
        expect.objectContaining({ table: "lancamentos", column: "criadopor" }),
        expect.objectContaining({ table: "statuslog", column: "usuarioid" }),
        expect.objectContaining({ table: "nfe_inutilizacoes", column: "solicitado_por" }),
      ])
    );
  });

  it("normalizes archive reason safely", () => {
    expect(normalizeArchiveReason("  Saiu da loja  ")).toBe("Saiu da loja");
    expect(normalizeArchiveReason("")).toBe("Arquivado pela gestao de usuarios");
    expect(normalizeArchiveReason("x".repeat(260))).toHaveLength(240);
  });

  it("summarizes only positive reference counts", () => {
    const summary = summarizeReferenceCounts([
      { table: "ordens", column: "criadopor", label: "OS criadas", total: 2 },
      { table: "lancamentos", column: "criadopor", label: "lancamentos criados", total: 0 },
    ]);

    expect(summary).toEqual([
      { table: "ordens", column: "criadopor", label: "OS criadas", total: 2 },
    ]);
  });

  it("allows permanent deletion only when there are no historical links", () => {
    expect(canPermanentlyDeleteUser([])).toEqual({ allowed: true, blockers: [] });
    expect(canPermanentlyDeleteUser([
      { table: "statuslog", column: "usuarioid", label: "mudancas de status", total: 1 },
    ])).toEqual({
      allowed: false,
      blockers: [
        { table: "statuslog", column: "usuarioid", label: "mudancas de status", total: 1 },
      ],
    });
  });
});
