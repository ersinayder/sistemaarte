import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

let authState

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => authState,
}))

vi.mock('./components/Layout', async () => {
  const { Outlet } = await vi.importActual('react-router-dom')
  return { default: () => <Outlet /> }
})

vi.mock('./pages/Usuarios', () => ({ default: () => <div>Pagina Usuarios</div> }))
vi.mock('./pages/Atendimento', () => ({ default: () => <div>Atendimento</div> }))
vi.mock('./pages/Login', () => ({ default: () => <div>Login</div> }))

describe('App permission routes', () => {
  beforeEach(() => {
    authState = {
      user: { id: 2, name: 'Caixa RBAC', role: 'caixa', permissions: [] },
      loading: false,
      canAny: (permissions) => permissions.some((permission) => authState.user.permissions.includes(permission)),
    }
  })

  it('renders usuarios for caixa with usuarios.ver permission', async () => {
    authState.user.permissions = ['usuarios.ver']

    render(
      <MemoryRouter initialEntries={['/usuarios']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Pagina Usuarios')).toBeInTheDocument()
  })

  it('does not render usuarios without usuarios.ver permission', async () => {
    render(
      <MemoryRouter initialEntries={['/usuarios']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Atendimento')).toBeInTheDocument()
    expect(screen.queryByText('Pagina Usuarios')).not.toBeInTheDocument()
  })
})
