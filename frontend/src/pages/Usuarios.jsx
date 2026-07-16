import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const ROLES = ['admin', 'caixa', 'oficina']
const ROLE_LABEL = { admin: 'Admin', caixa: 'Caixa', oficina: 'Oficina' }
const ROLE_BADGE = { admin: 'badge-primary', caixa: 'badge-success', oficina: 'badge-warning' }
const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
]
const ROLE_SUMMARY = {
  admin: 'Acesso administrativo completo conforme permissoes efetivas do perfil Admin.',
  caixa: 'Atendimento, clientes, ordens, caixa, propostas, produtos e rotinas operacionais do balcao.',
  oficina: 'Fila da oficina e atualizacao de status das ordens, com dados sensiveis limitados.',
}
const PERMISSION_ACTION_LABEL = {
  ver: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  alterar_status: 'Alterar status',
  cancelar: 'Cancelar',
  excluir: 'Excluir',
  restaurar: 'Restaurar',
  excluir_permanente: 'Excluir permanente',
  imprimir: 'Imprimir',
  whatsapp: 'WhatsApp',
  fechamento: 'Fechamento',
  consultar_documentos: 'Consultar documentos',
  editar_status: 'Editar status',
  gerar_os: 'Gerar OS',
  emitir: 'Emitir',
  cce: 'CC-e',
  xml: 'XML',
  danfe: 'DANFE',
  lixeira: 'Lixeira',
  inutilizar: 'Inutilizar',
  integridade: 'Integridade',
  exportar: 'Exportar',
  conciliar: 'Conciliar',
  producao: 'Producao',
  resetar_senha: 'Resetar senha',
  editar_empresa: 'Editar empresa',
  editar_fiscal: 'Editar fiscal',
  editar_whatsapp: 'Editar WhatsApp',
  editar_impressao: 'Editar impressao',
  seguranca: 'Seguranca',
  executar: 'Executar',
  relatorios: 'Relatorios',
  contas_pagar: 'Contas a pagar',
  criar_lancamento: 'Criar lancamento',
  editar_lancamento: 'Editar lancamento',
  excluir_lancamento: 'Excluir lancamento',
}

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body)
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || fallback
}

function isArchived(user) {
  return Boolean(
    user?.deletedat ||
    user?.deletedAt ||
    user?.deleted_at ||
    user?.archivedat ||
    user?.archivedAt ||
    user?.archived_at ||
    user?.status === 'archived'
  )
}

function isActive(user) {
  return Number(user?.active ?? user?.ativo ?? 1) !== 0 && !isArchived(user)
}

function userStatus(user) {
  if (isArchived(user)) return { label: 'Arquivado', badge: 'badge-secondary' }
  if (isActive(user)) return { label: 'Ativo', badge: 'badge-success' }
  return { label: 'Inativo', badge: 'badge-warning' }
}

function archiveReason(user) {
  return user?.archivedreason || user?.archiveReason || user?.archived_reason || user?.deletedreason || ''
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('pt-BR')
}

function permissionTitle(permission) {
  const parts = String(permission || '').split('.')
  const action = parts.slice(1).join('.')
  return PERMISSION_ACTION_LABEL[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function sortedPermissions(permissions) {
  return [...new Set(Array.isArray(permissions) ? permissions : [])].sort()
}

function samePermissions(a, b) {
  return JSON.stringify(sortedPermissions(a)) === JSON.stringify(sortedPermissions(b))
}

function profileBaseRole(profile) {
  return profile?.base_role || profile?.key
}

function defaultProfiles() {
  return ROLES.map(role => ({
    key: role,
    name: ROLE_LABEL[role],
    base_role: role,
    active: true,
    permissions: [],
  }))
}

function profilesForRole(profiles, role, currentProfileKey = '', currentProfileName = '') {
  const source = profiles?.length ? profiles : defaultProfiles()
  const withCurrent = source.some(profile => profile.key === currentProfileKey) || !currentProfileKey
    ? source
    : [
        ...source,
        {
          key: currentProfileKey,
          name: currentProfileName || currentProfileKey,
          base_role: role,
          active: true,
          permissions: [],
        },
      ]
  return withCurrent.filter(profile => (
    profileBaseRole(profile) === role
    && (profile.active || profile.key === currentProfileKey)
  ))
}

function ModalShell({ title, onClose, children, footer, maxWidth = 520 }) {
  const titleId = useId()

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <Portal>
      <div className="modal-overlay" onClick={event => event.target === event.currentTarget && onClose()}>
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{ maxWidth }}
          onClick={event => event.stopPropagation()}
        >
          <div className="modal-header">
            <h2 className="modal-title" id={titleId}>{title}</h2>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose} aria-label="Fechar">
              X
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </Portal>
  )
}

