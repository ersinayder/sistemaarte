import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Usuarios from './Usuarios'

const authState = {
  user: {
    id: 1,
    name: 'Admin Loja',
    username: 'admin',
    role: 'admin',
    permissions: ['*'],
  },
  can: vi.fn(() => true),
}

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const usersEnvelope = {
  users: [
    {
      id: 1,
      name: 'Admin Loja',
      username: 'admin',
      role: 'admin',
      active: 1,
      createdat: '2026-06-01T10:00:00',
    },
    {
      id: 2,
      name: 'Caixa Antigo',
      username: 'caixa.antigo',
      role: 'caixa',
      active: 1,
      createdat: '2026-06-10T10:00:00',
    },
    {
      id: 3,
      name: 'Oficina Arquivada',
      username: 'oficina.old',
      role: 'oficina',
      active: 0,
      deletedat: '2026-06-20T10:00:00',
      deletedreason: 'Saiu da loja',
      createdat: '2026-06-11T10:00:00',
    },
    {
      id: 4,
      name: 'Caixa Ativa',
      username: 'caixa.ativa',
      role: 'caixa',
      active: 1,
      createdat: '2026-06-12T10:00:00',
    },
  ],
  meta: { total: 4 },
}

const profilesEnvelope = {
  profiles: [
    {
      key: 'admin',
      name: 'Administrador',
      description: 'Acesso total ao sistema.',
      system: true,
      active: true,
      active_user_count: 1,
      permissions: ['ordens.ver', 'clientes.ver', 'clientes.excluir', 'usuarios.ver', 'usuarios.editar'],
      default_permissions: ['ordens.ver', 'clientes.ver', 'clientes.excluir', 'usuarios.ver', 'usuarios.editar'],
    },
    {
      key: 'caixa',
      name: 'Caixa',
      description: 'Atendimento do balcao.',
      system: true,
      active: true,
      active_user_count: 2,
      permissions: ['ordens.ver', 'clientes.ver'],
      default_permissions: ['ordens.ver', 'clientes.ver'],
    },
  ],
  permissions: ['ordens.ver', 'clientes.ver', 'clientes.excluir', 'usuarios.ver', 'usuarios.editar'],
  permissionGroups: [
    { key: 'ordens', label: 'Ordens de servico', permissions: ['ordens.ver'] },
    { key: 'clientes', label: 'Clientes', permissions: ['clientes.ver', 'clientes.excluir'] },
    { key: 'usuarios', label: 'Usuarios', permissions: ['usuarios.ver', 'usuarios.editar'] },
  ],
}

function mockUsersApi() {
  api.get.mockImplementation((url) => {
    if (url === '/users') {
      return Promise.resolve({ data: usersEnvelope })
    }
    if (url === '/users/2/delete-check') {
      return Promise.resolve({
        data: {
          allowed: false,
          blockers: ['lancamentos criados'],
        },
      })
    }
    if (url === '/permission-profiles') {
      return Promise.resolve({ data: profilesEnvelope })
    }
    return Promise.reject(new Error(`GET inesperado: ${url}`))
  })
  api.post.mockResolvedValue({ data: {} })
  api.put.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
}

describe('Usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.can.mockImplementation(() => true)
    mockUsersApi()
  })

  it('renders filters, table and API users returned in the paginated users envelope', async () => {
    render(<Usuarios />)

    expect(screen.getByPlaceholderText(/buscar por nome ou login/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /status/i })).toHaveValue('active')
    expect(screen.getByRole('combobox', { name: /perfil/i })).toHaveValue('')
    expect((await screen.findAllByText('Admin Loja')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Caixa Antigo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Oficina Arquivada').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Caixa Ativa').length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: /usuario/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /login/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /perfil/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /criado em/i })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/users', {
      params: { status: 'active', role: undefined, q: undefined },
    })
  })

  it('sends trimmed search text as q when the user changes the search filter', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await screen.findAllByText('Caixa Antigo')
    await user.type(screen.getByPlaceholderText(/buscar por nome ou login/i), ' caixa ')

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/users', expect.objectContaining({
        params: expect.objectContaining({ q: 'caixa' }),
      }))
    })
  })

  it('archives a user with the reason informed in the dialog', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await user.click(await screen.findByRole('button', { name: /arquivar caixa antigo/i }))
    const dialog = await screen.findByRole('dialog', { name: /arquivar usuario/i })
    await user.type(within(dialog).getByLabelText(/motivo/i), 'Saiu da loja')
    await user.click(within(dialog).getByRole('button', { name: /arquivar/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/2/archive', { reason: 'Saiu da loja' })
    })
  })

  it('shows delete-check blockers and does not show final permanent delete when blocked', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await user.click(await screen.findByRole('button', { name: /verificar exclusao permanente de caixa antigo/i }))

    expect(api.get).toHaveBeenCalledWith('/users/2/delete-check')
    const dialog = await screen.findByRole('dialog', { name: /exclusao permanente/i })
    expect(within(dialog).getByText(/lancamentos criados/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /excluir permanentemente/i })).not.toBeInTheDocument()
  })

  it('restores an archived user after confirmation', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await user.click(await screen.findByRole('button', { name: /restaurar oficina arquivada/i }))
    const dialog = await screen.findByRole('dialog', { name: /restaurar usuario/i })
    await user.click(within(dialog).getByRole('button', { name: /restaurar/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users/3/restore')
    })
  })

  it('shows only restore action for archived users returned by the API', async () => {
    render(<Usuarios />)

    await screen.findByRole('button', { name: /restaurar oficina arquivada/i })

    expect(screen.getAllByText(/motivo: saiu da loja/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /restaurar oficina arquivada/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /arquivar oficina arquivada/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /redefinir senha de oficina arquivada/i })).not.toBeInTheDocument()
  })

  it('does not show self reset-password action while keeping it for another active user', async () => {
    render(<Usuarios />)

    await screen.findAllByText('Admin Loja')

    expect(screen.queryByRole('button', { name: /redefinir senha de admin loja/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /redefinir senha de caixa ativa/i })).toBeInTheDocument()
  })

  it('edits profile permissions from the Perfis tab', async () => {
    const user = userEvent.setup()
    render(<Usuarios />)

    await user.click(screen.getByRole('button', { name: /^perfis$/i }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/permission-profiles')
    })
    await user.click(await screen.findByRole('button', { name: /caixa/i }))
    const checkbox = screen.getByLabelText(/clientes\.excluir/i)

    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: /salvar perfil/i }))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/permission-profiles/caixa', expect.objectContaining({
        name: 'Caixa',
        description: 'Atendimento do balcao.',
        active: true,
        permissions: expect.arrayContaining(['ordens.ver', 'clientes.ver', 'clientes.excluir']),
      }))
    })
  })
})
