import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '../../services/api'
import InutilizacaoModal from './InutilizacaoModal'

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const contexto = {
  ambiente: 1,
  ambienteLabel: 'Producao',
  cnpj: '07.***.***/0001-96',
  modelo: '55',
  serie: '1',
  anoSugerido: 2026,
  ultimoNumero: 281,
  avisoPrazo: 'Solicite ate o decimo dia do mes seguinte.',
}

const historico = [
  {
    id: 7,
    ambiente: 2,
    ano: 2026,
    serie: '1',
    numero_inicial: 100,
    numero_final: 102,
    justificativa: 'Quebra de sequencia durante teste em homologacao',
    status: 'autorizado',
    protocolo: '135260000000001',
    tem_xml_envio: 1,
    tem_xml_retorno: 1,
    solicitado_em: '2026-06-18T10:00:00-03:00',
    solicitado_por_nome: 'Administrador',
  },
]

function prepararCarregamento({ lista = historico } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/nfe/inutilizacoes/contexto') return Promise.resolve({ data: contexto })
    if (url === '/nfe/inutilizacoes') return Promise.resolve({ data: { inutilizacoes: lista } })
    return Promise.reject(new Error(`GET inesperado: ${url}`))
  })
}

async function preencherPedido(_user, {
  inicio = '280',
  fim = '280',
  justificativa = 'Quebra de sequencia por rejeicao fiscal durante emissao',
  confirmacao = 'INUTILIZAR 280',
} = {}) {
  fireEvent.change(screen.getByLabelText(/numero inicial/i), { target: { value: inicio } })
  fireEvent.change(screen.getByLabelText(/numero final/i), { target: { value: fim } })
  fireEvent.change(screen.getByLabelText(/justificativa/i), { target: { value: justificativa } })
  fireEvent.change(screen.getByLabelText(/confirmacao/i), { target: { value: confirmacao } })
}

