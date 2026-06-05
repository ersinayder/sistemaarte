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
    if (!form.username || !form.password) {
      setError('Preencha usuario e senha')
      return
    }
    setLoading(true)
    try {
      const u = await login(form.username, form.password)
      toast.success('Bem-vindo, ' + u.name + '!')
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao conectar ao servidor')
    } finally {
      setLoading(false)
    }
  }

  const roleLabels = { admin: 'Administrador', caixa: 'Caixa', oficina: 'Oficina' }
  const hints = [
    { username: 'admin', role: 'admin' },
    { username: 'caixa', role: 'caixa' },
    { username: 'oficina', role: 'oficina' },
  ]

  return (
    <div className="login-shell">
      <section className="login-brand-panel" aria-label="Arte e Molduras">
        <div className="login-brand-mark">
          <img src="/logo.png" alt="Arte e Molduras" />
        </div>
        <div className="login-brand-copy">
          <span>Sistema Arte e Molduras</span>
          <strong>Operacao de balcao, oficina e financeiro em um so lugar.</strong>
        </div>
      </section>

      <section className="login-card" aria-label="Acesso ao sistema">
        <div className="login-card-header">
          <span className="login-eyebrow">Acesso interno</span>
          <h1>Entrar no sistema</h1>
          <p>Use seu usuario para continuar a operacao da loja.</p>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="login-field" htmlFor="username">
            <span>Usuario</span>
            <input
              id="username"
              name="username"
              placeholder="ex: admin"
              value={form.username}
              onChange={handle}
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="login-field" htmlFor="password">
            <span>Senha</span>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Digite sua senha"
              value={form.password}
              onChange={handle}
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className="login-error" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="login-submit">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="login-dev">
            <span>Acesso rapido somente dev</span>
            <div>
              {hints.map(h => (
                <button
                  type="button"
                  key={h.username}
                  onClick={() => setForm({ username: h.username, password: h.username + '123' })}
                >
                  {roleLabels[h.role]}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="login-footnote">Servidor local - rede interna</p>
      </section>
    </div>
  )
}
