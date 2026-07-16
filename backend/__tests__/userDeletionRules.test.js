import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  summarizeReferenceCounts,
  canPermanentlyDeleteUser,
} = await import("../domain/userDeletionRules.js");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_USER_HISTORY_REFERENCES = [
  { table: "ordens", column: "criadopor", label: "OS criadas" },
  { table: "ordens", column: "deletedpor", label: "OS excluidas" },
  { table: "ordens", column: "nfe_deletedpor", label: "NF-e movidas para lixeira" },
  { table: "lancamentos", column: "criadopor", label: "lancamentos criados" },
  { table: "lancamentos", column: "deletedpor", label: "lancamentos excluidos" },
  { table: "statuslog", column: "usuarioid", label: "mudancas de status" },
  { table: "users", column: "deletedpor", label: "usuarios arquivados" },
  { table: "propostas", column: "criadopor", label: "propostas criadas" },
  { table: "contas_pagar", column: "criadopor", label: "contas a pagar criadas" },
  { table: "contas_pagar", column: "deletedpor", label: "contas a pagar excluidas" },
  { table: "clientes", column: "deletedpor", label: "clientes excluidos" },
  { table: "produtos", column: "deletedpor", label: "produtos excluidos" },
  { table: "whatsapp_avisos", column: "aberto_por", label: "avisos abertos" },
  { table: "whatsapp_avisos", column: "enviado_por", label: "avisos enviados" },
  { table: "whatsapp_avisos", column: "ignorado_por", label: "avisos ignorados" },
  { table: "nfe_notas", column: "criadopor", label: "notas fiscais criadas" },
  { table: "nfe_notas", column: "deletedpor", label: "notas fiscais arquivadas" },
  { table: "nfe_emissao_tentativas", column: "solicitado_por", label: "tentativas de NF-e" },
  { table: "nfe_evento_tentativas", column: "solicitado_por", label: "eventos fiscais" },
  { table: "nfe_inutilizacoes", column: "solicitado_por", label: "inutilizacoes" },
  { table: "nfe_integridade_conciliacoes", column: "createdby", label: "conciliacoes fiscais" },
];

describe("userDeletionRules", () => {
  it("lists every historical reference that blocks physical deletion", () => {
    expect(USER_HISTORY_REFERENCES).toEqual(EXPECTED_USER_HISTORY_REFERENCES);
  });

  it("defines complete catalog entries", () => {
    for (const item of USER_HISTORY_REFERENCES) {
      expect(item.table).toEqual(expect.any(String));
      expect(item.table.trim()).not.toBe("");
      expect(item.column).toEqual(expect.any(String));
      expect(item.column.trim()).not.toBe("");
      expect(item.label).toEqual(expect.any(String));
      expect(item.label.trim()).not.toBe("");
    }
  });

  it("keeps catalog table and column names anchored to the database source", () => {
    const databasePath = path.resolve(__dirname, "../database.js");
    const databaseSource = fs.readFileSync(databasePath, "utf8");

    for (const item of USER_HISTORY_REFERENCES) {
      expect(databaseSource).toContain(item.table);
      expect(databaseSource).toContain(item.column);
    }
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
