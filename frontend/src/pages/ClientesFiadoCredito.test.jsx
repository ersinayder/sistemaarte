import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import Clientes from './Clientes';

let authState;

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('Task 9: ClientesFiadoCredito', () => {
  const clienteMock = {
    id: 42,
    name: 'Galeria Modelo',
    phone: '31999998888',
    email: 'contato@galeria.com',
    cpf: '12345678000199',
    fiado_ativo: 1,
    fiado_limite: 1500,
    _sumario: {
      totalOrdens: 10,
      totalGasto: 5000,
      ticketMedio: 500,
      osEmAberto: 2,
      osVencidas: 0,
      statusBreakdown: { Entregue: 8, 'Em Produção': 2 },
      saldoCredito: 250,
    },
  };

  const contaAbertoMock = {
    cliente_id: 42,
    fiado_ativo: 1,
    fiado_limite: 1500,
    totalEmAberto: 480,
    ordens: [
      {
        id: 101,
        numero: 'OS-0101',
        servico: 'Moldura Dourada A3',
        status: 'Entregue',
        valortotal: 300,
        recebido: 100,
        saldo: 200,
        prazoentrega: '2026-10-20',
      },
      {
        id: 102,
        numero: 'OS-0102',
        servico: 'Quadro Canvas 60x90',
        status: 'Entregue',
        valortotal: 280,
        recebido: 0,
        saldo: 280,
        prazoentrega: '2026-10-24',
      },
    ],
  };

  const creditoMock = {
    cliente_id: 42,
    saldo: 250,
    movimentos: [
      {
        id: 1,
        tipo: 'saldo_inicial',
        valor: 100,
        motivo: 'Ficha anterior',
        createdat: '2026-10-01 10:00:00',
        usuario_nome: 'Admin',
      },
      {
        id: 2,
        tipo: 'gerado',
        valor: 150,
        motivo: 'Redução OS-0099',
        ordem_numero: 'OS-0099',
        createdat: '2026-10-15 14:30:00',
        usuario_nome: 'Atendente',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authState = {
      can: (p) => true,
    };

    api.get.mockImplementation((url) => {
      const s = String(url);
      if (s.startsWith('/clientes?')) {
        return Promise.resolve({
          data: {
            data: [clienteMock],
            meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
          },
        });
      }
      if (s === '/clientes/42') {
        return Promise.resolve({ data: clienteMock });
      }
      if (s === '/clientes/42/ordens') {
        return Promise.resolve({ data: [] });
      }
      if (s === '/clientes/42/conta-aberto') {
        return Promise.resolve({ data: contaAbertoMock });
      }
      if (s === '/clientes/42/credito') {
        return Promise.resolve({ data: creditoMock });
      }
      return Promise.reject(new Error(`GET inesperado: ${url}`));
    });
  });

  it('exibe cards de destaque de Em Aberto e Credito Loja na ficha do cliente', async () => {
    render(<Clientes />);

    const clienteRows = await screen.findAllByText('Galeria Modelo');
    fireEvent.click(clienteRows[0]);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/clientes/42/conta-aberto');
      expect(api.get).toHaveBeenCalledWith('/clientes/42/credito');
    });

    const emAbertoEls = await screen.findAllByText(/R\$\s*480,00/);
    expect(emAbertoEls.length).toBeGreaterThan(0);
    const creditoEls = await screen.findAllByText(/R\$\s*250,00/);
    expect(creditoEls.length).toBeGreaterThan(0);
  });

  it('renderiza secao de conta em aberto com OSs em debito e botoes de acao', async () => {
    render(<Clientes />);
    const clienteRows = await screen.findAllByText('Galeria Modelo');
    fireEvent.click(clienteRows[0]);

    await waitFor(() => {
      expect(screen.getByText('OS-0101')).toBeInTheDocument();
      expect(screen.getByText('OS-0102')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /cobrança/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /imprimir extrato/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /receber acerto/i })).toBeInTheDocument();
  });

  it('renderiza secao de credito loja com historico de movimentos e acoes de admin', async () => {
    render(<Clientes />);
    const clienteRows = await screen.findAllByText('Galeria Modelo');
    fireEvent.click(clienteRows[0]);

    const creditoTab = await screen.findByRole('button', { name: /crédito loja/i });
    fireEvent.click(creditoTab);

    await waitFor(() => {
      expect(screen.getByText(/Ficha anterior/)).toBeInTheDocument();
      expect(screen.getByText(/Redução OS-0099/)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /saldo inicial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajuste/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /devolver/i })).toBeInTheDocument();
  });

  it('permite configurar fiado e limite de fiado no modal de edicao para admin', async () => {
    render(<Clientes />);

    const editBtns = await screen.findAllByRole('button', { name: /editar/i });
    fireEvent.click(editBtns[0]);

    // Modal de edição abre
    expect(await screen.findByText('Editar Cliente')).toBeInTheDocument();

    // Checkbox de fiado e campo de limite
    const fiadoCheckbox = screen.getByLabelText(/permite conta em aberto/i);
    expect(fiadoCheckbox).toBeInTheDocument();
    expect(fiadoCheckbox).toBeChecked();

    const limiteInput = screen.getByLabelText(/limite de crédito fiado/i);
    expect(limiteInput).toHaveValue(1500);
  });
});
