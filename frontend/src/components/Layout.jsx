import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../context/AuthContext'

const ROLE_LABEL = { admin: 'Admin', caixa: 'Caixa', oficina: 'Oficina' }
const ROLE_COLOR = { admin: 'var(--color-purple)', caixa: 'var(--color-primary)', oficina: 'var(--color-orange)' }

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const { user } = useAuth()

  return (
    <div className="app-layout">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Overlay mobile quando drawer aberto */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'oklch(0.1 0 0 / 0.5)',
            zIndex: 149,
            backdropFilter: 'blur(1px)',
          }}
        />
      )}

      <div className="main-wrapper">
        {/* Topbar */}
        <header className="topbar">
          {/* Botão hamburguer — só aparece no mobile */}
          <button
            className="btn btn-icon btn-ghost topbar-menu-btn"
            onClick={() => setMobileOpen(o => !o)}
            aria-label="Abrir menu"
            style={{ width: 36, height: 36 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>

          <span className="topbar-date">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </span>

          <div style={{ flex: 1 }} />

          <span className="topbar-role-pill" style={{ color: ROLE_COLOR[user?.role] }}>
            {ROLE_LABEL[user?.role]}
            <span className="topbar-username"> · {user?.name}</span>
          </span>

          <button className="btn btn-icon btn-ghost" onClick={toggle} aria-label="Alternar tema"
            style={{ width: 36, height: 36 }}>
            {theme === 'dark'
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            }
          </button>
        </header>

        {/* Content */}
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
