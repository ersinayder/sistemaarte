import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Servidor from './Servidor';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    toast: vi.fn(),
  },
}));

const mockStatus = {
  ok: true,
  timestamp: new Date().toISOString(),
  system: {
    os: {
      platform: 'win32',
      release: '10.0.14393',
      hostname: 'ArteeMoldurasServer',
      uptimeSeconds: 86400,
      uptimeFormatted: '1d 0h 0m',
    },
    ram: {
      totalBytes: 16000000000,
      usedBytes: 8000000000,
      freeBytes: 8000000000,
      totalFormatted: '16 GB',
      usedFormatted: '8 GB',
      freeFormatted: '8 GB',
      percentUsed: 50,
      alert: false,
    },
    node: {
      version: 'v22.12.0',
      pid: 1234,
      uptimeFormatted: '5h 12m',
      heapUsedFormatted: '85 MB',
      rssFormatted: '140 MB',
    },
    pm2: {
      isPM2: true,
      pm_id: 0,
      name: 'sistemaarte-backend',
      restart_time: 2,
      status: 'online',
    },
    disk: {
      drive: 'C:\\',
      totalFormatted: '250 GB',
      freeFormatted: '80 GB',
      percentUsed: 68,
      percentFree: 32,
      alert: false,
    },
  },
  database: {
    tamanhoDbFormatted: '14.5 MB',
    tamanhoWalFormatted: '0 B',
    tamanhoTotalFormatted: '14.5 MB',
    integridade: 'ok',
    integridadeOk: true,
    contagens: {
      ordens: 642,
      clientes: 380,
      lancamentos: 1100,
    },
  },
  backups: {
    ok: true,
    ultimoBackup: {
      arquivo: 'backup-2026-09-04T02-00-00.db',
      tamanho: '14.5 MB',
      datahora: '2026-09-04T02:00:00.000Z',
    },
    arquivosLocais: [],
    offsite: { configurado: false },
    alertas: [],
    alertaCritico: false,
  },
  fiscal: {
    ambiente: 'Produção',
    ambienteNum: 1,
    serie: '1',
    proximoNumero: 285,
    certificadoConfigurado: true,
    certificadoNome: 'certificado-a1.pfx',
  },
  alertas: [],
};

const mockLogsError = {
  ok: true,
  tipo: 'error',
  linhas: [
    '2026-09-04 02:00:00 [database] Backup iniciado',
    '2026-09-04 02:00:01 [database] Backup concluído com sucesso',
  ],
  arquivo: 'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-backend-error.log',
  existe: true,
  tamanhoFormatted: '12 KB',
};

const mockLogsOut = {
  ok: true,
  tipo: 'out',
  linhas: [
    'Sistema Oficina — Servidor OK',
    'http://0.0.0.0:3001',
  ],
  arquivo: 'C:\\Users\\Administrator\\.pm2\\logs\\sistemaarte-backend-out.log',
  existe: true,
  tamanhoFormatted: '45 KB',
};

describe('Servidor Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url, config) => {
      if (url === '/servidor/status') {
        return Promise.resolve({ data: mockStatus });
      }
      if (url === '/servidor/logs') {
        if (config?.params?.tipo === 'out') {
          return Promise.resolve({ data: mockLogsOut });
        }
        return Promise.resolve({ data: mockLogsError });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renderiza o cabeçalho e métricas principais do servidor', async () => {
    render(<Servidor />);

    expect(screen.getByText('Painel do Servidor')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ArteeMoldurasServer/)).toBeInTheDocument();
      expect(screen.getByText('Host & Recursos')).toBeInTheDocument();
      expect(screen.getByText('Processo Backend (PM2)')).toBeInTheDocument();
      expect(screen.getByText('SQLite (oficina.db)')).toBeInTheDocument();
      expect(screen.getByText('Console de Logs do Backend')).toBeInTheDocument();
    });
  });

  it('carrega e exibe as linhas de log do terminal', async () => {
    render(<Servidor />);

    await waitFor(() => {
      expect(screen.getByText(/Backup iniciado/)).toBeInTheDocument();
    });
  });

  it('permite alternar entre a aba de erros e saída geral', async () => {
    render(<Servidor />);

    await waitFor(() => {
      expect(screen.getByText(/Backup iniciado/)).toBeInTheDocument();
    });

    const outTab = screen.getByRole('button', { name: /Saída Geral/i });
    fireEvent.click(outTab);

    await waitFor(() => {
      expect(screen.getByText(/Sistema Oficina — Servidor OK/)).toBeInTheDocument();
    });
  });
});
