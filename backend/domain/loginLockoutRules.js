const MAX_FALHAS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 1000;

function normalizarUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function criarEstadoLockout() {
  return new Map();
}

function limparEstadoLockout(state, now = Date.now()) {
  for (const [key, entry] of state.entries()) {
    const lockedExpired = entry?.lockedUntil && entry.lockedUntil <= now;
    const failuresExpired = entry?.firstFailureAt && now - entry.firstFailureAt > LOCKOUT_MS;
    if (lockedExpired || (!entry?.lockedUntil && failuresExpired)) state.delete(key);
  }

  while (state.size >= MAX_ENTRIES) {
    const oldest = state.keys().next().value;
    if (!oldest) break;
    state.delete(oldest);
  }
}

function verificarLockoutLogin(state, username, now = Date.now()) {
  const key = normalizarUsername(username);
  const entry = state.get(key);
  if (!entry?.lockedUntil || entry.lockedUntil <= now) {
    if (entry?.lockedUntil && entry.lockedUntil <= now) state.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }
  return { locked: true, retryAfterMs: entry.lockedUntil - now };
}

function registrarFalhaLogin(state, username, now = Date.now()) {
  const key = normalizarUsername(username);
  if (!key) return { locked: false, retryAfterMs: 0 };
  if (!state.has(key)) limparEstadoLockout(state, now);

  const atual = state.get(key) || { failures: 0, lockedUntil: 0 };
  const firstFailureAt = atual.firstFailureAt && now - atual.firstFailureAt <= LOCKOUT_MS
    ? atual.firstFailureAt
    : now;
  const failures = atual.lockedUntil && atual.lockedUntil > now
    ? atual.failures
    : (firstFailureAt === atual.firstFailureAt ? atual.failures + 1 : 1);
  const lockedUntil = failures >= MAX_FALHAS ? now + LOCKOUT_MS : 0;
  state.set(key, { failures, firstFailureAt, lockedUntil });
  return verificarLockoutLogin(state, key, now);
}

function registrarSucessoLogin(state, username) {
  state.delete(normalizarUsername(username));
}

module.exports = {
  criarEstadoLockout,
  registrarFalhaLogin,
  registrarSucessoLogin,
  verificarLockoutLogin,
  MAX_FALHAS,
  MAX_ENTRIES,
  LOCKOUT_MS,
};
