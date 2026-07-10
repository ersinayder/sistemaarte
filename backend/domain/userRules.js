function validarSenhaUsuario(password, { required = false } = {}) {
  const value = String(password ?? "");

  if (!value) {
    return required
      ? { ok: false, error: "Senha e obrigatoria" }
      : { ok: true };
  }

  if (value.length < 8) {
    return { ok: false, error: "Senha deve ter pelo menos 8 caracteres" };
  }

  return { ok: true };
}

function validarAlteracaoProprioUsuario({
  requesterId,
  targetId,
  currentRole,
  nextRole,
  nextActive,
}) {
  if (Number(requesterId) !== Number(targetId)) return { ok: true };

  if (currentRole !== nextRole) {
    return { ok: false, error: "Voce nao pode alterar seu proprio perfil" };
  }

  if (Number(nextActive) !== 1) {
    return { ok: false, error: "Voce nao pode desativar seu proprio usuario" };
  }

  return { ok: true };
}

const SELF_ACTION_ERRORS = {
  archive: "Voce nao pode arquivar seu proprio usuario",
  restore: "Voce nao pode restaurar seu proprio usuario",
  reset_password: "Voce nao pode resetar sua propria senha por esta tela",
  delete_permanent: "Voce nao pode excluir permanentemente seu proprio usuario",
};

function validarAcaoProprioUsuario({ requesterId, targetId, action }) {
  if (Number(requesterId) !== Number(targetId)) return { ok: true };
  return { ok: false, error: SELF_ACTION_ERRORS[action] || "Acao nao permitida para o proprio usuario" };
}

function isAdminDisponivel(user) {
  return user?.role === "admin" && Number(user.active) === 1 && !user.deletedat;
}

function validarUltimoAdminDisponivel({
  targetRole,
  targetActive,
  targetDeletedat,
  activeAdminCount,
  action,
}) {
  const targetIsAvailableAdmin = targetRole === "admin" && Number(targetActive) === 1 && !targetDeletedat;
  const actionRemovesAvailability = ["archive", "deactivate", "delete_permanent", "change_role"].includes(action);

  if (targetIsAvailableAdmin && actionRemovesAvailability && Number(activeAdminCount) <= 1) {
    return { ok: false, error: "Nao e possivel remover o ultimo administrador ativo" };
  }

  return { ok: true };
}

function validarSessaoUsuario(payload, usuarioAtual) {
  if (!usuarioAtual) {
    return { ok: false, status: 401, error: "Usuario nao encontrado" };
  }

  if (Number(usuarioAtual.active) !== 1) {
    return { ok: false, status: 401, error: "Usuario inativo" };
  }

  if (usuarioAtual.deletedat) {
    return { ok: false, status: 401, error: "Usuario arquivado" };
  }

  if (usuarioAtual.profile_active != null && Number(usuarioAtual.profile_active) !== 1) {
    return { ok: false, status: 401, error: "Perfil inativo" };
  }

  if (payload?.accessVersion != null && usuarioAtual.access_version != null
    && Number(payload.accessVersion) !== Number(usuarioAtual.access_version)) {
    return { ok: false, status: 401, error: "Sessao desatualizada. Entre novamente." };
  }

  if (payload?.role && usuarioAtual.role !== payload.role) {
    return { ok: false, status: 401, error: "Sessao desatualizada. Entre novamente." };
  }

  return { ok: true };
}

module.exports = {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
  validarAcaoProprioUsuario,
  validarUltimoAdminDisponivel,
  isAdminDisponivel,
  validarSessaoUsuario,
};
