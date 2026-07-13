import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import OrdemDetalhe from './OrdemDetalhe'

const navigateMock = vi.fn()

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAdmin: true,
    isCaixa: false,
    isOficina: false,
    can: (permission) => ['ordens.ver', 'nfe.danfe'].includes(permission),
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: '42' }),
}))

describe('OrdemDetalhe DANFE download', () => {
  beforeEach(() => {
    navigateMock.mockClear()
    api.get.mockReset()
    api.post.mockReset()
    api.patch.mockReset()
    api.delete.mockReset()
    global.URL.createObjectURL = vi.fn(() => 'blob:test')
    global.URL.revokeObjectURL = vi.fn()
    HTMLAnchorElement.prototype.click = vi.fn()
  })

  it('baixa DANFE como PDF sem abrir nova aba', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    api.get.mockImplementation((url) => {
      if (url === '/ordens/42') {
        return Promise.resolve({
          data: {
            id: 42,
            numero: 'OS-42',
            clientenome: 'Cliente',
            status: 'Entregue',
            servico: 'Quadro',
            valortotal: 100,
            valorentrada: 100,
            saldoaberto: 0,
            pagamento: 'Pix',
            nfe_chave: '31260507500718000196550010000002851000000285',
            nfe_status: 'autorizado',
            nfe_numero: '000000285',
            itens: [],
            logs: [],
            lancamentos: [],
          },
        })
      }
      if (url.includes('/danfe')) {
        return Promise.resolve({ data: new Blob(['pdf']) })
      }
      return Promise.resolve({ data: {} })
    })

    render(<OrdemDetalhe />)

    await userEvent.click(await screen.findByRole('button', { name: /baixar danfe/i }))

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/nfe/31260507500718000196550010000002851000000285/danfe',
        expect.objectContaining({ responseType: 'blob', timeout: 45000 })
      )
    })
    expect(openSpy).not.toHaveBeenCalledWith(
      '/api/nfe/31260507500718000196550010000002851000000285/danfe',
      '_blank',
      'noopener,noreferrer'
    )
    openSpy.mockRestore()
  })
})
