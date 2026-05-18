import { describe, expect, it } from 'vitest';

const {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
} = await import('../domain/userRules.js');

describe('userRules', () => {
  it('requires at least eight characters for new passwords', () => {
    expect(validarSenhaUsuario('', { required: true })).toEqual({
      ok: false,
      error: 'Senha e obrigatoria',
    });

    expect(validarSenhaUsuario('1234567', { required: true })).toEqual({
      ok: false,
      error: 'Senha deve ter pelo menos 8 caracteres',
    });

    expect(validarSenhaUsuario('12345678', { required: true })).toEqual({ ok: true });
  });

  it('allows blank password on edit but validates provided password', () => {
    expect(validarSenhaUsuario('', { required: false })).toEqual({ ok: true });
    expect(validarSenhaUsuario('curta', { required: false }).ok).toBe(false);
  });

  it('blocks admin from changing own role or disabling own user', () => {
    const roleChange = validarAlteracaoProprioUsuario({
      requesterId: 10,
      targetId: 10,
      currentRole: 'admin',
      nextRole: 'caixa',
      nextActive: 1,
    });

    expect(roleChange).toEqual({
      ok: false,
      error: 'Voce nao pode alterar seu proprio perfil',
    });

    const deactivate = validarAlteracaoProprioUsuario({
      requesterId: 10,
      targetId: 10,
      currentRole: 'admin',
      nextRole: 'admin',
      nextActive: 0,
    });

    expect(deactivate).toEqual({
      ok: false,
      error: 'Voce nao pode desativar seu proprio usuario',
    });
  });

  it('allows admin to edit another user', () => {
    expect(validarAlteracaoProprioUsuario({
      requesterId: 10,
      targetId: 11,
      currentRole: 'admin',
      nextRole: 'caixa',
      nextActive: 0,
    })).toEqual({ ok: true });
  });
});