function UserFormModal({ editUser, profiles, profilesLoading, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: editUser?.name || '',
    username: editUser?.username || '',
    password: '',
    role: editUser?.role || 'caixa',
    profile_key: editUser?.profile_key || editUser?.role || 'caixa',
    active: Number(editUser?.active ?? 1) !== 0,
  })
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(editUser)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const compatibleProfiles = useMemo(
    () => profilesForRole(profiles, form.role, form.profile_key, editUser?.profile_name),
    [editUser?.profile_name, form.profile_key, form.role, profiles]
  )
  const selectedProfile = compatibleProfiles.find(profile => profile.key === form.profile_key) || compatibleProfiles[0] || null

  useEffect(() => {
    if (profilesLoading) return
    if (!compatibleProfiles.length) return
    if (!compatibleProfiles.some(profile => profile.key === form.profile_key)) {
      set('profile_key', compatibleProfiles[0].key)
    }
  }, [compatibleProfiles, form.profile_key, profilesLoading])

  const changeRole = (nextRole) => {
    const nextProfiles = profilesForRole(profiles, nextRole)
    setForm(current => ({
      ...current,
      role: nextRole,
      profile_key: nextProfiles[0]?.key || nextRole,
    }))
  }

  const save = async () => {
    if (!form.name.trim() || !form.username.trim()) {
      toast.error('Nome e login sao obrigatorios')
      return
    }
    if (!isEdit && !form.password.trim()) {
      toast.error('Senha obrigatoria')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        username: form.username.trim(),
        role: form.role,
        profile_key: form.profile_key || form.role,
        active: form.active ? 1 : 0,
      }
      if (!isEdit) payload.password = form.password
      if (isEdit) {
        await api.put(`/users/${editUser.id}`, payload)
        toast.success('Usuario atualizado')
      } else {
        await api.post('/users', payload)
        toast.success('Usuario criado')
      }
      onSaved()
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao salvar usuario'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Editar usuario' : 'Novo usuario'}
      onClose={onClose}
      maxWidth={620}
      footer={(
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? 'Salvar alteracoes' : 'Criar usuario'}
          </button>
        </>
      )}
    >
      <div className="form-grid-2">
        <div className="form-group col-span-2">
          <label className="form-label" htmlFor="usuario-name">Nome completo</label>
          <input
            id="usuario-name"
            className="form-input"
            value={form.name}
            onChange={event => set('name', event.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="usuario-username">Login</label>
          <input
            id="usuario-username"
            className="form-input"
            value={form.username}
            onChange={event => set('username', event.target.value.toLowerCase().replace(/\s/g, ''))}
          />
        </div>
        {!isEdit && (
          <div className="form-group">
            <label className="form-label" htmlFor="usuario-password">Senha</label>
            <input
              id="usuario-password"
              className="form-input"
              type="password"
              value={form.password}
              onChange={event => set('password', event.target.value)}
            />
          </div>
        )}
        <div className="form-group">
          <label className="form-label" htmlFor="usuario-role">Tipo estrutural</label>
          <select
            id="usuario-role"
            className="form-input"
            value={form.role}
            onChange={event => changeRole(event.target.value)}
          >
            {ROLES.map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="usuario-profile-key">Perfil de permissoes</label>
          <select
            id="usuario-profile-key"
            className="form-input"
            value={selectedProfile?.key || form.profile_key}
            onChange={event => set('profile_key', event.target.value)}
            disabled={profilesLoading}
          >
            {compatibleProfiles.map(profile => (
              <option key={profile.key} value={profile.key}>{profile.name || profile.key}</option>
            ))}
          </select>
        </div>
        {isEdit && (
          <div className="form-group">
            <label className="form-label" htmlFor="usuario-active">Status</label>
            <select
              id="usuario-active"
              className="form-input"
              value={form.active ? '1' : '0'}
              onChange={event => set('active', event.target.value === '1')}
            >
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </div>
        )}
      </div>
      <div
        style={{
          marginTop: 'var(--space-4)',
          padding: 'var(--space-3)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface-offset)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
        }}
      >
        <strong style={{ color: 'var(--color-text)' }}>Permissoes efetivas</strong>
        <div style={{ marginTop: 4 }}>{selectedProfile?.description || ROLE_SUMMARY[form.role]}</div>
        <div style={{ marginTop: 4 }}>
          Tipo: {ROLE_LABEL[form.role]}. Perfil: {selectedProfile?.name || form.profile_key || ROLE_LABEL[form.role]}.
        </div>
      </div>
    </ModalShell>
  )
}

function NewProfileModal({ profiles, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    key: '',
    description: '',
    base_role: 'caixa',
    source_profile_key: '',
  })
  const [saving, setSaving] = useState(false)
  const compatibleSources = useMemo(
    () => profilesForRole(profiles, form.base_role),
    [form.base_role, profiles]
  )
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  useEffect(() => {
    if (!compatibleSources.length) return
    if (!compatibleSources.some(profile => profile.key === form.source_profile_key)) {
      set('source_profile_key', compatibleSources[0].key)
    }
  }, [compatibleSources, form.source_profile_key])

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Nome do perfil e obrigatorio')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        key: form.key.trim(),
        description: form.description.trim(),
        base_role: form.base_role,
        source_profile_key: form.source_profile_key || form.base_role,
      }
      const response = await api.post('/permission-profiles', payload)
      toast.success('Perfil criado')
      await onCreated(response?.data?.profile?.key || payload.key || response?.data?.profile?.key)
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao criar perfil'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Novo perfil"
      onClose={onClose}
      maxWidth={620}
      footer={(
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Criando...' : 'Criar perfil'}
          </button>
        </>
      )}
    >
      <div className="form-grid-2">
        <div className="form-group">
          <label className="form-label" htmlFor="novo-perfil-name">Nome do perfil</label>
          <input
            id="novo-perfil-name"
            className="form-input"
            value={form.name}
            onChange={event => set('name', event.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="novo-perfil-key">Chave tecnica</label>
          <input
            id="novo-perfil-key"
            className="form-input"
            value={form.key}
            onChange={event => set('key', event.target.value.toLowerCase().replace(/\s+/g, '_'))}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="novo-perfil-base-role">Tipo estrutural</label>
          <select
            id="novo-perfil-base-role"
            className="form-input"
            value={form.base_role}
            onChange={event => setForm(current => ({ ...current, base_role: event.target.value, source_profile_key: '' }))}
          >
            {ROLES.map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="novo-perfil-source">Copiar permissoes de</label>
          <select
            id="novo-perfil-source"
            className="form-input"
            value={form.source_profile_key || compatibleSources[0]?.key || ''}
            onChange={event => set('source_profile_key', event.target.value)}
          >
            {compatibleSources.map(profile => (
              <option key={profile.key} value={profile.key}>{profile.name || profile.key}</option>
            ))}
          </select>
        </div>
        <div className="form-group col-span-2">
          <label className="form-label" htmlFor="novo-perfil-description">Descricao</label>
          <textarea
            id="novo-perfil-description"
            className="form-input"
            rows={2}
            value={form.description}
            onChange={event => set('description', event.target.value)}
          />
        </div>
      </div>
    </ModalShell>
  )
}

function PasswordModal({ user, onClose, onSaved }) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!password.trim()) {
      toast.error('Informe a nova senha')
      return
    }
    setSaving(true)
    try {
      await api.post(`/users/${user.id}/reset-password`, { password })
      toast.success('Senha redefinida')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao redefinir senha'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Redefinir senha"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Redefinir senha'}
          </button>
        </>
      )}
    >
      <p style={{ marginTop: 0 }}>Usuario: <strong>{user.name}</strong></p>
      <div className="form-group">
        <label className="form-label" htmlFor="reset-password">Nova senha</label>
        <input
          id="reset-password"
          className="form-input"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          autoFocus
        />
      </div>
    </ModalShell>
  )
}

