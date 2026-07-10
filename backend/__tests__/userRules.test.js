import { describe, expect, it } from 'vitest';

const {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
  validarSessaoUsuario,
  validarAcaoProprioUsuario,
  validarUltimoAdminDisponivel,
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

  it('rejects sessions when user is inactive or role changed after token issue', () => {
    expect(validarSessaoUsuario(
      { id: 1, role: 'admin' },
      { id: 1, role: 'admin', active: 1 }
    )).toEqual({ ok: true });

    expect(validarSessaoUsuario(
      { id: 1, role: 'admin' },
      { id: 1, role: 'admin', active: 0 }
    )).toEqual({
      ok: false,
      status: 401,
      error: 'Usuario inativo',
    });

    expect(validarSessaoUsuario(
      { id: 1, role: 'admin' },
      { id: 1, role: 'caixa', active: 1 }
    )).toEqual({
      ok: false,
      status: 401,
      error: 'Sessao desatualizada. Entre novamente.',
    });
  });

  it("rejects sessions for archived users, inactive profiles, and stale access versions", () => {
    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 2 },
      { id: 1, role: "admin", active: 1, deletedat: null, profile_active: 1, access_version: 2 }
    )).toEqual({ ok: true });

    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 2 },
      { id: 1, role: "admin", active: 1, deletedat: "2026-07-09 10:00:00", profile_active: 1, access_version: 2 }
    )).toEqual({
      ok: false,
      status: 401,
      error: "Usuario arquivado",
    });

    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 2 },
      { id: 1, role: "admin", active: 1, deletedat: null, profile_active: 0, access_version: 2 }
    )).toEqual({
      ok: false,
      status: 401,
      error: "Perfil inativo",
    });

    expect(validarSessaoUsuario(
      { id: 1, accessVersion: 1 },
      { id: 1, role: "admin", active: 1, deletedat: null, profile_active: 1, access_version: 2 }
    )).toEqual({
      ok: false,
      status: 401,
      error: "Sessao desatualizada. Entre novamente.",
    });
  });
});

describe("regras de gestao de usuarios", () => {
  it("bloqueia arquivamento, restauracao, reset e exclusao permanente do proprio usuario", () => {
    expect(validarAcaoProprioUsuario({
      requesterId: 1,
      targetId: 1,
      action: "archive",
    })).toEqual({ ok: false, error: "Voce nao pode arquivar seu proprio usuario" });

    expect(validarAcaoProprioUsuario({
      requesterId: 1,
      targetId: 2,
      action: "archive",
    })).toEqual({ ok: true });
  });

  it("bloqueia remover o ultimo admin ativo nao arquivado", () => {
    expect(validarUltimoAdminDisponivel({
      targetRole: "admin",
      targetActive: 1,
      targetDeletedat: null,
      activeAdminCount: 1,
      action: "archive",
    })).toEqual({
      ok: false,
      error: "Nao e possivel remover o ultimo administrador ativo",
    });

    expect(validarUltimoAdminDisponivel({
      targetRole: "caixa",
      targetActive: 1,
      targetDeletedat: null,
      activeAdminCount: 1,
      action: "archive",
    })).toEqual({ ok: true });
  });
});
