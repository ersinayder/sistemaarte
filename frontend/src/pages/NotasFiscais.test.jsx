import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import NotasFiscais from './NotasFiscais'

let authState = { isAdmin: true }

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
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
    api.get.mockReset()
    api.post.mockReset()
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

  it('abre o modo avulso a partir do modal de emissao', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/nfe') {
        return Promise.resolve({ data: { notas: [], meta: { ambiente: 1 } } })
      }
      if (url === '/ordens') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/produtos') {
        return Promise.resolve({ data: [{ id: 1, nome: 'Moldura cadastrada', preco: 80, ncm: '44151000', cfop: '5102', csosn: '400', origem_fiscal: 0, unidade: 'UN' }] })
      }
      if (url === '/clientes') {
        return Promise.resolve({ data: { clientes: [{ id: 5, name: 'Cliente Cadastrado' }] } })
      }
      if (url === '/nfe/avulsa/preview') {
        return Promise.resolve({
          data: {
            origem: 'avulsa',
            ordem: { numero: 'Avulsa', servico: 'NF-e avulsa', pagamento: 'Pix', valortotal: 0 },
            cliente: { nome: '', documento: '', ie: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '' },
            emitente: { xNome: 'Arte' },
            fiscal: { ambiente: 1, serie: '1' },
            itens: [],
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(<NotasFiscais />)

    await userEvent.click(await screen.findByRole('button', { name: /emitir nf-e/i }))
    await userEvent.click(await screen.findByRole('button', { name: /avulsa/i }))

    expect(await screen.findByText('NF-e avulsa')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/buscar produto cadastrado/i)).toBeInTheDocument()
  })

  it('renderiza a origem avulsa na lista de NF-e', async () => {
    api.get.mockResolvedValue({
      data: {
        notas: [{
          id: 1,
          origem: 'avulsa',
          numero: 'Avulsa',
          clientenome: 'Cliente Avulso',
          servico: 'NF-e avulsa',
          valortotal: 80,
          nfe_status: 'autorizado',
          nfe_numero: '301',
          nfe_serie: '1',
        }],
        meta: { ambiente: 1 },
      },
    })

    render(<NotasFiscais />)

    expect(await screen.findByText('Avulsa')).toBeInTheDocument()
    expect(screen.getByText('Cliente Avulso')).toBeInTheDocument()
  })
})
