
const Database = require("better-sqlite3");
const bcrypt   = require("bcryptjs");
const path     = require("path");
const fs       = require("fs");

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE  = path.join(DATA_DIR, "oficina.db");
fs.mkdirSync(DATA_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  username  TEXT    UNIQUE NOT NULL,
  password  TEXT    NOT NULL,
  role      TEXT    NOT NULL,
  active    INTEGER DEFAULT 1,
  createdat TEXT    DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  cpf        TEXT,
  ie         TEXT,
  address    TEXT,
  cidade     TEXT,
  uf         TEXT,
  cep        TEXT,
  notes      TEXT,
  createdat  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS ordens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero          TEXT UNIQUE NOT NULL,
  clienteid       INTEGER,
  clientenome     TEXT NOT NULL,
  clientetelefone TEXT,
  clientecpf      TEXT,
  servico         TEXT NOT NULL,
  descricao       TEXT,
  valortotal      REAL NOT NULL DEFAULT 0,
  valorentrada    REAL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Recebido',
  prioridade      TEXT DEFAULT 'Normal',
  prazoentrega    TEXT,
  pagamento       TEXT DEFAULT 'Pix',
  observacoes     TEXT,
  criadopor       INTEGER,
  createdat       TEXT DEFAULT (datetime('now','localtime')),
  updatedat       TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS lancamentos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  data       TEXT NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'Diversos',
  descricao  TEXT NOT NULL,
  pagamento  TEXT NOT NULL,
  valor      REAL NOT NULL,
  pago       INTEGER DEFAULT 1,
  ordemid    INTEGER,
  criadopor  INTEGER,
  origem     TEXT DEFAULT NULL,
  createdat  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS statuslog (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid        INTEGER,
  statusanterior TEXT,
  statusnovo     TEXT NOT NULL,
  usuarioid      INTEGER,
  obs            TEXT,
  createdat      TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ordens_status       ON ordens(status);
CREATE INDEX IF NOT EXISTS idx_ordens_prazo        ON ordens(prazoentrega);
CREATE INDEX IF NOT EXISTS idx_ordens_clienteid    ON ordens(clienteid);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data    ON lancamentos(data);
CREATE INDEX IF NOT EXISTS idx_lancamentos_ordemid ON lancamentos(ordemid);
CREATE INDEX IF NOT EXISTS idx_statuslog_ordemid   ON statuslog(ordemid);
`;

let db;

function initDB() {
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  // Migrations idempotentes
  const migrations = [
    "ALTER TABLE ordens     ADD COLUMN pagamento   TEXT DEFAULT 'Pix'",
    "ALTER TABLE ordens     ADD COLUMN prioridade  TEXT DEFAULT 'Normal'",
    "ALTER TABLE ordens     ADD COLUMN observacoes TEXT",
    "ALTER TABLE ordens     ADD COLUMN updatedat   TEXT DEFAULT (datetime('now','localtime'))",
    "ALTER TABLE clientes   ADD COLUMN ie          TEXT",
    "ALTER TABLE clientes   ADD COLUMN cidade      TEXT",
    "ALTER TABLE clientes   ADD COLUMN uf          TEXT",
    "ALTER TABLE clientes   ADD COLUMN cep         TEXT",
    "ALTER TABLE clientes   ADD COLUMN notes       TEXT",
    "ALTER TABLE lancamentos ADD COLUMN origem     TEXT DEFAULT NULL",
    "ALTER TABLE lancamentos ADD COLUMN pago       INTEGER DEFAULT 1",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) {}
  }

  // Seed SOMENTE em desenvolvimento
  if (process.env.NODE_ENV !== "production") {
    const existing = db.prepare("SELECT id FROM users WHERE role=?").get("admin");
    if (!existing) {
      const stmt = db.prepare(
        "INSERT INTO users (name,username,password,role) VALUES (?,?,?,?)"
      );
      const seed = [
        ["Administrador","admin","admin123","admin"],
        ["Caixa","caixa","caixa123","caixa"],
        ["Oficina","oficina","oficina123","oficina"],
      ];
      for (const [name,username,pw,role] of seed) {
        stmt.run(name, username, bcrypt.hashSync(pw,10), role);
      }
      console.log("[DB] Usuários padrão criados (somente dev)");
    }
  }

  console.log(`[DB] Banco inicializado: ${DB_FILE}`);
  return db;
}

const run       = (sql, params=[]) => db.prepare(sql).run(...(Array.isArray(params)?params:[params]));
const runInsert = (sql, params=[]) => db.prepare(sql).run(...(Array.isArray(params)?params:[params])).lastInsertRowid;
const getAll    = (sql, params=[]) => db.prepare(sql).all(...(Array.isArray(params)?params:[params]));
const getOne    = (sql, params=[]) => db.prepare(sql).get(...(Array.isArray(params)?params:[params])) ?? null;
const transaction = (fn) => db.transaction(fn)();

function backup() {
  const now   = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
  const bdir  = path.join(DATA_DIR,"backups");
  fs.mkdirSync(bdir,{recursive:true});
  const dest  = path.join(bdir,`backup-${now}.db`);
  return db.backup(dest).then(()=>{
    const files = fs.readdirSync(bdir).filter(f=>f.endsWith(".db")).sort();
    while (files.length > 7) fs.unlinkSync(path.join(bdir,files.shift()));
    console.log("[Backup] Salvo:",dest);
  }).catch(e=>console.error("[Backup] Erro:",e.message));
}

module.exports = { initDB, run, runInsert, getAll, getOne, transaction, backup };
