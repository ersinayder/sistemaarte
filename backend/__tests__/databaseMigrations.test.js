import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from 'better-sqlite3';
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

  it('throws duplicate-column errors outside ALTER TABLE ADD COLUMN migrations', () => {
    const db = {
      exec: vi.fn(() => {
        throw new Error('duplicate column name: x');
      }),
    };

    expect(() => database.runMigrationStatement(db, 'CREATE TABLE broken (x TEXT, x TEXT)'))
      .toThrow(/Falha ao aplicar migration: CREATE TABLE broken/);
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

  it('seeds default permission profiles idempotently without deleting extra permissions', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE permission_profiles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        key         TEXT    UNIQUE NOT NULL,
        name        TEXT    NOT NULL,
        description TEXT,
        system      INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        createdat   TEXT    DEFAULT (datetime('now','localtime')),
        updatedat   TEXT    DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE profile_permissions (
        profile_id INTEGER NOT NULL,
        permission TEXT    NOT NULL,
        createdat  TEXT    DEFAULT (datetime('now','localtime')),
        UNIQUE(profile_id, permission),
        FOREIGN KEY(profile_id) REFERENCES permission_profiles(id) ON DELETE CASCADE
      );
    `);

    try {
      database.seedPermissionProfiles(db);
      database.seedPermissionProfiles(db);

      const admin = db.prepare("SELECT id, name, system, active FROM permission_profiles WHERE key='admin'").get();
      expect(admin).toMatchObject({ name: 'Administrador', system: 1, active: 1 });

      const before = db.prepare("SELECT COUNT(*) AS total FROM profile_permissions WHERE profile_id=? AND permission='usuarios.ver'").get(admin.id);
      expect(before.total).toBe(1);

      db.prepare('INSERT INTO profile_permissions (profile_id, permission) VALUES (?, ?)').run(admin.id, 'custom.future_permission');
      database.seedPermissionProfiles(db);

      const custom = db.prepare("SELECT permission FROM profile_permissions WHERE profile_id=? AND permission='custom.future_permission'").get(admin.id);
      expect(custom).toEqual({ permission: 'custom.future_permission' });

      const duplicateCheck = db.prepare("SELECT COUNT(*) AS total FROM profile_permissions WHERE profile_id=? AND permission='usuarios.ver'").get(admin.id);
      expect(duplicateCheck.total).toBe(1);
    } finally {
      db.close();
    }
  });
});
