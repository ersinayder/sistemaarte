import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (!form.username || !form.password) { setError('Preencha usuário e senha'); return }
    setLoading(true)
    try {
      const u = await login(form.username, form.password)
      toast.success(`Bem-vindo, ${u.name}!`)
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao conectar ao servidor')
    } finally { setLoading(false) }
  }

  const roleLabels = { admin: 'Administrador', caixa: 'Caixa', oficina: 'Oficina' }
  const hints = [
    { username: 'admin',   role: 'admin'   },
    { username: 'caixa',   role: 'caixa'   },
    { username: 'oficina', role: 'oficina' },
  ]

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#141312',
      padding: 'var(--space-4)',
      zIndex: 9999,
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-5)' }}>
          <img
            src="/logo.png"
            alt="Arte e Molduras"
            style={{ height: 160, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        <p style={{
          textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 'var(--space-6)'
        }}>
          Sistema de Gestão
        </p>

        <div className="card card-pad" style={{ marginBottom: 'var(--space-4)' }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="username">Usuário</label>
              <input
                id="username" name="username" className="form-input"
                placeholder="ex: admin" value={form.username}
                onChange={handle} autoComplete="username" autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Senha</label>
              <input
                id="password" name="password" type="password" className="form-input"
                placeholder="••••••••" value={form.password}
                onChange={handle} autoComplete="current-password"
              />
            </div>

            {error && (
              <div style={{
                background: 'var(--color-error-highlight)', color: 'var(--color-error)',
                borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 'var(--space-2)'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', padding: 'var(--space-3)' }}>
              {loading
                ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Entrando...</>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                    </svg>
                    Entrar
                  </>
              }
            </button>
          </form>
        </div>

        {import.meta.env.DEV && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <p style={{
              fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)',
              textAlign: 'center', marginBottom: 'var(--space-3)'
            }}>
              Acesso rápido (somente dev):
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
              {hints.map(h => (
                <button key={h.username}
                  onClick={() => setForm({ username: h.username, password: `${h.username}123` })}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {roleLabels[h.role]}
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
          Servidor local · rede interna
        </p>

      </div>
    </div>
  )
}
