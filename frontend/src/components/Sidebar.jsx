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
  resumo:    { d: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  caixa:     { d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ordens:    { d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2', d2: 'M9 3h6a1 1 0 011 1v1H8V4a1 1 0 011-1zM9 12h6M9 16h4' },
  orcamento: { d: 'M12 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z', d2: 'M14 2v6h6M9 13h6M9 17h4M9 9h1' },
  oficina:   { d: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z' },
  relat:     { d: 'M18 20V10M12 20V4M6 20v-6' },
  usuarios:  { d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', d2: 'M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z' },
  clientes:  { d: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', d2: 'M12 11a4 4 0 100-8 4 4 0 000 8z' },
  produtos:  { d: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z', d2: 'M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12' },
}

const ROLE_LABEL = { admin: 'Administrador', caixa: 'Caixa', oficina: 'Oficina' }
const ROLE_COLOR = { admin: 'var(--color-purple)', caixa: 'var(--color-primary)', oficina: 'var(--color-orange)' }

function useTheme() {
  const getTheme = () =>
    document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

  const [theme, setTheme] = useState(getTheme)

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(getTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const mqHandler = () => setTheme(getTheme())
    mq.addEventListener('change', mqHandler)
    return () => { obs.disconnect(); mq.removeEventListener('change', mqHandler) }
  }, [])

  return theme
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, switchUser } = useAuth()
  const [vencidas, setVencidas] = useState(0)
  const theme = useTheme()

  const logoSrc = theme === 'light' ? '/logo preta.png' : '/logo.png'

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

  const navItem = (to, label, iconKey) => (
    <NavLink to={to}
      className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
      title={collapsed ? label : undefined}>
      <Icon {...ICONS[iconKey]} />
      {!collapsed && <span className="nav-label">{label}</span>}
    </NavLink>
  )

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

  const section = (label) => !collapsed
    ? <span className="nav-section">{label}</span>
    : <span className="nav-section-divider" />

  const isAdmin   = user?.role === 'admin'
  const isCaixa   = user?.role === 'caixa'
  const isOficina = user?.role === 'oficina'

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>

      {/* ── Cabeçalho ── */}
      <div
        className="sidebar-header"
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: collapsed ? 'var(--space-3) 0' : 'var(--space-6) var(--space-3) var(--space-4)',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-divider)',
          position: 'relative',
        }}
      >
        {!collapsed ? (
          <img
            key={logoSrc}
            src={logoSrc}
            alt="Arte & Molduras"
            style={{ width: '100%', maxWidth: 148, height: 'auto', objectFit: 'contain', display: 'block' }}
            onError={e => { e.target.src = '/logo.png' }}
          />
        ) : (
          <img
            key={logoSrc + '-sm'}
            src={logoSrc}
            alt="Arte & Molduras"
            style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
            onError={e => { e.target.src = '/logo.png' }}
          />
        )}
        <button
          className="btn btn-icon btn-ghost"
          style={{ position: collapsed ? 'static' : 'absolute', bottom: collapsed ? undefined : 'var(--space-2)', right: collapsed ? undefined : 'var(--space-2)', width: 24, height: 24, opacity: 0.5 }}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed ? <path d="M9 18l6-6-6-6"/> : <path d="M15 18l-6-6 6-6"/>}
          </svg>
        </button>
      </div>

      {/* ── Navegação ── */}
      <nav className="sidebar-nav" style={{ paddingTop: 'var(--space-3)' }}>

        {isOficina && navItem('/oficina', 'Fila da Oficina', 'oficina')}

        {(isAdmin || isCaixa) && (
          <>
            {section('Operação')}
            {navItem('/dashboard', 'Resumo', 'resumo')}
            {navItem('/caixa', 'Caixa', 'caixa')}
            {navItemBadge('/ordens', 'Ordens de Serviço', 'ordens', vencidas)}
            {navItem('/orcamento', 'Orçamento', 'orcamento')}

            {section('Produção')}
            {navItem('/oficina', 'Fila da Oficina', 'oficina')}

            {section('Análise')}
            {navItem('/relatorios', 'Relatórios', 'relat')}

            {section('Cadastros')}
            {navItem('/clientes', 'Clientes', 'clientes')}
            {navItem('/produtos', 'Produtos', 'produtos')}
            {isAdmin && navItem('/usuarios', 'Usuários', 'usuarios')}
          </>
        )}
      </nav>

      {/* ── Footer de usuário ── */}
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
