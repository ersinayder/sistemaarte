/**
 * Utilitários para padronização de datas no fuso horário oficial de Brasília (UTC-3).
 * Evita bugs em que `new Date().toISOString().slice(0, 10)` retorna a data do dia seguinte
 * quando executado entre 21h00 e 23h59 no Brasil (00h00 a 02h59 UTC).
 */

export function hojeBrt(now = new Date()) {
  const d = new Date(now.getTime() - 3 * 3600000);
  return d.toISOString().slice(0, 10);
}

export function mesAtualBrt(now = new Date()) {
  return hojeBrt(now).slice(0, 7);
}

export function hojeMaisDiasBrt(days, now = new Date()) {
  const base = new Date(hojeBrt(now) + 'T12:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}
