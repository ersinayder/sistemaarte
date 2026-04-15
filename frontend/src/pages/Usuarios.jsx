import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import api from '../services/api'
import toast from 'react-hot-toast'

const ROLES = ['admin','caixa','oficina']
const ROLE_LABEL = { admin:'Administrador', caixa:'Caixa', oficina:'Oficina' }
const ROLE_COLOR = { admin:'var(--color-purple)', caixa:'var(--color-primary)', oficina:'var(--color-orange)' }
const ROLE_HL    = { admin:'var(--color-purple-hl)', caixa:'var(--color-primary-hl)', oficina:'var(--color-orange-hl)' }

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body)
}

function ModalUsuario({ open, onClose, onSaved, editData }) {
  const [form, setForm] = useState({ name:'', username:'', password:'', role:'caixa', ativo:true })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    setForm(editData
      ? { name:editData.name||'', username:editData.username||'', password:'', role:editData.role||'caixa', ativo:editData.ativo!==false }
      : { name:'', username:'', password:'', role:'caixa', ativo:true })
  }, [open, editData])

  const save = async () => {
    if (!form.name.trim() || !form.username.trim()) { toast.error('Nome e usuário são obrigatórios'); return }
    if (!editData && !form.password) { toast.error('Senha é obrigatória para novo usuário'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      if (editData && !form.password) delete payload.password
      if (editData) { await api.put(`/users/${editData.id}`, payload); toast.success('Usuário atualizado!') }
      else          { await api.post('/users', payload);               toast.success('Usuário criado!') }
      onSaved(); onClose()
    } catch(e) { toast.error(e.response?.data?.error || 'Erro ao salvar') }
    finally { setSaving(false) }
  }

  if (!open) return null
  return (
    <Portal>
      <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-header">
            <span className="modal-title">{editData ? 'Editar Usuário' : 'Novo Usuário'}</span>
            <button className="btn btn-icon btn-ghost" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)', padding:'var(--space-4) var(--space-5)' }}>
            <div className="form-grid-2">
              <div className="form-group col-span-2">
                <label className="form-label">Nome completo *</label>
                <input className="form-input" placeholder="Ex: Ana Paula" value={form.name} onChange={e=>set('name',e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Login (usuário) *</label>
                <input className="form-input" placeholder="Ex: ana.paula" value={form.username} onChange={e=>set('username',e.target.value.toLowerCase().replace(/\s/g,''))} />
              </div>
              <div className="form-group">
                <label className="form-label">{editData ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}</label>
                <input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Perfil de Acesso</label>
              <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-2)' }}>
                {ROLES.map(r => (
                  <button key={r} type="button"
                    onClick={() => set('role', r)}
                    style={{
                      flex:1, padding:'var(--space-3)', borderRadius:'var(--radius-lg)',
                      border:`2px solid ${form.role===r ? ROLE_COLOR[r] : 'var(--color-border)'}`,
                      background: form.role===r ? ROLE_HL[r] : 'var(--color-surface-dynamic)',
                      color: form.role===r ? ROLE_COLOR[r] : 'var(--color-text-muted)',
                      fontWeight: form.role===r ? 700 : 500,
                      fontSize:'var(--text-xs)', cursor:'pointer', textAlign:'center',
                      transition:'all var(--ease)',
                    }}>
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding:'var(--space-3)', background:'var(--color-surface-dynamic)', borderRadius:'var(--radius-md)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
              {{
                admin:   '✅ Acesso total — caixa, ordens, relatórios, fila oficina e gestão de usuários.',
                caixa:   '✅ Caixa, ordens, clientes, relatórios e fila. ❌ Não gerencia usuários.',
                oficina: '✅ Apenas a fila da oficina — visualiza e avança status das OS.',
              }[form.role]}
            </div>

            {editData && (
              <label style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', cursor:'pointer', fontSize:'var(--text-sm)' }}>
                <input type="checkbox" checked={form.ativo} onChange={e=>set('ativo',e.target.checked)}
                  style={{ width:16, height:16, accentColor:'var(--color-primary)' }} />
                Usuário ativo
              </label>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><div className="spinner" style={{width:14,height:14}}/>Salvando...</> : editData ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

export default function Usuarios() {
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState({ open:false, edit:null })

  useEffect(() => { document.title = 'Usuários — Arte & Molduras' }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/users'); setUsers(r.data) }
    catch { toast.error('Erro ao carregar usuários') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Usuários</h1>
        <button className="btn btn-primary" onClick={() => setModal({ open:true, edit:null })}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Novo Usuário
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'var(--space-4)' }}>
        {loading
          ? [1,2,3].map(i => <div key={i} className="card card-pad skeleton" style={{ height:140 }}/>)
          : users.map(u => (
          <div key={u.id} className="card card-pad" style={{ opacity: u.ativo===false ? 0.5 : 1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', marginBottom:'var(--space-4)' }}>
              <div style={{
                width:44, height:44, borderRadius:'var(--radius-full)',
                background: ROLE_COLOR[u.role], display:'flex',
                alignItems:'center', justifyContent:'center',
                color:'white', fontWeight:800, fontSize:'var(--text-base)',
              }}>
                {u.name[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:'var(--text-sm)' }}>{u.name}</div>
                <div style={{ fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>@{u.username}</div>
              </div>
              {u.ativo === false && (
                <span className="badge" style={{ background:'var(--color-surface-dynamic)', color:'var(--color-text-faint)', marginLeft:'auto' }}>Inativo</span>
              )}
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{
                padding:'var(--space-1) var(--space-3)', borderRadius:'var(--radius-full)',
                background: ROLE_HL[u.role], color: ROLE_COLOR[u.role],
                fontSize:'var(--text-xs)', fontWeight:700,
              }}>
                {ROLE_LABEL[u.role]}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal({ open:true, edit:u })}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      <ModalUsuario open={modal.open} onClose={() => setModal({open:false,edit:null})} onSaved={load} editData={modal.edit} />
    </div>
  )
}
