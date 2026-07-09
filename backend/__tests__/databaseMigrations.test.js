import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  it("documents RBAC schema objects in the database source", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "database.js"), "utf8");
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS permission_profiles/);
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS profile_permissions/);
    expect(source).toMatch(/ALTER TABLE users ADD COLUMN profile_key TEXT/);
    expect(source).toMatch(/ALTER TABLE users ADD COLUMN access_version INTEGER NOT NULL DEFAULT 1/);
    expect(source).toMatch(/UPDATE users SET profile_key=role WHERE profile_key IS NULL/);
  });

  it("exports a seed helper for default permission profiles", () => {
    expect(typeof database.seedPermissionProfiles).toBe("function");
  });
});
