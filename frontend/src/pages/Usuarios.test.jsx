import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Usuarios from './Usuarios'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('Usuarios', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('renders users from the paginated users API envelope', async () => {
    api.get.mockResolvedValue({
      data: {
        users: [
          { id: 1, name: 'Ana Caixa', username: 'ana.caixa', role: 'caixa', active: 1 },
        ],
        meta: { total: 1 },
      },
    })

    render(<Usuarios />)

    expect(await screen.findByText('Ana Caixa')).toBeInTheDocument()
    expect(screen.getByText('@ana.caixa')).toBeInTheDocument()
  })
})
