import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import NotasFiscais from './NotasFiscais'

let authState = { isAdmin: true }

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../components/nfe/InutilizacaoModal', () => ({
  default: ({ open }) => open ? <div role="dialog">Modal inutilizacao</div> : null,
}))

describe('NotasFiscais inutilizacao manual', () => {
  beforeEach(() => {
    authState = { isAdmin: true }
    api.get.mockResolvedValue({
      data: {
        notas: [],
        meta: { ambiente: 1, autorizadas_homologacao: 0, alvo_homologacao: 10 },
      },
    })
  })

  it('mostra acao de inutilizacao somente para admin', async () => {
    render(<NotasFiscais />)

    expect(await screen.findByRole('button', { name: /inutilizar numeração/i })).toBeInTheDocument()
  })

  it('nao mostra acao de inutilizacao para caixa', async () => {
    authState = { isAdmin: false }

    render(<NotasFiscais />)

    await screen.findByRole('heading', { name: /notas fiscais/i })
    expect(screen.queryByRole('button', { name: /inutilizar numeração/i })).not.toBeInTheDocument()
  })
})
