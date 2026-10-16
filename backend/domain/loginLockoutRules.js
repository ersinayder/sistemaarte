const MAX_FALHAS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 1000;

function normalizarUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function isDbState(state) {
  return Boolean(state && (state.db || typeof state.prepare === 'function' || typeof state.getOne === 'function'));
}

function getDbInstance(state) {
  if (!state) return null;
  if (state.db) return state.db;
  return state;
}

function criarEstadoLockout(db = null) {
  if (db) {
    return { type: 'db', db };
  }
  return new Map();
}

function limparEstadoLockout(state, now = Date.now()) {
  if (isDbState(state)) {
    const db = getDbInstance(state);
    try {
      if (typeof db.run === 'function') {
        db.run(
          'DELETE FROM login_lockout WHERE (locked_until IS NOT NULL AND locked_until <= ?) OR (locked_until IS NULL AND first_failure_at <= ?)',
          [now, now - LOCKOUT_MS]
        );
      } else if (typeof db.prepare === 'function') {
        db.prepare(
          'DELETE FROM login_lockout WHERE (locked_until IS NOT NULL AND locked_until <= ?) OR (locked_until IS NULL AND first_failure_at <= ?)'
        ).run(now, now - LOCKOUT_MS);
      }
    } catch (_) {}
    return;
  }

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
  if (!key) return { locked: false, retryAfterMs: 0 };

  if (isDbState(state)) {
    const db = getDbInstance(state);
    let row = null;
    try {
      if (typeof db.getOne === 'function') {
        row = db.getOne('SELECT failures, first_failure_at, locked_until FROM login_lockout WHERE username = ?', [key]);
      } else if (typeof db.prepare === 'function') {
        row = db.prepare('SELECT failures, first_failure_at, locked_until FROM login_lockout WHERE username = ?').get(key);
      }
    } catch (_) {}

    if (!row?.locked_until || row.locked_until <= now) {
      if (row?.locked_until && row.locked_until <= now) {
        try {
          if (typeof db.run === 'function') {
            db.run('DELETE FROM login_lockout WHERE username = ?', [key]);
          } else if (typeof db.prepare === 'function') {
            db.prepare('DELETE FROM login_lockout WHERE username = ?').run(key);
          }
        } catch (_) {}
      }
      return { locked: false, retryAfterMs: 0 };
    }
    return { locked: true, retryAfterMs: row.locked_until - now };
  }

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

  if (isDbState(state)) {
    const db = getDbInstance(state);
    let atual = null;
    try {
      if (typeof db.getOne === 'function') {
        atual = db.getOne('SELECT failures, first_failure_at, locked_until FROM login_lockout WHERE username = ?', [key]);
      } else if (typeof db.prepare === 'function') {
        atual = db.prepare('SELECT failures, first_failure_at, locked_until FROM login_lockout WHERE username = ?').get(key);
      }
    } catch (_) {}

    const firstFailureAt = atual?.first_failure_at && (now - atual.first_failure_at <= LOCKOUT_MS)
      ? atual.first_failure_at
      : now;
    const failures = atual?.locked_until && atual.locked_until > now
      ? atual.failures
      : (firstFailureAt === atual?.first_failure_at ? (atual.failures || 0) + 1 : 1);
    const lockedUntil = failures >= MAX_FALHAS ? now + LOCKOUT_MS : 0;

    try {
      const sql = `
        INSERT INTO login_lockout (username, failures, first_failure_at, locked_until, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          failures = excluded.failures,
          first_failure_at = excluded.first_failure_at,
          locked_until = excluded.locked_until,
          updated_at = excluded.updated_at
      `;
      if (typeof db.run === 'function') {
        db.run(sql, [key, failures, firstFailureAt, lockedUntil, now]);
      } else if (typeof db.prepare === 'function') {
        db.prepare(sql).run(key, failures, firstFailureAt, lockedUntil, now);
      }
    } catch (_) {}

    return verificarLockoutLogin(state, key, now);
  }

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
  const key = normalizarUsername(username);
  if (!key) return;

  if (isDbState(state)) {
    const db = getDbInstance(state);
    try {
      if (typeof db.run === 'function') {
        db.run('DELETE FROM login_lockout WHERE username = ?', [key]);
      } else if (typeof db.prepare === 'function') {
        db.prepare('DELETE FROM login_lockout WHERE username = ?').run(key);
      }
    } catch (_) {}
    return;
  }

  state.delete(key);
}

module.exports = {
  criarEstadoLockout,
  limparEstadoLockout,
  registrarFalhaLogin,
  registrarSucessoLogin,
  verificarLockoutLogin,
  MAX_FALHAS,
  MAX_ENTRIES,
  LOCKOUT_MS,
};
