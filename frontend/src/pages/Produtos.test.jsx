import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Produtos from './Produtos'

let authState

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
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

const produto = {
  id: 1,
  nome: 'Moldura teste',
  categoria: 'Quadro',
  unidade: 'un',
  preco: 25,
  estoque: 10,
  estoquemin: 2,
  descricao: 'Produto de teste',
  ncm: '44151000',
  cfop: '5101',
}

describe('Produtos RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: [produto] })
    authState = {
      user: { id: 3, role: 'oficina' },
      isAdmin: false,
      isCaixa: false,
      can: (permission) => [
        'produtos.ver',
        'produtos.criar',
        'produtos.editar',
        'produtos.excluir',
      ].includes(permission),
    }
  })

  it('mostra acoes quando permissoes de produtos estao presentes', async () => {
    render(<Produtos />)

    expect((await screen.findAllByText('Moldura teste')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /novo produto/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /editar/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /excluir/i }).length).toBeGreaterThan(0)
  })

  it('esconde acoes quando usuario tem apenas produtos.ver', async () => {
    authState.can = (permission) => permission === 'produtos.ver'

    render(<Produtos />)

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/produtos'))
    expect(screen.queryByRole('button', { name: /novo produto/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument()
  })
})
