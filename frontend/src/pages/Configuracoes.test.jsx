import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../services/api'
import Configuracoes from './Configuracoes'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: () => true,
    user: { id: 1, name: 'Admin', role: 'admin' },
  }),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    toast: vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Configuracoes - Impressao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => {
      if (url === '/configuracoes') {
        return Promise.resolve({
          data: {
            empresa: { razaosocial: 'Arte e Molduras LTDA' },
            status: {},
          },
        })
      }
      if (url === '/configuracoes/impressao') {
        return Promise.resolve({
          data: {
            impressao: {
              printerName: 'Impressoraloja',
              printerIp: '192.168.0.45',
              paperSize: 'A5',
              color: true,
              directPrintEnabled: false,
              serverPlatform: 'linux',
              directPrintSupported: false,
              status: { status: 'OK' },
            },
          },
        })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('indicates browser print mode and disables direct print on VPS Linux', async () => {
    render(
      <MemoryRouter>
        <Configuracoes />
      </MemoryRouter>
    )

    // Click on Impressao section in sidebar/tab
    const impressaoTab = await screen.findByRole('button', { name: /impressao/i })
    fireEvent.click(impressaoTab)

    expect(await screen.findByText(/Servidor VPS Linux detectado/i)).toBeInTheDocument()
    expect(screen.getByText(/O modo ativo de impressao e/i)).toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox', { name: /impressao direta no servidor/i })
    expect(checkbox).toBeDisabled()
    expect(checkbox).not.toBeChecked()
  })

  it('allows direct printing when on Windows Server platform', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/configuracoes') {
        return Promise.resolve({
          data: {
            empresa: { razaosocial: 'Arte e Molduras LTDA' },
            status: {},
          },
        })
      }
      if (url === '/configuracoes/impressao') {
        return Promise.resolve({
          data: {
            impressao: {
              printerName: 'Impressoraloja',
              printerIp: '192.168.0.45',
              paperSize: 'A5',
              color: true,
              directPrintEnabled: true,
              serverPlatform: 'win32',
              directPrintSupported: true,
              status: { status: 'OK' },
            },
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(
      <MemoryRouter>
        <Configuracoes />
      </MemoryRouter>
    )

    const impressaoTab = await screen.findByRole('button', { name: /impressao/i })
    fireEvent.click(impressaoTab)

    expect(await screen.findByDisplayValue('Impressoraloja')).toBeInTheDocument()
    expect(screen.queryByText(/Servidor VPS Linux detectado/i)).not.toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox', { name: /impressao direta no servidor/i })
    expect(checkbox).not.toBeDisabled()
    expect(checkbox).toBeChecked()
  })

  it('displays print agent online status and friendly explanation when agent is online', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/configuracoes') {
        return Promise.resolve({
          data: {
            empresa: { razaosocial: 'Arte e Molduras LTDA' },
            status: {},
          },
        })
      }
      if (url === '/configuracoes/impressao') {
        return Promise.resolve({
          data: {
            impressao: {
              printerName: 'Canon G3010',
              paperSize: 'A5',
              color: true,
              directPrintEnabled: false,
              serverPlatform: 'linux',
              directPrintSupported: false,
              agentOnline: true,
              agentLastSeen: '2026-10-19T14:30:00.000Z',
              status: { status: 'OK' },
            },
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(
      <MemoryRouter>
        <Configuracoes />
      </MemoryRouter>
    )

    const impressaoTab = await screen.findByRole('button', { name: /impressao/i })
    fireEvent.click(impressaoTab)

    expect(await screen.findByText(/Impressão Silenciosa na Loja: ativada via Agente Local na Canon G3010/i)).toBeInTheDocument()
    const onlineBadges = screen.getAllByText('Online')
    expect(onlineBadges.length).toBeGreaterThanOrEqual(1)
    expect(onlineBadges[0]).toHaveClass('badge-success')
    expect(screen.getByText('Último sinal do agente')).toBeInTheDocument()
  })

  it('displays print agent offline status when agent is offline', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/configuracoes') {
        return Promise.resolve({
          data: {
            empresa: { razaosocial: 'Arte e Molduras LTDA' },
            status: {},
          },
        })
      }
      if (url === '/configuracoes/impressao') {
        return Promise.resolve({
          data: {
            impressao: {
              printerName: 'Canon G3010',
              paperSize: 'A5',
              color: true,
              directPrintEnabled: false,
              serverPlatform: 'linux',
              directPrintSupported: false,
              agentOnline: false,
              agentLastSeen: null,
              status: { status: 'OK' },
            },
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(
      <MemoryRouter>
        <Configuracoes />
      </MemoryRouter>
    )

    const impressaoTab = await screen.findByRole('button', { name: /impressao/i })
    fireEvent.click(impressaoTab)

    expect(await screen.findByText(/Impressão Silenciosa na Loja: ativada via Agente Local na Canon G3010/i)).toBeInTheDocument()
    const offlineBadges = screen.getAllByText('Offline')
    expect(offlineBadges.length).toBeGreaterThanOrEqual(1)
    expect(offlineBadges[0]).toHaveClass('badge-warning')
  })
})

describe('Configuracoes - WhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => {
      if (url === '/configuracoes') {
        return Promise.resolve({
          data: {
            empresa: { razaosocial: 'Arte e Molduras LTDA' },
            status: { whatsapp: 'OK' },
          },
        })
      }
      if (url === '/configuracoes/whatsapp') {
        return Promise.resolve({
          data: {
            whatsapp: {
              enabled: false,
              provider: 'manual',
              mensagemConfirmacao: 'Ola {cliente}',
              mensagemPronto: 'Pedido {numero_os} pronto',
              status: { status: 'OK', missing: [] },
            },
          },
        })
      }
      if (url === '/configuracoes/whatsapp/web-status') {
        return Promise.resolve({
          data: {
            state: 'manual_mode',
            message: 'Envio manual assistido ativo via navegador/desktop (automacao desativada)',
          },
        })
      }
      return Promise.resolve({ data: {} })
    })
  })

  it('renders prominent manual assistido banner, instructions, and default desktop client mode', async () => {
    render(
      <MemoryRouter>
        <Configuracoes />
      </MemoryRouter>
    )

    const whatsappTab = await screen.findByRole('button', { name: /whatsapp/i })
    fireEvent.click(whatsappTab)

    expect(await screen.findByText(/Envio Manual Assistido Ativo/i)).toBeInTheDocument()
    expect(screen.getByText(/O servico de disparo automatico em background via Baileys foi pausado/i)).toBeInTheDocument()
    expect(screen.getAllByText(/WhatsApp Desktop \(App do Windows\)/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/WhatsApp Web \(Navegador\)/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Manual assistido ativo/i).length).toBeGreaterThanOrEqual(1)
  })

  it('handles manual_mode response from web-status gracefully', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/configuracoes') {
        return Promise.resolve({
          data: {
            empresa: { razaosocial: 'Arte e Molduras LTDA' },
            status: { whatsapp: 'OK' },
          },
        })
      }
      if (url === '/configuracoes/whatsapp') {
        return Promise.resolve({
          data: {
            whatsapp: {
              enabled: false,
              provider: 'web_local',
              webBaseUrl: 'http://127.0.0.1:8080',
              webInstance: 'ArteeMolduras',
              status: { status: 'OK', missing: [] },
            },
          },
        })
      }
      if (url === '/configuracoes/whatsapp/web-status') {
        return Promise.resolve({
          data: {
            state: 'manual_mode',
            message: 'Envio manual assistido ativo via navegador/desktop (automacao desativada)',
          },
        })
      }
      return Promise.resolve({ data: {} })
    })

    render(
      <MemoryRouter>
        <Configuracoes />
      </MemoryRouter>
    )

    const whatsappTab = await screen.findByRole('button', { name: /whatsapp/i })
    fireEvent.click(whatsappTab)

    expect(await screen.findByText(/Envio manual assistido ativo via navegador\/desktop/i)).toBeInTheDocument()
    expect(screen.getByText(/Aviso operacional:/i)).toBeInTheDocument()
  })
})
