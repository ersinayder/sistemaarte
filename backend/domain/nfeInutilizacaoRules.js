'use strict';

const ANO_MINIMO_NFE = 2006;
const NUMERO_MAXIMO_NFE = 999999999;
const LIMITE_FAIXA_INUTILIZACAO = 10000;

function toInteger(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return NaN;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : NaN;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function fraseConfirmacaoInutilizacao(numeroInicial, numeroFinal) {
  const inicial = toInteger(numeroInicial);
  const final = toInteger(numeroFinal);
  if (!Number.isInteger(inicial) || !Number.isInteger(final)) return '';
  return inicial === final
    ? `INUTILIZAR ${inicial}`
    : `INUTILIZAR ${inicial}-${final}`;
}

function faixaSobrepoe(inicioA, fimA, inicioB, fimB) {
  return inicioA <= fimB && fimA >= inicioB;
}

function erro(campo, mensagem) {
  return { ok: false, campo, erro: mensagem };
}

function validarPedidoInutilizacao(input = {}, options = {}) {
  const anoAtual = Number(options.anoAtual) || new Date().getFullYear();
  const ano = toInteger(input.ano);
  const numeroInicial = toInteger(input.numeroInicial ?? input.numero_inicial);
  const numeroFinal = toInteger(input.numeroFinal ?? input.numero_final);
  const justificativa = cleanText(input.justificativa);
  const confirmacao = String(input.confirmacao ?? '');
  const idempotencyKey = cleanText(input.idempotencyKey ?? input.idempotency_key);

  if (!Number.isInteger(ano) || ano < ANO_MINIMO_NFE || ano > anoAtual) {
    return erro('ano', `O ano deve estar entre ${ANO_MINIMO_NFE} e ${anoAtual}.`);
  }
  if (!Number.isInteger(numeroInicial) || numeroInicial < 1 || numeroInicial > NUMERO_MAXIMO_NFE) {
    return erro('numeroInicial', `O numero inicial deve estar entre 1 e ${NUMERO_MAXIMO_NFE}.`);
  }
  if (!Number.isInteger(numeroFinal) || numeroFinal < 1 || numeroFinal > NUMERO_MAXIMO_NFE) {
    return erro('numeroFinal', `O numero final deve estar entre 1 e ${NUMERO_MAXIMO_NFE}.`);
  }
  if (numeroFinal < numeroInicial) {
    return erro('numeroFinal', 'O numero final deve ser maior ou igual ao numero inicial.');
  }

  const quantidade = numeroFinal - numeroInicial + 1;
  if (quantidade > LIMITE_FAIXA_INUTILIZACAO) {
    return erro('numeroFinal', `A faixa pode conter no maximo ${LIMITE_FAIXA_INUTILIZACAO} numeros.`);
  }

  if (justificativa.length < 15 || justificativa.length > 255) {
    return erro('justificativa', 'A justificativa deve ter entre 15 e 255 caracteres.');
  }

  const confirmacaoEsperada = fraseConfirmacaoInutilizacao(numeroInicial, numeroFinal);
  if (confirmacao !== confirmacaoEsperada) {
    return erro('confirmacao', `Digite exatamente: ${confirmacaoEsperada}`);
  }

  if (!idempotencyKey || idempotencyKey.length > 120) {
    return erro('idempotencyKey', 'Chave idempotente invalida.');
  }

  return {
    ok: true,
    pedido: {
      ano,
      anoSefaz: String(ano).slice(-2),
      numeroInicial,
      numeroFinal,
      quantidade,
      justificativa,
      confirmacaoEsperada,
      idempotencyKey,
    },
  };
}

function normalizarPedidoInutilizacao(input = {}, options = {}) {
  return validarPedidoInutilizacao(input, options);
}

module.exports = {
  ANO_MINIMO_NFE,
  NUMERO_MAXIMO_NFE,
  LIMITE_FAIXA_INUTILIZACAO,
  faixaSobrepoe,
  fraseConfirmacaoInutilizacao,
  normalizarPedidoInutilizacao,
  validarPedidoInutilizacao,
};
