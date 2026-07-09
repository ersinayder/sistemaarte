import { describe, expect, it, vi } from 'vitest';

const database = await import('../database.js');

describe('database migrations', () => {
  it('ignores duplicate-column errors from already applied migrations', () => {
    const db = {
      exec: vi.fn(() => {
        throw new Error('duplicate column name: pagamento');
      }),
    };

    expect(() => database.runMigrationStatement(db, "ALTER TABLE ordens ADD COLUMN pagamento TEXT DEFAULT 'Pix'")).not.toThrow();
  });

  it('ignores the legacy clientes.address backfill when the source column is absent', () => {
    const db = {
      exec: vi.fn(() => {
        throw new Error('no such column: address');
      }),
    };

    expect(() => database.runMigrationStatement(
      db,
      'UPDATE clientes SET logradouro = address WHERE logradouro IS NULL AND address IS NOT NULL'
    )).not.toThrow();
  });

  it('throws unexpected migration errors instead of hiding them', () => {
    const db = {
      exec: vi.fn(() => {
        throw new Error('near "BROKEN": syntax error');
      }),
    };

    expect(() => database.runMigrationStatement(db, 'BROKEN SQL')).toThrow(/Falha ao aplicar migration: BROKEN SQL/);
  });
});
