const STATUSES_VALIDOS = ['Aguardando', 'Em Produção', 'Pronto', 'Entregue', 'Cancelado'];

/**
 * Valida regras financeiras da OS.
 * - total obrigatorio e > 0
 * - entrada opcional (0 e aceito)
 * - entrada nao pode exceder total
 * - nenhum valor pode ser negativo ou NaN
 * @returns {string|null} mensagem de erro ou null se OK
 */
function validarEntradaOS(total, entrada) {
  const t = Number(total);
  const e = Number(entrada ?? 0);

  if (!Number.isFinite(t) || t <= 0)
    return 'Valor total deve ser maior que zero.';

  if (!Number.isFinite(e) || e < 0)
    return 'Valor de entrada invalido.';

  if (e > t)
    return 'A entrada nao pode ser maior que o valor total.';

  return null;
}

function validarStatus(status) {
  if (!STATUSES_VALIDOS.includes(status))
    return `Status invalido. Permitidos: ${STATUSES_VALIDOS.join(', ')}`;
  return null;
}

/**
 * Gera a descricao do lancamento automatico ao criar/editar OS.
 * - Se entrada >= total → "Total OS-XXXX – Cliente / Servico"
 * - Se entrada <  total → "Entrada OS-XXXX – Cliente / Servico"
 * - Se entrada == 0    → "Sem entrada OS-XXXX – Cliente / Servico"
 */
function descricaoEntradaOS(numero, cliente, servico, total, entrada) {
  const sufixo = `${numero} – ${cliente}${servico ? ' / ' + servico : ''}`;
  const e = Number(entrada ?? 0);
  const t = Number(total ?? 0);
  const label = e <= 0 ? 'Sem entrada' : e >= t ? 'Total' : 'Entrada';
  return `${label} ${sufixo}`;
}

/**
 * Gera a descricao do lancamento de restante (pago posteriormente via caixa).
 */
function descricaoRestanteOS(numero, cliente, servico) {
  return `Restante ${numero} – ${cliente}${servico ? ' / ' + servico : ''}`;
}

module.exports = { validarEntradaOS, validarStatus, descricaoEntradaOS, descricaoRestanteOS, STATUSES_VALIDOS };
