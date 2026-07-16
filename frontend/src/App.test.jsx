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
vi.mock('./pages/Clientes', () => ({ default: () => <div>Pagina Clientes</div> }))
vi.mock('./pages/Produtos', () => ({ default: () => <div>Pagina Produtos</div> }))
vi.mock('./pages/Atendimento', () => ({ default: () => <div>Atendimento</div> }))
vi.mock('./pages/Oficina', () => ({ default: () => <div>Oficina</div> }))
vi.mock('./pages/Login', () => ({ default: () => <div>Login</div> }))
vi.mock('./pages/Configuracoes', () => ({ default: () => <div>Configuracoes</div> }))
vi.mock('./pages/OrdemLixeira', () => ({ default: () => <div>Lixeira OS</div> }))

describe('App permission routes', () => {
  beforeEach(() => {
    authState = {
      user: { id: 2, name: 'Caixa RBAC', profile_key: 'caixa', permissions: [] },
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
    authState.user.permissions = ['atendimento.ver']

    render(
      <MemoryRouter initialEntries={['/usuarios']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Atendimento')).toBeInTheDocument()
    expect(screen.queryByText('Pagina Usuarios')).not.toBeInTheDocument()
  })

  it('shows a no-access state when the user has no route permissions', async () => {
    render(
      <MemoryRouter initialEntries={['/usuarios']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Sem acesso disponivel')).toBeInTheDocument()
    expect(screen.queryByText('Pagina Usuarios')).not.toBeInTheDocument()
  })

  it('renders clientes for non-caixa users with clientes.ver permission', async () => {
    authState.user.profile_key = 'oficina'
    authState.user.permissions = ['clientes.ver']

    render(
      <MemoryRouter initialEntries={['/clientes']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Pagina Clientes')).toBeInTheDocument()
  })

  it('does not render clientes for caixa without clientes.ver permission', async () => {
    authState.user.permissions = ['atendimento.ver']

    render(
      <MemoryRouter initialEntries={['/clientes']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Atendimento')).toBeInTheDocument()
    expect(screen.queryByText('Pagina Clientes')).not.toBeInTheDocument()
  })

  it('renders produtos for non-caixa users with produtos.ver permission', async () => {
    authState.user.profile_key = 'oficina'
    authState.user.permissions = ['produtos.ver']

    render(
      <MemoryRouter initialEntries={['/produtos']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Pagina Produtos')).toBeInTheDocument()
  })

  it('does not render produtos for caixa without produtos.ver permission', async () => {
    authState.user.permissions = ['atendimento.ver']

    render(
      <MemoryRouter initialEntries={['/produtos']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Atendimento')).toBeInTheDocument()
    expect(screen.queryByText('Pagina Produtos')).not.toBeInTheDocument()
  })

  it('does not render oficina when the user lacks ordens.ver needed by the board', async () => {
    authState.user.profile_key = 'oficina'
    authState.user.permissions = ['oficina.ver']

    render(
      <MemoryRouter initialEntries={['/oficina']}>
        <App />
      </MemoryRouter>
    )

    expect(await screen.findByText('Sem acesso disponivel')).toBeInTheDocument()
    expect(screen.queryByText('Oficina')).not.toBeInTheDocument()
  })

  it('does not render configuracoes for execute-only backup or company-edit-only permissions', async () => {
    for (const permissions of [['backups.executar'], ['configuracoes.editar_empresa']]) {
      authState.user.permissions = permissions
      const { unmount } = render(
        <MemoryRouter initialEntries={['/configuracoes']}>
          <App />
        </MemoryRouter>
      )

      expect(await screen.findByText('Sem acesso disponivel')).toBeInTheDocument()
      expect(screen.queryByText('Configuracoes')).not.toBeInTheDocument()
      unmount()
    }
  })
})
