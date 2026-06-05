export function normalizePrintCopies(copies) {
  const value = Number(copies)
  if (![1, 2].includes(value)) {
    throw new Error('Escolha 1 ou 2 vias para imprimir.')
  }
  return value
}

export async function printOrdem(api, ordemId, copies) {
  const normalizedCopies = normalizePrintCopies(copies)
  if (!ordemId) throw new Error('OS nao informada para impressao.')

  return api.post(`/ordens/${ordemId}/print`, { copies: normalizedCopies }, { skipGlobalErrorToast: true })
}
