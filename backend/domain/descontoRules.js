function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function calcularDescontoOS(totalBruto, descontoInput) {
  const total = Math.max(0, roundMoney(toNumber(totalBruto)));
  const raw = String(descontoInput ?? '').trim();

  if (!raw) {
    return { descontoinput: '', descontovalor: 0, valortotal: total };
  }

  const percentual = raw.endsWith('%');
  const base = percentual ? raw.slice(0, -1) : raw;
  const parsed = toNumber(base);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { descontoinput: '', descontovalor: 0, valortotal: total };
  }

  const brutoDesconto = percentual ? total * (parsed / 100) : parsed;
  const descontovalor = Math.min(total, roundMoney(brutoDesconto));

  return {
    descontoinput: raw,
    descontovalor,
    valortotal: roundMoney(total - descontovalor),
  };
}

module.exports = { calcularDescontoOS, roundMoney };
