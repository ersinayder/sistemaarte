import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import Propostas from './Propostas';

const navigateMock = vi.fn();

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    can: (permission) => ['propostas.ver', 'propostas.imprimir'].includes(permission),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

describe('Propostas PDF download', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    api.get.mockReset();
    api.post.mockReset();
    api.patch.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:proposta-modal');
    global.URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('baixa o PDF da proposta sem enviar para impressao em rede', async () => {
    const proposta = {
      id: 7,
      numero: 'PROP-0007',
      clientenome: 'Cliente Teste',
      status: 'Novo lead',
      valortotal: 250,
      createdat: '2026-11-24 10:00:00',
      totalitens: 1,
      itens: [{ id: 1, nome: 'Moldura', quantidade: 1, preco_unitario: 250 }],
    };

    api.get.mockImplementation((url) => {
      if (url === '/propostas') return Promise.resolve({ data: [proposta] });
      if (url === '/propostas/7') return Promise.resolve({ data: proposta });
      if (url === '/propostas/7/pdf?formato=pdf') {
        return Promise.resolve({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) });
      }
      return Promise.resolve({ data: [] });
    });

    render(<Propostas />);

    const card = await screen.findByText('PROP-0007');
    await userEvent.click(card);

    const baixarBtn = await screen.findByRole('button', { name: /baixar pdf/i });
    await userEvent.click(baixarBtn);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/propostas/7/pdf?formato=pdf', {
        responseType: 'blob',
        timeout: 45000,
        skipGlobalErrorToast: true,
      });
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
