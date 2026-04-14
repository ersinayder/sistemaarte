import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import api from '../services/api'

const Icon = ({ d, d2 }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>{d2 && <path d={d2}/>}
  </svg>
)

const ICONS = {
  dashboard: { d: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  caixa:     { d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ordens:    { d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', d2: 'M9 3h6a1 1 0 011 1v1H8V4a1 1 0 011-1zM9 12h6M9 16h4' },
  orcamento: { d: 'M12 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z', d2: 'M14 2v6h6M9 13h6M9 17h4M9 9h1' },
  oficina:   { d: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z' },
  relat:     { d: 'M18 20V10M12 20V4M6 20v-6' },
  usuarios:  { d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', d2: 'M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z' },
  clientes:  { d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', d2: 'M12 11a4 4 0 100-8 4 4 0 000 8z' },
}

const ROLE_LABEL = { admin: 'Administrador', caixa: 'Caixa', oficina: 'Oficina' }
const ROLE_COLOR = { admin: 'var(--color-purple)', caixa: 'var(--color-primary)', oficina: 'var(--color-orange)' }

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, switchUser } = useAuth()
  const [vencidas, setVencidas] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await api.get('/ordens?vencidas=1')
        if (cancelled) return
        const n = (r.data?.ordens || r.data || []).length
        setVencidas(n)
      } catch {}
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const navigate = useNavigate()
  const handleSwitch = () => { switchUser(); navigate('/login'); toast('Faça login com outro usuário') }
  const handleLogout = () => { logout(); navigate('/login'); toast('Sessão encerrada') }

  const navItemBadge = (to, label, iconKey, badge) => (
    <NavLink to={to}
      className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
      title={collapsed ? label : undefined}
      style={{ position: 'relative' }}>
      <Icon {...ICONS[iconKey]} />
      {!collapsed && <span className="nav-label">{label}</span>}
      {badge > 0 && (
        <span style={{ position: 'absolute', top: 6, right: collapsed ? 4 : 8, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--color-notification)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )

  const navItem = (to, label, iconKey) => (
    <NavLink to={to}
      className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
      title={collapsed ? label : undefined}>
      <Icon {...ICONS[iconKey]} />
      {!collapsed && <span className="nav-label">{label}</span>}
    </NavLink>
  )

  const isAdmin   = user?.role === 'admin'
  const isCaixa   = user?.role === 'caixa'
  const isOficina = user?.role === 'oficina'

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-logo" onClick={onToggle} style={{ cursor: 'pointer' }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <img src="/logo.png" alt="Arte & Molduras"
              style={{ height: 32, objectFit: 'contain' }}
              onError={e => { e.target.style.display = 'none' }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--text-sm)', lineHeight: 1.1 }}>Arte & Molduras</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>Gestão</div>
            </div>
          </div>
        )}
        <button className="btn btn-icon btn-ghost" style={{ marginLeft: collapsed ? 0 : 'auto', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M15 18l-6-6 6-6"/>}
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        {isOficina && navItem('/oficina', 'Fila da Oficina', 'oficina')}
        {(isAdmin || isCaixa) && (
          <>
            {navItem('/dashboard', 'Dashboard', 'dashboard')}
            {navItemBadge('/ordens', 'Ordens de Serviço', 'ordens', vencidas)}
            {navItem('/orcamento', 'Orçamento', 'orcamento')}
            {navItem('/oficina', 'Fila da Oficina', 'oficina')}
            {navItem('/caixa', 'Caixa', 'caixa')}
            {navItem('/clientes', 'Clientes', 'clientes')}
            {navItem('/relatorios', 'Relatórios', 'relat')}
            {isAdmin && navItem('/usuarios', 'Usuários', 'usuarios')}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-2)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: ROLE_COLOR[user?.role] || 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: 10, color: ROLE_COLOR[user?.role], fontWeight: 600 }}>{ROLE_LABEL[user?.role]}</div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleSwitch} title="Trocar usuário" style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6"/></svg>
            {!collapsed && <span>Trocar</span>}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sair" style={{ flex: 1, justifyContent: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}
