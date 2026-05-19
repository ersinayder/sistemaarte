function normalizarPaginacao(query = {}, defaults = {}) {
  const defaultLimit = Number(defaults.defaultLimit || 25);
  const maxLimit = Number(defaults.maxLimit || 100);
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limitBase = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  const limit = Math.min(Math.max(limitBase, 1), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

function montarMetaPaginacao({ page, limit, total }) {
  const safeTotal = Math.max(0, Number(total || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = {
  normalizarPaginacao,
  montarMetaPaginacao,
};
