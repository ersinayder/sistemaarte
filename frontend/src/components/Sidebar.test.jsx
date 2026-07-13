import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import api from '../services/api'

let authState

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: vi.fn(),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [] })
    authState = {
      user: { id: 2, name: 'Caixa RBAC', role: 'caixa' },
      logout: vi.fn(),
      switchUser: vi.fn(),
    }
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  it('renders for caixa auth shapes without a can helper', () => {
    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText('Atendimento')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /usu/i })).not.toBeInTheDocument()
  })

  it('shows Usuarios for non-admin users with usuarios.ver permission', () => {
    authState = {
      user: { id: 3, name: 'Oficina Gestora', role: 'oficina' },
      logout: vi.fn(),
      switchUser: vi.fn(),
      can: (permission) => ['oficina.ver', 'usuarios.ver'].includes(permission),
    }

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText('Fila da Oficina')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /usu/i })).toBeInTheDocument()
  })

  it('shows Clientes and Produtos for non-caixa users with matching permissions', () => {
    authState = {
      user: { id: 3, name: 'Oficina Cadastros', role: 'oficina' },
      logout: vi.fn(),
      switchUser: vi.fn(),
      can: (permission) => ['oficina.ver', 'clientes.ver', 'produtos.ver'].includes(permission),
    }

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText('Fila da Oficina')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clientes/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /produtos/i })).toBeInTheDocument()
  })

  it('hides Clientes and Produtos from caixa when permissions are absent', () => {
    authState = {
      user: { id: 2, name: 'Caixa Sem Cadastro', role: 'caixa' },
      logout: vi.fn(),
      switchUser: vi.fn(),
      can: () => false,
    }

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.queryByRole('link', { name: /clientes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /produtos/i })).not.toBeInTheDocument()
  })
})
