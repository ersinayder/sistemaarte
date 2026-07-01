import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

  it('envia informacoes complementares da revisao na NF-e avulsa', async () => {
    const previaVazia = {
      origem: 'avulsa',
      ordem: { numero: 'Avulsa', servico: 'NF-e avulsa', pagamento: 'Pix', valortotal: 0 },
      cliente: { nome: '', documento: '', ie: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '' },
      emitente: { xNome: 'Arte' },
      fiscal: { ambiente: 1, serie: '1' },
      itens: [],
      informacoes_complementares: '',
    }

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
        return Promise.resolve({ data: { clientes: [] } })
      }
      if (url === '/nfe/avulsa/preview') {
        return Promise.resolve({ data: previaVazia })
      }
      return Promise.resolve({ data: {} })
    })
    api.post.mockImplementation((url, body) => {
      if (url === '/nfe/avulsa/preview') {
        return Promise.resolve({
          data: {
            ...previaVazia,
            ordem: { ...previaVazia.ordem, valortotal: 80 },
            itens: body.itens,
            informacoes_complementares: body.informacoes_complementares || '',
          },
        })
      }
      if (url === '/nfe/avulsa') {
        return Promise.resolve({ data: { ok: true } })
      }
      return Promise.resolve({ data: {} })
    })

    render(<NotasFiscais />)

    await userEvent.click(await screen.findByRole('button', { name: /emitir nf-e/i }))
    await userEvent.click(await screen.findByRole('button', { name: /avulsa/i }))
    await userEvent.click(await screen.findByRole('button', { name: /moldura cadastrada/i }))
    const revisar = await screen.findByRole('button', { name: /revisar dados/i })
    await waitFor(() => expect(revisar).not.toBeDisabled())
    await userEvent.click(revisar)

    const campo = await screen.findByRole('textbox', { name: /informacoes complementares/i })
    await userEvent.type(campo, 'Entrega combinada com cliente.')
    const botoesEmitir = screen.getAllByRole('button', { name: /emitir nf-e/i })
    await userEvent.click(botoesEmitir[botoesEmitir.length - 1])

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/nfe/avulsa',
        expect.objectContaining({
          informacoes_complementares: 'Entrega combinada com cliente.',
        }),
        expect.any(Object)
      )
    })
  })

  it('posiciona informacoes complementares depois dos itens com campo compacto', async () => {
    const previaComItem = {
      origem: 'avulsa',
      ordem: { numero: 'Avulsa', servico: 'NF-e avulsa', pagamento: 'Pix', valortotal: 80 },
      cliente: { nome: '', documento: '', ie: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '', cep: '' },
      emitente: { xNome: 'Arte' },
      fiscal: { ambiente: 1, serie: '1' },
      itens: [{
        id: 'produto-1',
        nome: 'Moldura cadastrada',
        quantidade: 1,
        preco_unitario: 80,
        subtotal: 80,
        ncm: '44151000',
        cfop: '5102',
        csosn: '400',
        origem_fiscal: '0',
        unidade: 'UN',
      }],
      informacoes_complementares: '',
    }

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
        return Promise.resolve({ data: { clientes: [] } })
      }
      if (url === '/nfe/avulsa/preview') {
        return Promise.resolve({ data: { ...previaComItem, itens: [] } })
      }
      return Promise.resolve({ data: {} })
    })
    api.post.mockResolvedValue({ data: previaComItem })

    render(<NotasFiscais />)

    await userEvent.click(await screen.findByRole('button', { name: /emitir nf-e/i }))
    await userEvent.click(await screen.findByRole('button', { name: /avulsa/i }))
    await userEvent.click(await screen.findByRole('button', { name: /moldura cadastrada/i }))
    const revisar = await screen.findByRole('button', { name: /revisar dados/i })
    await waitFor(() => expect(revisar).not.toBeDisabled())
    await userEvent.click(revisar)

    const itensTitulo = await screen.findByText('Itens da NF-e')
    const campo = screen.getByRole('textbox', { name: /informacoes complementares/i })

    expect(Boolean(itensTitulo.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(campo).toHaveAttribute('rows', '2')
    expect(campo).toHaveStyle({ minHeight: '52px' })
  })
})
