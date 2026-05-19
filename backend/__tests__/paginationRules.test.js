import { describe, expect, it } from 'vitest';

const {
  normalizarPaginacao,
  montarMetaPaginacao,
} = await import('../domain/paginationRules.js');

describe('paginationRules', () => {
  it('normalizes page and limit with conservative defaults and caps', () => {
    expect(normalizarPaginacao({ page: '2', limit: '25' })).toEqual({
      page: 2,
      limit: 25,
      offset: 25,
    });

    expect(normalizarPaginacao({ page: '-1', limit: '999' })).toEqual({
      page: 1,
      limit: 100,
      offset: 0,
    });

    expect(normalizarPaginacao({})).toEqual({
      page: 1,
      limit: 25,
      offset: 0,
    });
  });

  it('builds stable pagination metadata', () => {
    expect(montarMetaPaginacao({ page: 2, limit: 25, total: 51 })).toEqual({
      page: 2,
      limit: 25,
      total: 51,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });
});
