const { toNumber } = require("../utils/numbers");

function normalizarItensVendaAvulsa(itens) {
  if (!Array.isArray(itens)) return [];

  return itens
    .map((item) => {
      const nome = String(item?.nome || "").trim();
      if (!nome) return null;

      const quantidade = Math.max(1, toNumber(item?.quantidade || 1));
      const preco_unitario = Math.max(0, toNumber(item?.preco_unitario ?? item?.preco ?? 0));
      if (!(preco_unitario > 0)) return null;

      const rawProdutoId = Number(item?.produto_id);
      const produtoId = Number.isFinite(rawProdutoId) && rawProdutoId > 0 ? rawProdutoId : null;
      return {
        produto_id: produtoId,
        nome,
        quantidade,
        preco_unitario,
        avulso: produtoId ? 0 : 1,
      };
    })
    .filter(Boolean);
}

function totalItensVendaAvulsa(itens) {
  return normalizarItensVendaAvulsa(itens)
    .reduce((total, item) => total + item.quantidade * item.preco_unitario, 0);
}

function descricaoVendaAvulsa(itens) {
  const normalizados = normalizarItensVendaAvulsa(itens);
  if (normalizados.length === 0) return "";

  const partes = normalizados
    .slice(0, 3)
    .map((item) => `${item.quantidade}x ${item.nome}`);
  const extra = normalizados.length > 3 ? ` +${normalizados.length - 3} item(ns)` : "";
  return `Venda avulsa: ${partes.join(", ")}${extra}`;
}

module.exports = {
  descricaoVendaAvulsa,
  normalizarItensVendaAvulsa,
  totalItensVendaAvulsa,
};
