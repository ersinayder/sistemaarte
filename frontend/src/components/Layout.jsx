import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../context/AuthContext'

const ROLE_LABEL = { admin: 'Administrador', caixa: 'Caixa', oficina: 'Oficina' }
const ROLE_COLOR = { admin: 'var(--color-purple)', caixa: 'var(--color-primary)', oficina: 'var(--color-orange)' }

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const { theme, toggle } = useTheme()
  const { user } = useAuth()

  return (
    // FIX: removido overflow:hidden do wrapper raiz.
    // Esse overflow bloqueava o position:fixed do modal em iOS/Android.
    // O scroll é controlado pelo <main> interno — não precisa de overflow aqui.
    <div style={{ display: 'flex', height: '100dvh' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
          padding: '0 var(--space-6)', minHeight: 60,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          {/* Data */}
          <span style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-surface-dynamic)',
            borderRadius: 'var(--radius-full)',
            whiteSpace: 'nowrap',
          }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </span>

          <div style={{ flex: 1 }} />

          {/* Perfil badge */}
          <span style={{
            fontSize: 'var(--text-xs)', fontWeight: 600,
            color: ROLE_COLOR[user?.role],
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-surface-dynamic)',
            borderRadius: 'var(--radius-full)',
          }}>
            {ROLE_LABEL[user?.role]}
          </span>

          {/* Theme toggle */}
          <button className="btn btn-icon btn-ghost" onClick={toggle} aria-label="Alternar tema">
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
        <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
