const PERMISSIONS = [
  "dashboard.ver",
  "dashboard.integridade",
  "atendimento.ver",
  "ordens.ver",
  "ordens.criar",
  "ordens.editar",
  "ordens.alterar_status",
  "ordens.cancelar",
  "ordens.excluir",
  "ordens.restaurar",
  "ordens.excluir_permanente",
  "ordens.imprimir",
  "ordens.whatsapp",
  "oficina.ver",
  "oficina.alterar_status",
  "caixa.ver",
  "caixa.criar_lancamento",
  "caixa.editar_lancamento",
  "caixa.excluir_lancamento",
  "caixa.fechamento",
  "clientes.ver",
  "clientes.criar",
  "clientes.editar",
  "clientes.excluir",
  "clientes.consultar_documentos",
  "produtos.ver",
  "produtos.criar",
  "produtos.editar",
  "produtos.excluir",
  "propostas.ver",
  "propostas.criar",
  "propostas.editar_status",
  "propostas.gerar_os",
  "propostas.imprimir",
  "financeiro.ver",
  "financeiro.contas_pagar.ver",
  "financeiro.contas_pagar.editar",
  "financeiro.contas_pagar.pagar",
  "financeiro.relatorios",
  "nfe.ver",
  "nfe.emitir",
  "nfe.cancelar",
  "nfe.cce",
  "nfe.xml",
  "nfe.danfe",
  "nfe.lixeira",
  "nfe.inutilizar",
  "nfe.integridade",
  "nfe.exportar",
  "nfe.conciliar",
  "relatorios.ver",
  "relatorios.producao",
  "usuarios.ver",
  "usuarios.criar",
  "usuarios.editar",
  "usuarios.arquivar",
  "usuarios.restaurar",
  "usuarios.excluir_permanente",
  "usuarios.resetar_senha",
  "configuracoes.ver",
  "configuracoes.editar_empresa",
  "configuracoes.editar_fiscal",
  "configuracoes.editar_whatsapp",
  "configuracoes.editar_impressao",
  "configuracoes.seguranca",
  "backups.ver",
  "backups.executar",
];

const DEFAULT_PROFILE_PERMISSIONS = {
  admin: [...PERMISSIONS],
  caixa: [
    "dashboard.ver",
    "atendimento.ver",
    "ordens.ver",
    "ordens.criar",
    "ordens.editar",
    "ordens.alterar_status",
    "ordens.cancelar",
    "ordens.imprimir",
    "ordens.whatsapp",
    "caixa.ver",
    "caixa.criar_lancamento",
    "caixa.editar_lancamento",
    "caixa.fechamento",
    "clientes.ver",
    "clientes.criar",
    "clientes.editar",
    "clientes.consultar_documentos",
    "produtos.ver",
    "produtos.criar",
    "produtos.editar",
    "propostas.ver",
    "propostas.criar",
    "propostas.editar_status",
    "propostas.gerar_os",
    "propostas.imprimir",
    "nfe.ver",
    "nfe.emitir",
    "nfe.cancelar",
    "nfe.cce",
    "nfe.xml",
    "nfe.danfe",
    "nfe.exportar",
    "relatorios.ver",
  ],
  oficina: [
    "ordens.ver",
    "ordens.alterar_status",
    "ordens.whatsapp",
    "oficina.ver",
    "oficina.alterar_status",
  ],
};

const DEFAULT_PROFILES = [
  {
    key: "admin",
    name: "Administrador",
    description: "Acesso total ao sistema.",
    base_role: "admin",
    system: 1,
    active: 1,
  },
  {
    key: "caixa",
    name: "Caixa",
    description: "Atendimento, OS, clientes, produtos, propostas, caixa operacional e NF-e operacional.",
    base_role: "caixa",
    system: 1,
    active: 1,
  },
  {
    key: "oficina",
    name: "Oficina",
    description: "Fila da oficina com dados sensiveis redigidos e atualizacao controlada de status.",
    base_role: "oficina",
    system: 1,
    active: 1,
  },
];

const PERMISSION_SET = new Set(PERMISSIONS);

const PERMISSION_GROUPS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "atendimento", label: "Atendimento" },
  { key: "ordens", label: "Ordens de servico" },
  { key: "oficina", label: "Oficina" },
  { key: "caixa", label: "Caixa" },
  { key: "clientes", label: "Clientes" },
  { key: "produtos", label: "Produtos" },
  { key: "propostas", label: "Propostas" },
  { key: "financeiro", label: "Financeiro" },
  { key: "nfe", label: "Notas fiscais" },
  { key: "relatorios", label: "Relatorios" },
  { key: "usuarios", label: "Usuarios" },
  { key: "configuracoes", label: "Configuracoes" },
  { key: "backups", label: "Backups" },
];

function isKnownPermission(permission) {
  return PERMISSION_SET.has(permission);
}

function assertKnownPermissions(permissions) {
  for (const permission of permissions || []) {
    if (!isKnownPermission(permission)) {
      throw new Error(`Permissao desconhecida: ${permission}`);
    }
  }
}

function getDefaultPermissionsForProfile(profileKey) {
  return [...(DEFAULT_PROFILE_PERMISSIONS[profileKey] || [])];
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  return Array.from(new Set(permissions.filter(Boolean)));
}

function sortPermissionsByCatalog(permissions) {
  const normalized = new Set(normalizePermissions(permissions));
  return PERMISSIONS.filter((permission) => normalized.has(permission));
}

function getPermissionCatalog() {
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: PERMISSIONS.filter((permission) => permission.startsWith(`${group.key}.`)),
  })).filter((group) => group.permissions.length > 0);
}

function hasPermission(user, permission) {
  if (!permission) return false;
  const permissions = normalizePermissions(user?.permissions);
  return permissions.includes("*") || permissions.includes(permission);
}

function hasAnyPermission(user, permissions) {
  return normalizePermissions(permissions).some((permission) => hasPermission(user, permission));
}

exports.PERMISSIONS = PERMISSIONS;
exports.DEFAULT_PROFILE_PERMISSIONS = DEFAULT_PROFILE_PERMISSIONS;
exports.DEFAULT_PROFILES = DEFAULT_PROFILES;
exports.PERMISSION_GROUPS = PERMISSION_GROUPS;
exports.isKnownPermission = isKnownPermission;
exports.assertKnownPermissions = assertKnownPermissions;
exports.getDefaultPermissionsForProfile = getDefaultPermissionsForProfile;
exports.normalizePermissions = normalizePermissions;
exports.sortPermissionsByCatalog = sortPermissionsByCatalog;
exports.getPermissionCatalog = getPermissionCatalog;
exports.hasPermission = hasPermission;
exports.hasAnyPermission = hasAnyPermission;
