import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import api from '../services/api'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 2, name: 'Caixa RBAC', role: 'caixa' },
    logout: vi.fn(),
    switchUser: vi.fn(),
  }),
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
    expect(screen.queryByText('Usuários')).not.toBeInTheDocument()
  })
})
