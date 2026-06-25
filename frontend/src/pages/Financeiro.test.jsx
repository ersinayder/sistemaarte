import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Financeiro from './Financeiro'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('Financeiro integridade de OS', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/financeiro/resumo')) {
        return Promise.resolve({ data: { despesasPorCategoria: [] } })
      }
      if (url.startsWith('/financeiro/contas-pagar')) {
        return Promise.resolve({ data: [] })
      }
      if (url === '/financeiro/contas-receber') {
        return Promise.resolve({ data: [] })
      }
      if (url.startsWith('/financeiro/dre')) {
        return Promise.resolve({ data: { despesas: [] } })
      }
      if (url === '/financeiro/integridade-os') {
        return Promise.resolve({
          data: {
            total: 1,
            criticos: 1,
            avisos: 0,
            itens: [
              {
                tipo: 'entregue_com_saldo',
                severidade: 'critico',
                ordemId: 10,
                numero: 'OS-10',
                clienteNome: 'Ana',
                mensagem: 'OS entregue ainda possui saldo oficial em aberto.',
                saldoOficial: 25,
              },
            ],
          },
        })
      }
      if (url === '/financeiro/integridade-os/10') {
        return Promise.resolve({
          data: {
            ordem: { id: 10, numero: 'OS-10', clientenome: 'Ana', status: 'Entregue', valortotal: 100 },
            resumo: { valorTotal: 100, recebidoOficial: 75, saldoOficial: 25, excedente: 0 },
            receberGerencial: null,
            apontamentos: [
              { tipo: 'entregue_com_saldo', severidade: 'critico', mensagem: 'OS entregue ainda possui saldo oficial em aberto.' },
            ],
            lancamentos: [
              { id: 5, data: '2026-06-25', tipo: 'Entrada', descricao: 'Pix', pagamento: 'Pix', valor: 75, pago: 1, consideradoNoSaldo: true },
            ],
          },
        })
      }
      return Promise.resolve({ data: null })
    })
  })

  it('loads and shows a compact financial integrity panel', async () => {
    render(<Financeiro />)

    expect(await screen.findByText('Integridade das OS')).toBeInTheDocument()
    expect(screen.getByText('OS entregue ainda possui saldo oficial em aberto.')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/financeiro/integridade-os', { skipGlobalErrorToast: true })
  })

  it('opens a read-only detail modal for a financial integrity issue', async () => {
    const user = userEvent.setup()
    render(<Financeiro />)

    await screen.findByText('Integridade das OS')
    await user.click(screen.getByRole('button', { name: /auditar/i }))

    expect(await screen.findByText('Auditoria financeira da OS')).toBeInTheDocument()
    expect(screen.getAllByText('Pix').length).toBeGreaterThan(0)
    expect(screen.getByText('Considerado')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/financeiro/integridade-os/10', { skipGlobalErrorToast: true })
    expect(screen.queryByRole('button', { name: /corrigir|quitar|excluir|reabrir/i })).not.toBeInTheDocument()
  })
})
