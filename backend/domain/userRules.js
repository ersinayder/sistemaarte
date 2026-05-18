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

module.exports = {
  validarSenhaUsuario,
  validarAlteracaoProprioUsuario,
};
