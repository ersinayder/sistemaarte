import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Clientes from './Clientes'

let authState

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

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function setupApi() {
  api.get.mockImplementation((url) => {
    if (String(url).startsWith('/clientes?')) {
      return Promise.resolve({
        data: {
          data: [],
          meta: { page: 1, limit: 25, total: 0, totalPages: 1 },
        },
      })
    }
    if (url === '/clientes/cnpj/63870971000102') {
      return Promise.resolve({
        data: {
          razao_social: '63.870.971 EDUARDO RODRIGUES SINAYDER',
          cnpj: '63870971000102',
          cep: '35162132',
          logradouro: '',
          numero: '',
          bairro: 'IGUACU',
          municipio: 'IPATINGA',
          uf: 'MG',
        },
      })
    }
    if (url === '/consulta/cep/35162132') {
      return Promise.resolve({
        data: {
          cep: '35162-132',
          logradouro: 'Rua Pedra Azul',
          bairro: 'Iguacu',
          cidade: 'Ipatinga',
          uf: 'MG',
        },
      })
    }
    return Promise.reject(new Error(`GET inesperado: ${url}`))
  })
}

describe('Clientes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = {
      user: { role: 'admin' },
      can: () => true,
    }
    setupApi()
  })

  it('consulta o CEP quando o CNPJ retorna endereco incompleto mas informa CEP', async () => {
    render(<Clientes />)

    fireEvent.click(await screen.findByRole('button', { name: /novo cliente/i }))
    fireEvent.change(screen.getByPlaceholderText(/^CPF ou CNPJ$/i), {
      target: { value: '63.870.971/0001-02' },
    })

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/consulta/cep/35162132')
    })
    expect(screen.getByPlaceholderText(/rua, av/i)).toHaveValue('Rua Pedra Azul')
    expect(screen.getByPlaceholderText(/^Bairro$/i)).toHaveValue('IGUACU')
    expect(screen.getByPlaceholderText(/^Cidade$/i)).toHaveValue('IPATINGA')
    expect(screen.getByRole('combobox')).toHaveValue('MG')
  })

  it('esconde acoes de cadastro quando usuario tem apenas clientes.ver', async () => {
    authState = {
      user: { role: 'admin' },
      can: (permission) => permission === 'clientes.ver',
    }

    render(<Clientes />)

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/clientes?page=1&limit=25')
    })
    expect(screen.queryByRole('button', { name: /novo cliente/i })).not.toBeInTheDocument()
  })
})
