import { describe, expect, it } from 'vitest';
import {
  filtrarOrdensOficina,
  ordenarOrdensOficina,
  atualizarStatusOrdemOficina,
} from '../../frontend/src/utils/oficinaBoard.js';

describe('oficina board ordering', () => {
  it('keeps delivered cards from the current work week', () => {
    const ordens = [
      { id: 1, status: 'Aguardando', prazoentrega: '2026-06-03' },
      { id: 2, status: 'Entregue', statusalteradoem: '2026-06-01 09:00:00' },
      { id: 3, status: 'Entregue', statusalteradoem: '2026-06-03 18:00:00' },
      { id: 4, status: 'Entregue', prazoentrega: '2026-06-03' },
      { id: 5, status: 'Cancelado', statusalteradoem: '2026-06-01 10:00:00' },
      { id: 6, status: 'Entregue', statusalteradoem: '2026-05-29 10:00:00' },
    ];

    expect(filtrarOrdensOficina(ordens, '2026-06-04').map(o => o.id)).toEqual([1, 2, 3]);
  });

  it('clears delivered cards during the weekend so Monday starts empty', () => {
    const ordens = [
      { id: 1, status: 'Entregue', statusalteradoem: '2026-06-05 18:00:00' },
      { id: 2, status: 'Entregue', statusalteradoem: '2026-06-06 10:00:00' },
    ];

    expect(filtrarOrdensOficina(ordens, '2026-06-06')).toEqual([]);
    expect(filtrarOrdensOficina(ordens, '2026-06-08')).toEqual([]);
  });

  it('orders Aguardando by delivery date and other columns by latest movement', () => {
    const ordens = [
      { id: 1, status: 'Aguardando', prazoentrega: '2026-06-03', criadoem: '2026-05-28 08:00:00' },
      { id: 2, status: 'Aguardando', prazoentrega: '2026-06-01', criadoem: '2026-05-29 08:00:00' },
      { id: 3, status: 'Pronto', prazoentrega: '2026-06-01', statusalteradoem: '2026-06-01 09:00:00' },
      { id: 4, status: 'Pronto', prazoentrega: '2026-06-02', statusalteradoem: '2026-06-01 11:00:00' },
      { id: 5, status: 'Em Produção', prazoentrega: '2026-06-01', statusalteradoem: '2026-06-01 10:00:00' },
      { id: 6, status: 'Em Produção', prazoentrega: '2026-06-02', statusalteradoem: '2026-06-01 12:00:00' },
    ];

    const sorted = ordenarOrdensOficina(ordens).map(o => o.id);

    expect(sorted).toEqual([2, 1, 6, 5, 4, 3]);
  });

  it('moves a card locally without waiting for a reload', () => {
    const ordens = [
      { id: 1, status: 'Aguardando', prazoentrega: '2026-06-01', criadoem: '2026-05-29 08:00:00' },
      { id: 2, status: 'Em Produção', prazoentrega: '2026-06-02', statusalteradoem: '2026-06-01 10:00:00' },
    ];

    const moved = atualizarStatusOrdemOficina(ordens, 1, 'Em Produção', '2026-06-01 12:00:00', '2026-06-01');

    expect(moved.map(o => ({ id: o.id, status: o.status }))).toEqual([
      { id: 1, status: 'Em Produção' },
      { id: 2, status: 'Em Produção' },
    ]);
    expect(moved[0].statusalteradoem).toBe('2026-06-01 12:00:00');
  });
});
