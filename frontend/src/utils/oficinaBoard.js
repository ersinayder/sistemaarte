const STATUS_ORDER = {
  Aguardando: 0,
  'Em Produção': 1,
  Pronto: 2,
  Entregue: 3,
};

function datePart(value) {
  return value ? String(value).slice(0, 10) : '';
}

function parseDateOnly(value) {
  const parts = datePart(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentWorkWeekStart(today) {
  const date = parseDateOnly(today);
  if (!date) return null;
  const day = date.getDay();
  if (day === 0 || day === 6) return null;
  const start = new Date(date);
  start.setDate(date.getDate() - (day - 1));
  return formatDateOnly(start);
}

function timeValue(value) {
  if (!value) return 0;
  const parsed = Date.parse(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function comparePrazoEntrega(a, b) {
  if (!a.prazoentrega && !b.prazoentrega) {
    return timeValue(a.criadoem || a.createdat) - timeValue(b.criadoem || b.createdat);
  }
  if (!a.prazoentrega) return 1;
  if (!b.prazoentrega) return -1;
  const byPrazo = timeValue(a.prazoentrega) - timeValue(b.prazoentrega);
  if (byPrazo !== 0) return byPrazo;
  return timeValue(a.criadoem || a.createdat) - timeValue(b.criadoem || b.createdat);
}

function compareMovimento(a, b) {
  const byTime = timeValue(b.statusalteradoem || b.updatedat || b.criadoem || b.createdat)
    - timeValue(a.statusalteradoem || a.updatedat || a.criadoem || a.createdat);
  if (byTime !== 0) return byTime;
  return Number(b.id || 0) - Number(a.id || 0);
}

export function filtrarOrdensOficina(ordens, today) {
  const weekStart = currentWorkWeekStart(today);
  const todayPart = datePart(today);

  return (ordens || []).filter((ordem) => {
    if (ordem.status === 'Cancelado') return false;
    if (ordem.status !== 'Entregue') return true;
    const movedAt = datePart(ordem.statusalteradoem);
    return Boolean(weekStart && movedAt >= weekStart && movedAt <= todayPart);
  });
}

export function ordenarOrdensOficina(ordens) {
  return [...(ordens || [])].sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (byStatus !== 0) return byStatus;
    if (a.status === 'Aguardando') return comparePrazoEntrega(a, b);
    return compareMovimento(a, b);
  });
}