function ArchiveModal({ user, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const archive = async () => {
    if (!reason.trim()) {
      toast.error('Informe o motivo')
      return
    }
    setSaving(true)
    try {
      await api.post(`/users/${user.id}/archive`, { reason: reason.trim() })
      toast.success('Usuario arquivado')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao arquivar usuario'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Arquivar usuario"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-danger" type="button" onClick={archive} disabled={saving}>
            {saving ? 'Arquivando...' : 'Arquivar'}
          </button>
        </>
      )}
    >
      <p style={{ marginTop: 0 }}>Arquivar <strong>{user.name}</strong> remove o acesso sem apagar historico.</p>
      <div className="form-group">
        <label className="form-label" htmlFor="archive-reason">Motivo</label>
        <textarea
          id="archive-reason"
          className="form-input"
          rows={3}
          value={reason}
          onChange={event => setReason(event.target.value)}
          autoFocus
        />
      </div>
    </ModalShell>
  )
}

function RestoreModal({ user, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)

  const restore = async () => {
    setSaving(true)
    try {
      await api.post(`/users/${user.id}/restore`)
      toast.success('Usuario restaurado')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao restaurar usuario'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="Restaurar usuario"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="button" onClick={restore} disabled={saving}>
            {saving ? 'Restaurando...' : 'Restaurar'}
          </button>
        </>
      )}
    >
      <p style={{ margin: 0 }}>Restaurar acesso de <strong>{user.name}</strong>?</p>
    </ModalShell>
  )
}

