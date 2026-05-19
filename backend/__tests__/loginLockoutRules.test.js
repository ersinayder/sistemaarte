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
});
