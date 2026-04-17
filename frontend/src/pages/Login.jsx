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
    if (!form.username || !form.password) { setError('Preencha usuario e senha'); return }
    setLoading(true)
    try {
      const u = await login(form.username, form.password)
      toast.success('Bem-vindo, ' + u.name + '!')
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

  const inputStyle = {
    background: '#262523',
    border: '1px solid #393836',
    borderRadius: '0.5rem',
    padding: '0.75rem 1rem',
    color: '#cdccca',
    fontSize: '1rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    color: '#cdccca',
    fontWeight: 700,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    display: 'block',
    marginBottom: '0.5rem',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#141312', padding: '1rem', zIndex: 9999,
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
          <img src="/logo.png" alt="Arte e Molduras" style={{ height: 160, width: 'auto', objectFit: 'contain' }} />
        </div>

        <p style={{
          textAlign: 'center', fontSize: '0.75rem', color: '#888',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.5rem'
        }}>Sistema de Gestao</p>

        <div style={{
          background: '#1c1b19', border: '1px solid #393836',
          borderRadius: '0.75rem', padding: '1.5rem', marginBottom: '1rem',
        }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div>
              <label htmlFor="username" style={labelStyle}>Usuario</label>
              <input id="username" name="username" placeholder="ex: admin"
                value={form.username} onChange={handle}
                autoComplete="username" autoFocus style={inputStyle} />
            </div>

            <div>
              <label htmlFor="password" style={labelStyle}>Senha</label>
              <input id="password" name="password" type="password" placeholder="........"
                value={form.password} onChange={handle}
                autoComplete="current-password" style={inputStyle} />
            </div>

            {error && (
              <div style={{
                background: '#4c3d46', color: '#d163a7', borderRadius: '0.5rem',
                padding: '0.75rem', fontSize: '0.75rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '0.5rem',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '0.5rem', padding: '0.75rem',
              background: loading ? '#1a626b' : '#01696f', color: '#fff',
              border: 'none', borderRadius: '0.5rem',
              fontSize: '0.875rem', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 180ms',
            }}>
              {loading
                ? 'Entrando...'
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
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#5a5957', textAlign: 'center', marginBottom: '0.75rem' }}>
              Acesso rapido (somente dev):
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {hints.map(h => (
                <button key={h.username}
                  onClick={() => setForm({ username: h.username, password: h.username + '123' })}
                  style={{
                    padding: '0.5rem 0.75rem', background: '#1c1b19',
                    border: '1px solid #393836', borderRadius: '9999px',
                    fontSize: '0.75rem', cursor: 'pointer', color: '#797876',
                  }}
                >{roleLabels[h.role]}</button>
              ))}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#5a5957' }}>
          Servidor local · rede interna
        </p>
      </div>
    </div>
  )
}
