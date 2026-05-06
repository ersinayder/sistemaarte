/**
 * Setup global de testes.
 * Cria um banco SQLite in-memory por suite e expõe via globalThis.
 * NUNCA toca no arquivo oficina.db de produção.
 */
import Database from 'better-sqlite3'

// Schema mínimo — espelha as tabelas usadas pelos testes
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT    NOT NULL,
    usuario   TEXT    NOT NULL UNIQUE,
    senha     TEXT    NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'caixa',
    ativo     INTEGER NOT NULL DEFAULT 1,
    createdat TEXT    DEFAULT (datetime('now')),
    updatedat TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ordens (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    numero        TEXT,
    cliente       TEXT,
    telefone      TEXT,
    total         REAL    NOT NULL DEFAULT 0,
    entrada       REAL    NOT NULL DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'Aguardando',
    observacoes   TEXT,
    prazoentrega  TEXT,
    datarecebimento TEXT,
    createdat     TEXT    DEFAULT (datetime('now')),
    updatedat     TEXT    DEFAULT (datetime('now')),
    deletedat     TEXT    DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS caixa (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao   TEXT    NOT NULL,
    valor       REAL    NOT NULL,
    tipo        TEXT    NOT NULL CHECK(tipo IN ('entrada','saida')),
    categoria   TEXT,
    pagamento   TEXT,
    pago        INTEGER NOT NULL DEFAULT 1,
    ordemid     INTEGER REFERENCES ordens(id),
    tipolancamento TEXT,
    data        TEXT    NOT NULL DEFAULT (date('now')),
    createdat   TEXT    DEFAULT (datetime('now')),
    deletedat   TEXT    DEFAULT NULL
  );
`

/**
 * Cria e retorna um banco in-memory com o schema aplicado.
 * Cada teste deve chamar esta função para obter um banco limpo.
 */
export function criarBancoTeste() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

/**
 * Insere um usuário admin padrão para testes que precisam de auth.
 */
export function inserirAdminTeste(db) {
  // senha: 'admin123' (hash bcrypt pré-calculado para não depender de bcrypt no setup)
  db.prepare(`
    INSERT INTO usuarios (nome, usuario, senha, role)
    VALUES ('Admin Teste', 'admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
  `).run()
}
