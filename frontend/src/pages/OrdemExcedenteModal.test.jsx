import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import OrdemDetalhe from './OrdemDetalhe';

let authState;

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: '10' }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('Task 10: OrdemExcedenteModal & Uso de Credito', () => {
  const ordemMock = {
    id: 10,
    numero: 'OS-0010',
    clientenome: 'Cliente Comum',
    clienteid: 42,
    status: 'Em Produção',
    valortotal: 200,
    valorentrada: 150,
    pagamento: 'Pix',
    historico: [],
    lancamentos: [
      { id: 1, tipo: 'Entrada', valor: 150, pagamento: 'Pix', pago: 1, data: '2026-10-26' },
    ],
    itens: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState = {
      can: () => true,
    };

    api.get.mockImplementation((url) => {
      const s = String(url);
      if (s === '/ordens/10') {
        return Promise.resolve({ data: ordemMock });
      }
      if (s === '/clientes/42/credito') {
        return Promise.resolve({ data: { saldo: 50, movimentos: [] } });
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
  });

  it('exibe botao Usar Credito Loja quando cliente tem credito e OS tem saldo aberto e aplica credito', async () => {
    render(<OrdemDetalhe />);

    await waitFor(() => {
      expect(screen.getByText('OS-0010')).toBeInTheDocument();
    });

    // Deve buscar crédito do cliente e exibir botão
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/clientes/42/credito');
    });

    const btnUsarCredito = await screen.findByRole('button', { name: /usar crédito loja/i });
    expect(btnUsarCredito).toBeInTheDocument();

    // Clica para abrir o modal de uso de crédito
    fireEvent.click(btnUsarCredito);

    await waitFor(() => {
      expect(screen.getByText('Valor a abater (R$)')).toBeInTheDocument();
    });

    api.post.mockResolvedValueOnce({ data: { ok: true } });

    const btnConfirmar = screen.getByRole('button', { name: /confirmar uso/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/clientes/42/credito/usar',
        expect.objectContaining({
          ordem_id: 10,
          valor: 50,
        })
      );
    });
  });

  it('captura erro 409 EXCEDENTE_PAGAMENTO e abre modal permitindo gerar credito', async () => {
    render(<OrdemDetalhe />);

    await waitFor(() => {
      expect(screen.getByText('OS-0010')).toBeInTheDocument();
    });

    // Ao tentar cancelar OS com pagamentos, backend retorna 409 EXCEDENTE_PAGAMENTO
    api.patch.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: 'EXCEDENTE_PAGAMENTO',
          error: 'Esta OS possui pagamentos registrados.',
          excedente: 150,
        },
      },
    });

    // Clica no botão de cancelar status
    const btnCancelar = screen.getByRole('button', { name: /cancelar os/i });
    fireEvent.click(btnCancelar);

    // Modal de resolução de excedente deve abrir
    await waitFor(() => {
      expect(screen.getByText(/resolução de excedente/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/150/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /gerar crédito loja/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /devolver valor/i })).toBeInTheDocument();

    // Mock do sucesso ao reenviar com destino_excedente: 'credito'
    api.patch.mockResolvedValueOnce({ data: { ...ordemMock, status: 'Cancelado' } });

    fireEvent.click(screen.getByRole('button', { name: /gerar crédito loja/i }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/ordens/10/status',
        expect.objectContaining({
          status: 'Cancelado',
          destino_excedente: 'credito',
        })
      );
    });
  });
});
