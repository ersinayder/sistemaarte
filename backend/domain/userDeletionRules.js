const USER_HISTORY_REFERENCES = [
  { table: "ordens", column: "criadopor", label: "OS criadas" },
  { table: "ordens", column: "deletedpor", label: "OS excluidas" },
  { table: "ordens", column: "nfe_deletedpor", label: "NF-e movidas para lixeira" },
  { table: "lancamentos", column: "criadopor", label: "lancamentos criados" },
  { table: "lancamentos", column: "deletedpor", label: "lancamentos excluidos" },
  { table: "statuslog", column: "usuarioid", label: "mudancas de status" },
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
  { table: "nfe_tentativas", column: "solicitado_por", label: "tentativas de NF-e" },
  { table: "nfe_evento_tentativas", column: "solicitado_por", label: "eventos fiscais" },
  { table: "nfe_inutilizacoes", column: "solicitado_por", label: "inutilizacoes" },
  { table: "nfe_integridade_conciliacoes", column: "createdby", label: "conciliacoes fiscais" },
];

function normalizeArchiveReason(reason) {
  const value = String(reason || "").trim();
  return (value || "Arquivado pela gestao de usuarios").slice(0, 240);
}

function summarizeReferenceCounts(counts) {
  return (counts || [])
    .map((item) => ({
      table: item.table,
      column: item.column,
      label: item.label,
      total: Number(item.total || 0),
    }))
    .filter((item) => item.total > 0);
}

function canPermanentlyDeleteUser(counts) {
  const blockers = summarizeReferenceCounts(counts);
  return { allowed: blockers.length === 0, blockers };
}

module.exports = {
  USER_HISTORY_REFERENCES,
  normalizeArchiveReason,
  summarizeReferenceCounts,
  canPermanentlyDeleteUser,
};