function DeleteCheckModal({ check, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)
  const blockers = Array.isArray(check?.result?.blockers) ? check.result.blockers : []
  const allowed = Boolean(check?.result?.allowed)

  const permanentDelete = async () => {
    setDeleting(true)
    try {
      await api.delete(`/users/${check.user.id}`)
      toast.success('Usuario excluido')
      onDeleted()
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao excluir usuario'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ModalShell
      title="Exclusao permanente"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Fechar</button>
          {allowed && (
            <button className="btn btn-danger" type="button" onClick={permanentDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir permanentemente'}
            </button>
          )}
        </>
      )}
    >
      <p style={{ marginTop: 0 }}>Usuario: <strong>{check.user.name}</strong></p>
      {allowed ? (
        <p>Sem bloqueios encontrados. A exclusao permanente remove o cadastro do usuario.</p>
      ) : (
        <>
          <p>Este usuario ainda nao pode ser excluido permanentemente.</p>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
            {blockers.map((blocker, index) => (
              <li key={`${blocker}-${index}`}>{typeof blocker === 'string' ? blocker : blocker?.message || blocker?.label || 'Bloqueio encontrado'}</li>
            ))}
          </ul>
        </>
      )}
    </ModalShell>
  )
}

function StatusBadge({ user }) {
  const status = userStatus(user)
  return <span className={`badge ${status.badge}`}>{status.label}</span>
}

function RoleBadge({ role, label }) {
  return <span className={`badge ${ROLE_BADGE[role] || 'badge-secondary'}`}>{label || ROLE_LABEL[role] || role || '-'}</span>
}

function UserProfileCell({ user }) {
  return (
    <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
      <RoleBadge role={user.role} label={user.profile_name} />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        Tipo: {ROLE_LABEL[user.role] || user.role || '-'}
      </span>
    </div>
  )
}

