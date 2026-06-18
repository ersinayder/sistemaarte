import { describe, expect, it } from 'vitest';
import fs from 'fs';

describe('nfe inutilizacao database schema', () => {
  it('declares auditable invalidation table and lookup indexes', () => {
    const source = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS nfe_inutilizacoes/);
    expect(source).toMatch(/ambiente\s+INTEGER NOT NULL/);
    expect(source).toMatch(/ano\s+INTEGER NOT NULL/);
    expect(source).toMatch(/modelo\s+TEXT NOT NULL DEFAULT '55'/);
    expect(source).toMatch(/numero_inicial\s+INTEGER NOT NULL/);
    expect(source).toMatch(/numero_final\s+INTEGER NOT NULL/);
    expect(source).toMatch(/xml_envio\s+TEXT/);
    expect(source).toMatch(/xml_retorno\s+TEXT/);
    expect(source).toMatch(/idempotency_key\s+TEXT NOT NULL UNIQUE/);
    expect(source).toMatch(/idx_nfe_inutilizacoes_contexto/);
    expect(source).toMatch(/idx_nfe_inutilizacoes_status/);
    expect(source).toMatch(/idx_nfe_inutilizacoes_faixa/);
  });
});