describe('InutilizacaoModal', () => {
  beforeEach(() => {
    api.get.mockReset()
    api.post.mockReset()
  })

  it('nao renderiza nem consulta a API quando esta fechado', () => {
    render(<InutilizacaoModal open={false} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('carrega contexto fiscal somente leitura e historico ao abrir', async () => {
    prepararCarregamento()

    render(<InutilizacaoModal open onClose={vi.fn()} />)

    expect(await screen.findByDisplayValue('Producao')).toHaveAttribute('readonly')
    expect(screen.getByDisplayValue('07.***.***/0001-96')).toHaveAttribute('readonly')
    expect(screen.getByDisplayValue('55')).toHaveAttribute('readonly')
    expect(screen.getByDisplayValue('1')).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/ano/i)).toHaveValue(2026)
    expect(screen.getByText(/ultimo numero conhecido: 281/i)).toBeInTheDocument()
    expect(screen.getByText(/100-102/)).toBeInTheDocument()
    expect(screen.getByText(/Administrador/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/nfe/inutilizacoes/contexto', expect.any(Object))
    expect(api.get).toHaveBeenCalledWith('/nfe/inutilizacoes', expect.any(Object))
  })

  it('exige dados validos e a confirmacao exata para numero unico ou intervalo', async () => {
    prepararCarregamento({ lista: [] })
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} />)

    const submit = await screen.findByRole('button', { name: /inutilizar numeracao/i })
    expect(submit).toBeDisabled()

    await preencherPedido(user, {
      inicio: '280',
      fim: '285',
      confirmacao: 'INUTILIZAR 280',
    })

    expect(screen.getByText(/6 numeros/i)).toBeInTheDocument()
    expect(screen.getByText('INUTILIZAR 280-285')).toBeInTheDocument()
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/confirmacao/i), { target: { value: 'INUTILIZAR 280-285' } })
    expect(submit).toBeEnabled()

    fireEvent.change(screen.getByLabelText(/numero final/i), { target: { value: '279' } })
    expect(screen.getByText(/numero final deve ser maior ou igual/i)).toBeInTheDocument()
    expect(submit).toBeDisabled()
  })

  it('mostra rejeicao persistida e nao permite reenvio cego da mesma faixa', async () => {
    prepararCarregamento({ lista: [] })
    api.post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          erro: 'Faixa ja inutilizada na SEFAZ',
          inutilizacao: {
            id: 12,
            status: 'rejeitado',
            cstat: '241',
            motivo: 'Faixa ja inutilizada na SEFAZ',
          },
        },
      },
    })
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)

    const submit = screen.getByRole('button', { name: /inutilizar numeracao/i })
    await user.click(submit)
    expect(await screen.findByText(/inutilizacao rejeitada/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Faixa ja inutilizada na SEFAZ')
    expect(screen.queryByRole('button', { name: /inutilizar numeracao/i })).not.toBeInTheDocument()
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post.mock.calls[0][1].idempotencyKey).toBeTruthy()
  })

  it('mantem replay idempotente rejeitado como rejeicao na UI', async () => {
    prepararCarregamento({ lista: [] })
    api.post.mockResolvedValue({
      data: {
        inutilizacao: {
          id: 12,
          status: 'rejeitado',
          cstat: '241',
          motivo: 'Faixa ja inutilizada na SEFAZ',
        },
        replayed: true,
      },
    })
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)
    await user.click(screen.getByRole('button', { name: /inutilizar numeracao/i }))

    expect(await screen.findByText(/inutilizacao rejeitada/i)).toBeInTheDocument()
    expect(screen.queryByText(/inutilizacao autorizada/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('cStat 241')
  })

  it('bloqueia fechamento e duplo envio enquanto a transmissao esta pendente', async () => {
    prepararCarregamento({ lista: [] })
    let resolver
    api.post.mockReturnValue(new Promise((resolve) => { resolver = resolve }))
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={onClose} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)

    const submit = screen.getByRole('button', { name: /inutilizar numeracao/i })
    await user.click(submit)

    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /fechar/i })).toBeDisabled()
    await user.click(screen.getByTestId('inutilizacao-overlay'))
    expect(onClose).not.toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolver({
        data: {
          inutilizacao: {
            id: 13,
            status: 'autorizado',
            cstat: '102',
            protocolo: '135260000000013',
          },
        },
      })
    })
  })

  it('mostra protocolo, chama onSuccess e oferece XMLs apenas apos autorizacao', async () => {
    prepararCarregamento({ lista: [] })
    api.post.mockResolvedValue({
      data: {
        inutilizacao: {
          id: 21,
          status: 'autorizado',
          cstat: '102',
          protocolo: '135260000000021',
          concluido_em: '2026-06-18T12:00:00-03:00',
          tem_xml_envio: 1,
          tem_xml_retorno: 1,
        },
      },
    })
    const onSuccess = vi.fn()
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} onSuccess={onSuccess} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)
    await user.click(screen.getByRole('button', { name: /inutilizar numeracao/i }))

    expect(await screen.findByText(/inutilizacao autorizada/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('135260000000021')
    expect(screen.getByRole('status')).toHaveTextContent(/cstat 102/i)
    expect(screen.getByRole('link', { name: /xml de envio/i }))
      .toHaveAttribute('href', '/api/nfe/inutilizacoes/21/xml/envio')
    expect(screen.getByRole('link', { name: /xml de retorno/i }))
      .toHaveAttribute('href', '/api/nfe/inutilizacoes/21/xml/retorno')
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 21, status: 'autorizado' }))
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/xml/'), expect.anything())
  })

  it('preserva os dados e mostra rejeicao fiscal retornada pelo backend', async () => {
    prepararCarregamento({ lista: [] })
    api.post.mockRejectedValue({
      response: {
        status: 422,
        data: { erro: 'Rejeicao: numero ja utilizado', cStat: '256' },
      },
    })
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)
    await user.click(screen.getByRole('button', { name: /inutilizar numeracao/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Rejeicao: numero ja utilizado')
    expect(screen.getByLabelText(/numero inicial/i)).toHaveValue(280)
    expect(screen.getByLabelText(/justificativa/i)).toHaveValue(
      'Quebra de sequencia por rejeicao fiscal durante emissao'
    )
  })

  it('exibe rejeicao fiscal persistida pelo backend sem marcar como autorizada', async () => {
    prepararCarregamento({ lista: [] })
    api.post.mockRejectedValue({
      response: {
        status: 422,
        data: {
          inutilizacao: {
            id: 41,
            status: 'rejeitado',
            cstat: '241',
            motivo: 'Um numero da faixa ja foi utilizado',
          },
        },
      },
    })
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)
    await user.click(screen.getByRole('button', { name: /inutilizar numeracao/i }))

    expect(await screen.findByText(/inutilizacao rejeitada/i)).toBeInTheDocument()
    expect(screen.queryByText(/inutilizacao autorizada/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('cStat 241')
    expect(screen.queryByRole('link', { name: /xml de envio/i })).not.toBeInTheDocument()
  })

  it('trata timeout como resultado incerto e proibe reenvio cego', async () => {
    prepararCarregamento({ lista: [] })
    api.post.mockRejectedValue({
      response: {
        status: 504,
        data: {
          erro: 'Nao foi possivel confirmar se a SEFAZ recebeu a solicitacao.',
          inutilizacao: { id: 31, status: 'incerto' },
        },
      },
    })
    const user = userEvent.setup()

    render(<InutilizacaoModal open onClose={vi.fn()} />)
    await screen.findByLabelText(/numero inicial/i)
    await preencherPedido(user)
    await user.click(screen.getByRole('button', { name: /inutilizar numeracao/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/resultado incerto/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/nao reenvie/i)
    expect(screen.getByRole('button', { name: /inutilizar numeracao/i })).toBeDisabled()
  })

  it('exibe links XML do historico sem baixar os documentos antecipadamente', async () => {
    prepararCarregamento()

    render(<InutilizacaoModal open onClose={vi.fn()} />)

    const envio = await screen.findByRole('link', { name: /xml de envio da faixa 100-102/i })
    const retorno = screen.getByRole('link', { name: /xml de retorno da faixa 100-102/i })
    expect(envio).toHaveAttribute('href', '/api/nfe/inutilizacoes/7/xml/envio')
    expect(retorno).toHaveAttribute('href', '/api/nfe/inutilizacoes/7/xml/retorno')
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
