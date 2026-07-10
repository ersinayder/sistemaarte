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

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body)
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.response?.data?.message || fallback
}

function isArchived(user) {
  return Boolean(user?.archivedat || user?.archivedAt || user?.archived_at || user?.status === 'archived')
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

function UserFormModal({ editUser, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: editUser?.name || '',
    username: editUser?.username || '',
    password: '',
    role: editUser?.role || 'caixa',
    active: Number(editUser?.active ?? 1) !== 0,
  })
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(editUser)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

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
          <label className="form-label" htmlFor="usuario-role">Perfil</label>
          <select
            id="usuario-role"
            className="form-input"
            value={form.role}
            onChange={event => set('role', event.target.value)}
          >
            {ROLES.map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
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
        <div style={{ marginTop: 4 }}>{ROLE_SUMMARY[form.role]}</div>
        <div style={{ marginTop: 4 }}>Edicao detalhada de permissoes nao faz parte desta tela.</div>
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

function RoleBadge({ role }) {
  return <span className={`badge ${ROLE_BADGE[role] || 'badge-secondary'}`}>{ROLE_LABEL[role] || role || '-'}</span>
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
        {canResetPassword && !archived && (
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
          {canCreate && (
            <button className="btn btn-primary" type="button" onClick={() => setFormModal({})}>
              Novo usuario
            </button>
          )}
        </div>
      </div>

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
          <label className="sr-only" htmlFor="usuarios-role">Perfil</label>
          <select
            id="usuarios-role"
            className="form-input"
            value={role}
            onChange={event => setRole(event.target.value)}
            aria-label="Perfil"
          >
            <option value="">Todos perfis</option>
            {ROLES.map(item => <option key={item} value={item}>{ROLE_LABEL[item]}</option>)}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, padding: 'var(--space-4)' }}>
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
                        <RoleBadge role={item.role} />
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
                          <td><RoleBadge role={item.role} /></td>
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
      </div>

      {formModal && (
        <UserFormModal
          editUser={formModal.id ? formModal : null}
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
