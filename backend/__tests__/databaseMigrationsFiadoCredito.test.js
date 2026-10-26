import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const database = await import("../database.js");
const { PERMISSIONS, DEFAULT_PROFILE_PERMISSIONS } = await import("../domain/permissionRules.js");

const NOVAS_PERMISSOES = [
  "clientes.fiado.gerenciar",
  "clientes.credito.ver",
  "clientes.credito.usar",
  "clientes.credito.ajustar",
  "clientes.credito.devolver",
  "clientes.acerto.receber",
  "ordens.entregar_fiado",
  "ordens.entregar_acima_limite",
];

const PERMISSOES_CAIXA_NOVAS = [
  "clientes.credito.ver",
  "clientes.credito.usar",
  "clientes.acerto.receber",
  "ordens.entregar_fiado",
];

describe("Migrações e Permissões de Fiado e Crédito Loja (Task 1)", () => {
  it("contém todas as novas permissões no domínio de permissões", () => {
    for (const perm of NOVAS_PERMISSOES) {
      expect(PERMISSIONS).toContain(perm);
      expect(DEFAULT_PROFILE_PERMISSIONS.admin).toContain(perm);
    }
    for (const perm of PERMISSOES_CAIXA_NOVAS) {
      expect(DEFAULT_PROFILE_PERMISSIONS.caixa).toContain(perm);
    }
    for (const perm of NOVAS_PERMISSOES) {
      expect(DEFAULT_PROFILE_PERMISSIONS.oficina).not.toContain(perm);
    }
  });

  it("registra migrações das novas colunas e tabelas no código de database.js", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "database.js"), "utf8");
    expect(source).toMatch(/ALTER TABLE clientes ADD COLUMN fiado_ativo INTEGER DEFAULT 0/);
    expect(source).toMatch(/ALTER TABLE clientes ADD COLUMN fiado_limite REAL DEFAULT NULL/);
    expect(source).toMatch(/ALTER TABLE lancamentos ADD COLUMN clienteid INTEGER DEFAULT NULL/);
    expect(source).toMatch(/ALTER TABLE lancamentos ADD COLUMN acerto_id INTEGER DEFAULT NULL/);
    expect(source).toMatch(/ALTER TABLE empresa_config ADD COLUMN chave_pix TEXT DEFAULT NULL/);
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS cliente_credito_movimentos/);
    expect(source).toMatch(/CREATE TABLE IF NOT EXISTS cliente_acertos/);
  });

  it("executa seedPermissionProfiles fazendo backfill das novas permissões para admin e caixa mesmo se perfis já existirem", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE permission_profiles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        key         TEXT    UNIQUE NOT NULL,
        name        TEXT    NOT NULL,
        description TEXT,
        base_role   TEXT,
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

    // Inserir perfis existentes previamente (simulando produção antes desta migração)
    const adminId = db.prepare(`
      INSERT INTO permission_profiles (key, name, description, base_role, system, active)
      VALUES ('admin', 'Administrador', 'Perfil legado', 'admin', 1, 1)
    `).run().lastInsertRowid;

    const caixaId = db.prepare(`
      INSERT INTO permission_profiles (key, name, description, base_role, system, active)
      VALUES ('caixa', 'Operador de Caixa', 'Perfil legado', 'caixa', 1, 1)
    `).run().lastInsertRowid;

    // Dar apenas 1 permissão antiga
    db.prepare("INSERT INTO profile_permissions (profile_id, permission) VALUES (?, 'clientes.ver')").run(adminId);
    db.prepare("INSERT INTO profile_permissions (profile_id, permission) VALUES (?, 'clientes.ver')").run(caixaId);

    // Executar seedPermissionProfiles
    database.seedPermissionProfiles(db);

    // Verificar se as novas permissões foram adicionadas ao admin
    for (const perm of NOVAS_PERMISSOES) {
      const row = db.prepare("SELECT 1 FROM profile_permissions WHERE profile_id=? AND permission=?").get(adminId, perm);
      expect(row, `admin deveria ter ${perm}`).toBeTruthy();
    }

    // Verificar se as novas permissões do caixa foram adicionadas
    for (const perm of PERMISSOES_CAIXA_NOVAS) {
      const row = db.prepare("SELECT 1 FROM profile_permissions WHERE profile_id=? AND permission=?").get(caixaId, perm);
      expect(row, `caixa deveria ter ${perm}`).toBeTruthy();
    }

    // Permissões restritas do admin NÃO devem estar no caixa
    expect(db.prepare("SELECT 1 FROM profile_permissions WHERE profile_id=? AND permission='clientes.fiado.gerenciar'").get(caixaId)).toBeFalsy();
    expect(db.prepare("SELECT 1 FROM profile_permissions WHERE profile_id=? AND permission='clientes.credito.devolver'").get(caixaId)).toBeFalsy();

    // Idempotência: rodar novamente não duplica nem lança erro
    expect(() => database.seedPermissionProfiles(db)).not.toThrow();
  });
});
