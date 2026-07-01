import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const databaseSource = fs.readFileSync(new URL('../database.js', import.meta.url), 'utf8');

describe('nfe_notas database schema', () => {
  it('declares canonical NF-e note and item tables', () => {
    expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS nfe_notas/);
    expect(databaseSource).toMatch(/origem\s+TEXT NOT NULL/);
    expect(databaseSource).toMatch(/ordemid\s+INTEGER DEFAULT NULL/);
    expect(databaseSource).toMatch(/cliente_snapshot\s+TEXT NOT NULL/);
    expect(databaseSource).toMatch(/emitente_snapshot\s+TEXT NOT NULL/);
    expect(databaseSource).toMatch(/informacoes_complementares\s+TEXT/);
    expect(databaseSource).toMatch(/CREATE TABLE IF NOT EXISTS nfe_itens/);
    expect(databaseSource).toMatch(/nfeid\s+INTEGER NOT NULL/);
    expect(databaseSource).toMatch(/origem_fiscal\s+TEXT NOT NULL DEFAULT '0'/);
  });

  it('adds indexes needed by list, key lookup, trash, sequence checks, and events', () => {
    expect(databaseSource).toMatch(/idx_nfe_notas_chave/);
    expect(databaseSource).toMatch(/idx_nfe_notas_origem_ordemid/);
    expect(databaseSource).toMatch(/idx_nfe_notas_status/);
    expect(databaseSource).toMatch(/idx_nfe_notas_deletedat/);
    expect(databaseSource).toMatch(/idx_nfe_notas_numero_serie_ambiente/);
    expect(databaseSource).toMatch(/idx_nfe_itens_nfeid/);
    expect(databaseSource).toMatch(/idx_nfe_eventos_nfeid/);
  });

  it('keeps legacy ordem NF-e columns in phase 1', () => {
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_numero TEXT/);
    expect(databaseSource).toMatch(/ALTER TABLE ordens ADD COLUMN nfe_xml TEXT/);
    expect(databaseSource).toMatch(/ALTER TABLE nfe_notas ADD COLUMN informacoes_complementares TEXT/);
    expect(databaseSource).not.toMatch(/DROP COLUMN nfe_/);
  });

  it('runs the phase 1 legacy backfill after NF-e note migrations', () => {
    expect(databaseSource).toMatch(/backfillNfeNotasFromOrdens/);
    expect(databaseSource).toMatch(/Falha ao executar backfill inicial de NF-e/);
    expect(databaseSource.indexOf('for (const sql of migrations)')).toBeLessThan(
      databaseSource.indexOf('backfillNfeNotasFromOrdens')
    );
  });
});
