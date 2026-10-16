import { describe, expect, it } from 'vitest';

const {
  criarEstadoLockout,
  registrarFalhaLogin,
  registrarSucessoLogin,
  verificarLockoutLogin,
} = await import('../domain/loginLockoutRules.js');

describe('loginLockoutRules', () => {
  it('locks a username after five failures for fifteen minutes', () => {
    const state = criarEstadoLockout();
    const base = new Date('2026-05-18T12:00:00Z').getTime();

    for (let i = 0; i < 4; i++) {
      registrarFalhaLogin(state, 'Admin', base + i * 1000);
      expect(verificarLockoutLogin(state, 'admin', base + i * 1000).locked).toBe(false);
    }

    registrarFalhaLogin(state, 'ADMIN', base + 4000);
    expect(verificarLockoutLogin(state, 'admin', base + 5000)).toEqual({
      locked: true,
      retryAfterMs: 14 * 60 * 1000 + 59 * 1000,
    });

    expect(verificarLockoutLogin(state, 'admin', base + 15 * 60 * 1000 + 4001)).toEqual({
      locked: false,
      retryAfterMs: 0,
    });
  });

  it('clears failed attempts after successful login', () => {
    const state = criarEstadoLockout();
    const now = new Date('2026-05-18T12:00:00Z').getTime();

    registrarFalhaLogin(state, 'caixa', now);
    registrarFalhaLogin(state, 'caixa', now + 1000);
    registrarSucessoLogin(state, 'caixa');

    expect(verificarLockoutLogin(state, 'caixa', now + 2000)).toEqual({
      locked: false,
      retryAfterMs: 0,
    });
  });

  it('expires old failures outside the fifteen minute window', () => {
    const state = criarEstadoLockout();
    const base = new Date('2026-05-18T12:00:00Z').getTime();

    for (let i = 0; i < 4; i++) {
      registrarFalhaLogin(state, 'admin', base + i * 1000);
    }

    registrarFalhaLogin(state, 'admin', base + 16 * 60 * 1000);

    expect(verificarLockoutLogin(state, 'admin', base + 16 * 60 * 1000 + 1)).toEqual({
      locked: false,
      retryAfterMs: 0,
    });
  });

  it('bounds stale username entries to avoid unbounded memory growth', () => {
    const state = criarEstadoLockout();
    const base = new Date('2026-05-18T12:00:00Z').getTime();

    for (let i = 0; i < 2500; i += 1) {
      registrarFalhaLogin(state, `usuario-${i}`, base + i);
    }

    expect(state.size).toBeLessThanOrEqual(1000);
  });

  describe('SEC-05: database-backed persistent lockout', () => {
    it('persists lockout across simulated application restarts via SQLite', async () => {
      const Database = (await import('better-sqlite3')).default;
      const memDb = new Database(':memory:');
      memDb.exec(`
        CREATE TABLE IF NOT EXISTS login_lockout (
          username TEXT PRIMARY KEY,
          failures INTEGER NOT NULL DEFAULT 0,
          first_failure_at INTEGER,
          locked_until INTEGER,
          updated_at INTEGER NOT NULL
        )
      `);

      const base = new Date('2026-05-18T12:00:00Z').getTime();

      // Instance 1
      const state1 = criarEstadoLockout(memDb);
      for (let i = 0; i < 5; i++) {
        registrarFalhaLogin(state1, 'admin_alvo', base + i * 1000);
      }

      const lockCheck1 = verificarLockoutLogin(state1, 'admin_alvo', base + 5000);
      expect(lockCheck1.locked).toBe(true);

      // Simulate app restart: create a new state pointing to the same DB
      const state2 = criarEstadoLockout(memDb);
      const lockCheck2 = verificarLockoutLogin(state2, 'admin_alvo', base + 5000);
      expect(lockCheck2.locked).toBe(true);
      expect(lockCheck2.retryAfterMs).toBeGreaterThan(0);

      // Clearing on success
      registrarSucessoLogin(state2, 'admin_alvo');
      expect(verificarLockoutLogin(state2, 'admin_alvo', base + 6000)).toEqual({
        locked: false,
        retryAfterMs: 0,
      });

      memDb.close();
    });
  });
});