function PerfilEditor({ data, loading, canEdit, currentProfileKey, onReload }) {
  const profiles = data?.profiles || []
  const permissionGroups = data?.permissionGroups || []
  const [selectedKey, setSelectedKey] = useState('')
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  const selected = useMemo(
    () => profiles.find(profile => profile.key === selectedKey) || profiles[0] || null,
    [profiles, selectedKey]
  )

  useEffect(() => {
    if (!selectedKey && profiles[0]?.key) setSelectedKey(profiles[0].key)
  }, [profiles, selectedKey])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      return
    }
    setDraft({
      name: selected.name || '',
      description: selected.description || '',
      active: Boolean(selected.active),
      permissions: selected.permissions || [],
    })
  }, [selected])

  const selectedPermissions = selected?.permissions || []
  const draftPermissions = draft?.permissions || []
  const isAdminProfile = selected?.key === 'admin'
  const isCurrentProfile = selected?.key && selected.key === currentProfileKey
  const dirty = Boolean(selected && draft) && (
    draft.name !== (selected.name || '') ||
    draft.description !== (selected.description || '') ||
    Boolean(draft.active) !== Boolean(selected.active) ||
    !samePermissions(draftPermissions, selectedPermissions)
  )
  const editable = canEdit && selected && !isAdminProfile

  const setDraftValue = (key, value) => setDraft(current => ({ ...(current || {}), [key]: value }))
  const hasPermission = (permission) => draftPermissions.includes(permission)
  const togglePermission = (permission) => {
    if (!editable) return
    setDraft(current => {
      const set = new Set(current?.permissions || [])
      if (set.has(permission)) set.delete(permission)
      else set.add(permission)
      return { ...(current || {}), permissions: [...set] }
    })
  }

  const setGroup = (group, checked) => {
    if (!editable) return
    setDraft(current => {
      const set = new Set(current?.permissions || [])
      for (const permission of group.permissions || []) {
        if (checked) set.add(permission)
        else set.delete(permission)
      }
      return { ...(current || {}), permissions: [...set] }
    })
  }

  const save = async () => {
    if (!selected || !draft || !editable) return
    if (!draft.name.trim()) {
      toast.error('Nome do perfil e obrigatorio')
      return
    }
    setSaving(true)
    try {
      await api.put(`/permission-profiles/${selected.key}`, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        active: draft.active,
        permissions: sortedPermissions(draft.permissions),
      })
      toast.success(isCurrentProfile ? 'Perfil salvo. A sessao deste perfil sera renovada no proximo acesso.' : 'Perfil salvo')
      await onReload()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao salvar perfil'))
    } finally {
      setSaving(false)
    }
  }

  const restoreDefaults = async () => {
    if (!selected || !canEdit) return
    const confirmed = window.confirm(`Restaurar o perfil ${selected.name} para as permissoes padrao?`)
    if (!confirmed) return
    setSaving(true)
    try {
      await api.post(`/permission-profiles/${selected.key}/restore-defaults`)
      toast.success('Perfil restaurado para o padrao')
      await onReload()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao restaurar perfil'))
    } finally {
      setSaving(false)
    }
  }

  const profileCreated = async (createdKey) => {
    await onReload()
    if (createdKey) setSelectedKey(createdKey)
  }

  if (loading) {
    return (
      <div className="loading-center" style={{ minHeight: 280 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!profiles.length) {
    return (
      <div className="empty-state">
        <h3>Nenhum perfil encontrado</h3>
        <p>Os perfis padrao serao criados pela migracao do banco.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-4)', height: '100%', minHeight: 0, overflow: 'auto', alignContent: 'start' }}>
      <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 800 }}>Perfis</h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {profiles.length} perfil{profiles.length === 1 ? '' : 's'} configurado{profiles.length === 1 ? '' : 's'}
            </p>
          </div>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => setCreating(true)}>
              Novo perfil
            </button>
          )}
        </div>
        <div style={{ overflowY: 'auto', padding: 'var(--space-2)' }}>
          {profiles.map(profile => (
            <button
              key={profile.key}
              className={`btn ${profile.key === selected?.key ? 'btn-secondary' : 'btn-ghost'}`}
              type="button"
              aria-label={`Selecionar perfil ${profile.name || profile.key}`}
              onClick={() => setSelectedKey(profile.key)}
              style={{ width: '100%', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</span>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span className="badge badge-secondary">{ROLE_LABEL[profileBaseRole(profile)] || profileBaseRole(profile)}</span>
                <span className="badge badge-secondary">{profile.permissions?.length || 0}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800 }}>{selected?.name}</h2>
              {selected?.system && <span className="badge badge-secondary">Sistema</span>}
              {!selected?.system && <span className="badge badge-secondary">Customizado</span>}
              <span className="badge badge-secondary">Tipo: {ROLE_LABEL[profileBaseRole(selected)] || profileBaseRole(selected)}</span>
              {isAdminProfile && <span className="badge badge-primary">Protegido</span>}
              {!selected?.active && <span className="badge badge-warning">Inativo</span>}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {selected?.active_user_count || 0} usuario{Number(selected?.active_user_count || 0) === 1 ? '' : 's'} ativo{Number(selected?.active_user_count || 0) === 1 ? '' : 's'} usando este perfil
            </p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {selected?.default_permissions?.length > 0 && canEdit && (
              <button className="btn btn-ghost" type="button" onClick={restoreDefaults} disabled={saving}>
                Restaurar padrao
              </button>
            )}
            {editable && (
              <button className="btn btn-primary" type="button" onClick={save} disabled={!dirty || saving}>
                {saving ? 'Salvando...' : 'Salvar perfil'}
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 'var(--space-4)' }}>
          <div className="form-grid-2" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="perfil-name">Nome do perfil</label>
              <input
                id="perfil-name"
                className="form-input"
                value={draft?.name || ''}
                onChange={event => setDraftValue('name', event.target.value)}
                disabled={!editable}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="perfil-active">Status</label>
              <select
                id="perfil-active"
                className="form-input"
                value={draft?.active ? '1' : '0'}
                onChange={event => setDraftValue('active', event.target.value === '1')}
                disabled={!editable || selected?.system}
              >
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </div>
            <div className="form-group col-span-2">
              <label className="form-label" htmlFor="perfil-description">Descricao operacional</label>
              <textarea
                id="perfil-description"
                className="form-input"
                rows={2}
                value={draft?.description || ''}
                onChange={event => setDraftValue('description', event.target.value)}
                disabled={!editable}
              />
            </div>
          </div>

          {isAdminProfile && (
            <div className="badge badge-primary" style={{ marginBottom: 'var(--space-3)' }}>
              O perfil Administrador mantem acesso total por seguranca.
            </div>
          )}

          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {permissionGroups.map(group => {
              const groupPermissions = group.permissions || []
              const checkedCount = groupPermissions.filter(permission => hasPermission(permission)).length
              const allChecked = checkedCount === groupPermissions.length && groupPermissions.length > 0
              return (
                <section key={group.key} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface-offset)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 800 }}>{group.label}</h3>
                      <p style={{ margin: '2px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {checkedCount} de {groupPermissions.length} permissoes
                      </p>
                    </div>
                    {editable && (
                      <button className="btn btn-ghost btn-xs" type="button" onClick={() => setGroup(group, !allChecked)}>
                        {allChecked ? 'Limpar grupo' : 'Marcar grupo'}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--space-2)', padding: 'var(--space-3)' }}>
                    {groupPermissions.map(permission => (
                      <label
                        key={permission}
                        style={{
                          display: 'flex',
                          gap: 'var(--space-2)',
                          alignItems: 'flex-start',
                          padding: 'var(--space-2)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          background: hasPermission(permission) ? 'var(--color-surface-offset)' : 'var(--color-surface)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={hasPermission(permission)}
                          onChange={() => togglePermission(permission)}
                          disabled={!editable}
                          style={{ marginTop: 2 }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700 }}>{permissionTitle(permission)}</span>
                          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{permission}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </div>

      {creating && (
        <NewProfileModal
          profiles={profiles}
          onClose={() => setCreating(false)}
          onCreated={profileCreated}
        />
      )}
    </div>
  )
}

export default function Usuarios() {
  const auth = useAuth() || {}
  const { user, can } = auth
  const [users, setUsers] = useState([])
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [role, setRole] = useState('')
  const [formModal, setFormModal] = useState(null)
  const [passwordUser, setPasswordUser] = useState(null)
  const [archiveUser, setArchiveUser] = useState(null)
  const [restoreUser, setRestoreUser] = useState(null)
  const [deleteCheck, setDeleteCheck] = useState(null)
  const [checkingDeleteId, setCheckingDeleteId] = useState(null)
  const [activeTab, setActiveTab] = useState('usuarios')
  const [profilesData, setProfilesData] = useState({ profiles: [], permissionGroups: [], permissions: [] })
  const [profilesLoading, setProfilesLoading] = useState(false)

  const hasPermission = useCallback((permission) => (
    typeof can === 'function' ? Boolean(can(permission)) : false
  ), [can])

  useEffect(() => { document.title = 'Usuarios - Arte & Molduras' }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/users', {
        params: {
          status,
          role: role || undefined,
          q: search.trim() || undefined,
        },
      })
      const data = r.data
      if (Array.isArray(data)) {
        setUsers(data)
        setMeta({ total: data.length })
      } else {
        setUsers(data?.users || [])
        setMeta(data?.meta || {})
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao carregar usuarios'))
    } finally {
      setLoading(false)
    }
  }, [role, search, status])

  useEffect(() => { load() }, [load])

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true)
    try {
      const r = await api.get('/permission-profiles')
      setProfilesData(r.data || { profiles: [], permissionGroups: [], permissions: [] })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao carregar perfis'))
    } finally {
      setProfilesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'perfis') loadProfiles()
  }, [activeTab, loadProfiles])

  useEffect(() => {
    if (formModal && !profilesData.profiles.length) loadProfiles()
  }, [formModal, loadProfiles, profilesData.profiles.length])

  const checkPermanentDelete = async (targetUser) => {
    setCheckingDeleteId(targetUser.id)
    try {
      const r = await api.get(`/users/${targetUser.id}/delete-check`)
      setDeleteCheck({ user: targetUser, result: r.data || {} })
    } catch (error) {
      toast.error(getErrorMessage(error, 'Erro ao verificar exclusao'))
    } finally {
      setCheckingDeleteId(null)
    }
  }

  const sortedUsers = useMemo(() => [...users].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')), [users])
  const total = meta.total ?? users.length

  const canCreate = hasPermission('usuarios.criar')
  const canEdit = hasPermission('usuarios.editar')
  const canManageProfiles = hasPermission('configuracoes.seguranca')
  const canArchive = hasPermission('usuarios.arquivar')
  const canRestore = hasPermission('usuarios.restaurar')
  const canDeletePermanent = hasPermission('usuarios.excluir_permanente')
  const canResetPassword = hasPermission('usuarios.resetar_senha')

  const renderActions = (targetUser, compact = false) => {
    const self = user?.id != null && Number(targetUser.id) === Number(user.id)
    const archived = isArchived(targetUser)
    const label = targetUser.name || targetUser.username
    const btnClass = compact ? 'btn btn-ghost btn-sm' : 'btn btn-ghost btn-xs'
    const dangerClass = `${btnClass} inline-danger`

    return (
      <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: compact ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
        {canEdit && (
          <button
            className={btnClass}
            type="button"
            onClick={() => setFormModal(targetUser)}
            aria-label={compact ? undefined : `Editar ${label}`}
          >
            Editar
          </button>
        )}
        {canResetPassword && !archived && !self && (
          <button
            className={btnClass}
            type="button"
            onClick={() => setPasswordUser(targetUser)}
            aria-label={compact ? undefined : `Redefinir senha de ${label}`}
          >
            Redefinir senha
          </button>
        )}
        {!archived && !self && canArchive && (
          <button
            className={dangerClass}
            type="button"
            onClick={() => setArchiveUser(targetUser)}
            aria-label={compact ? undefined : `Arquivar ${label}`}
          >
            Arquivar
          </button>
        )}
        {archived && !self && canRestore && (
          <button
            className={btnClass}
            type="button"
            onClick={() => setRestoreUser(targetUser)}
            aria-label={compact ? undefined : `Restaurar ${label}`}
          >
            Restaurar
          </button>
        )}
        {!self && canDeletePermanent && (
          <button
            className={dangerClass}
            type="button"
            onClick={() => checkPermanentDelete(targetUser)}
            disabled={checkingDeleteId === targetUser.id}
            aria-label={compact ? undefined : `Verificar exclusao permanente de ${label}`}
          >
            {checkingDeleteId === targetUser.id ? 'Verificando...' : 'Verificar exclusao permanente'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="erp-page" style={{ height: 'calc(100vh - 60px - var(--space-12))', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="erp-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0, flexShrink: 0 }}>
        <div>
          <h1 className="erp-page-title" style={{ fontSize: 'var(--text-xl)', fontWeight: 800, margin: 0 }}>Usuarios</h1>
          <p className="erp-page-subtitle" style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {total} usuario{total === 1 ? '' : 's'} encontrado{total === 1 ? '' : 's'}
          </p>
        </div>
        <div className="erp-page-actions">
          {activeTab === 'usuarios' && canCreate && (
            <button className="btn btn-primary" type="button" onClick={() => setFormModal({})}>
              Novo usuario
            </button>
          )}
        </div>
      </div>

      <div className="erp-filter-bar" style={{ marginBottom: 0, flexShrink: 0 }}>
        <button
          className={`btn ${activeTab === 'usuarios' ? 'btn-secondary' : 'btn-ghost'}`}
          type="button"
          onClick={() => setActiveTab('usuarios')}
        >
          Usuarios
        </button>
        <button
          className={`btn ${activeTab === 'perfis' ? 'btn-secondary' : 'btn-ghost'}`}
          type="button"
          onClick={() => setActiveTab('perfis')}
        >
          Perfis
        </button>
      </div>

      {activeTab === 'usuarios' && (
      <div className="erp-filter-bar" style={{ marginBottom: 0, flexShrink: 0 }}>
        <input
          className="form-input"
          placeholder="Buscar por nome ou login"
          value={search}
          onChange={event => setSearch(event.target.value)}
          style={{ flex: '1 1 260px' }}
        />
        <div className="form-group" style={{ margin: 0, minWidth: 150 }}>
          <label className="sr-only" htmlFor="usuarios-status">Status</label>
          <select
            id="usuarios-status"
            className="form-input"
            value={status}
            onChange={event => setStatus(event.target.value)}
            aria-label="Status"
          >
            {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, minWidth: 150 }}>
          <label className="sr-only" htmlFor="usuarios-role">Tipo estrutural</label>
          <select
            id="usuarios-role"
            className="form-input"
            value={role}
            onChange={event => setRole(event.target.value)}
            aria-label="Tipo estrutural"
          >
            <option value="">Todos tipos</option>
            {ROLES.map(item => <option key={item} value={item}>{ROLE_LABEL[item]}</option>)}
          </select>
        </div>
      </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, padding: 'var(--space-4)' }}>
        {activeTab === 'perfis' ? (
          <PerfilEditor
            data={profilesData}
            loading={profilesLoading}
            canEdit={canManageProfiles}
            currentProfileKey={user?.profile_key || user?.profile?.key || user?.role}
            onReload={loadProfiles}
          />
        ) : (
        <div className="card" style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div className="loading-center" style={{ flex: 1 }}>
              <div className="spinner" />
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="empty-state" style={{ flex: 1 }}>
              <h3>Nenhum usuario encontrado</h3>
              <p>Ajuste os filtros ou cadastre um novo usuario.</p>
              {canCreate && <button className="btn btn-primary" type="button" onClick={() => setFormModal({})}>Novo usuario</button>}
            </div>
          ) : (
            <>
              <div className="mobile-list">
                {sortedUsers.map(item => {
                  const reason = archiveReason(item)
                  return (
                    <article key={item.id} className="mobile-record-card">
                      <div className="mobile-record-top">
                        <div style={{ minWidth: 0 }}>
                          <div className="mobile-record-title">{item.name}</div>
                          <div className="mobile-record-sub">@{item.username}</div>
                        </div>
                        <UserProfileCell user={item} />
                      </div>
                      <div className="mobile-record-row">
                        <div className="mobile-record-meta">
                          <StatusBadge user={item} />
                          <span className="badge badge-secondary">Criado em {formatDate(item.createdat || item.createdAt || item.created_at)}</span>
                        </div>
                      </div>
                      {reason && <div className="mobile-record-sub">Motivo: {reason}</div>}
                      <div className="mobile-record-footer">
                        <div />
                        <div className="mobile-record-actions">{renderActions(item, true)}</div>
                      </div>
                    </article>
                  )
                })}
              </div>

              <div className="table-wrap desktop-table-area mobile-cards-hidden" style={{ overflowY: 'auto', flex: 1 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Login</th>
                      <th>Perfil</th>
                      <th>Status</th>
                      <th>Criado em</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map(item => {
                      const reason = archiveReason(item)
                      return (
                        <tr key={item.id} style={isArchived(item) ? { background: 'var(--color-surface-offset)' } : undefined}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            {reason && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Motivo: {reason}</div>}
                          </td>
                          <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>@{item.username}</td>
                          <td><UserProfileCell user={item} /></td>
                          <td><StatusBadge user={item} /></td>
                          <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            {formatDate(item.createdat || item.createdAt || item.created_at)}
                          </td>
                          <td onClick={event => event.stopPropagation()}>
                            {renderActions(item)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {formModal && (
        <UserFormModal
          editUser={formModal.id ? formModal : null}
          profiles={profilesData.profiles}
          profilesLoading={profilesLoading}
          onClose={() => setFormModal(null)}
          onSaved={load}
        />
      )}
      {passwordUser && <PasswordModal user={passwordUser} onClose={() => setPasswordUser(null)} onSaved={load} />}
      {archiveUser && <ArchiveModal user={archiveUser} onClose={() => setArchiveUser(null)} onSaved={load} />}
      {restoreUser && <RestoreModal user={restoreUser} onClose={() => setRestoreUser(null)} onSaved={load} />}
      {deleteCheck && <DeleteCheckModal check={deleteCheck} onClose={() => setDeleteCheck(null)} onDeleted={load} />}
    </div>
  )
}
