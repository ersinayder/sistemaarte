import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import OrdemLixeira from './OrdemLixeira'

let permissions

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: (permission) => permissions.includes(permission),
  }),
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const trashItems = [
  {
    id: 7,
    numero: 'OS-0007',
    clientenome: 'Cliente Lixeira',
    servico: 'Quadro',
    deletedat: '2026-07-16 09:00:00',
    valortotal: 150,
  },
]

describe('OrdemLixeira', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissions = []
    api.get.mockResolvedValue({ data: trashItems })
  })

  it('shows trash restore and permanent delete actions only with matching permissions', async () => {
    permissions = ['ordens.excluir']

    const { rerender } = render(
      <MemoryRouter>
        <OrdemLixeira />
      </MemoryRouter>
    )

    expect(await screen.findByText('Cliente Lixeira')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^excluir$/i })).not.toBeInTheDocument()

    permissions = ['ordens.restaurar', 'ordens.excluir_permanente']
    rerender(
      <MemoryRouter>
        <OrdemLixeira />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: /restaurar/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^excluir$/i })).toBeInTheDocument()
  })
})
