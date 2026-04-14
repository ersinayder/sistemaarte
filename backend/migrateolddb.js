
/**
 * migrate_old_db.js
 * Migra o banco antigo (sql.js / snake_case variado) para o novo schema.
 * Execute UMA ÚNICA VEZ: node migrateolddb.js
 */
const path     = require("path");
const fs       = require("fs");
const Database = require("better-sqlite3");

const OLD = path.join(__dirname,"data","oficina.db");
const BACKUP = OLD.replace(".db",`-pre-migração-${Date.now()}.db`);

if (!fs.existsSync(OLD)) {
  console.log("Nenhum banco antigo encontrado. Iniciando do zero — OK.");
  process.exit(0);
}

// Backup de segurança
fs.copyFileSync(OLD, BACKUP);
console.log("Backup salvo em:", BACKUP);

const db = new Database(OLD);
db.pragma("journal_mode = WAL");

// ── Helpers ───────────────────────────────────────────────────────────────────
function columnExists(table, col) {
  return db.pragma(`table_info(${table})`).some(r => r.name === col);
}
function safeAdd(table, col, def) {
  if (!columnExists(table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`  ADD ${table}.${col}`);
  }
}
function safeRename(table, oldCol, newCol, def) {
  // SQLite >= 3.25 suporta RENAME COLUMN
  if (columnExists(table, oldCol) && !columnExists(table, newCol)) {
    try {
      db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`);
      console.log(`  RENAME ${table}.${oldCol} → ${newCol}`);
    } catch {
      // Fallback: add + copy + NOT a real drop (SQLite limitação)
      safeAdd(table, newCol, def);
      db.exec(`UPDATE ${table} SET ${newCol} = ${oldCol}`);
      console.log(`  COPY ${table}.${oldCol} → ${newCol} (sem drop)`);
    }
  }
}

// ── ordens ────────────────────────────────────────────────────────────────────
safeRename("ordens","valor_total",   "valortotal",   "REAL NOT NULL DEFAULT 0");
safeRename("ordens","valor_entrada", "valorentrada", "REAL DEFAULT 0");
safeRename("ordens","created_at",    "createdat",    "TEXT");
safeRename("ordens","updated_at",    "updatedat",    "TEXT");
safeRename("ordens","criado_por",    "criadopor",    "INTEGER");
safeAdd   ("ordens","prioridade",    "TEXT DEFAULT 'Normal'");
safeAdd   ("ordens","pagamento",     "TEXT DEFAULT 'Pix'");
safeAdd   ("ordens","observacoes",   "TEXT");
safeAdd   ("ordens","updatedat",     "TEXT DEFAULT (datetime('now','localtime'))");

// ── lancamentos ───────────────────────────────────────────────────────────────
safeRename("lancamentos","ordem_id",  "ordemid",   "INTEGER");
safeRename("lancamentos","criado_por","criadopor", "INTEGER");
safeRename("lancamentos","created_at","createdat", "TEXT");
safeAdd   ("lancamentos","pago",      "INTEGER DEFAULT 1");
safeAdd   ("lancamentos","origem",    "TEXT DEFAULT NULL");

// Marca entradas automáticas de OS (lançamentos cujo tipo == servico da OS vinculada)
db.exec(`
  UPDATE lancamentos SET origem='entradaos'
  WHERE origem IS NULL AND ordemid IS NOT NULL
    AND id IN (
      SELECT l.id FROM lancamentos l
      INNER JOIN ordens o ON o.id=l.ordemid
      WHERE (l.tipo=o.servico OR l.descricao LIKE 'Entrada%')
      ORDER BY l.id
    )
`);

// ── statuslog ─────────────────────────────────────────────────────────────────
safeRename("statuslog","ordem_id",      "ordemid",        "INTEGER");
safeRename("statuslog","usuario_id",    "usuarioid",       "INTEGER");
safeRename("statuslog","status_anterior","statusanterior", "TEXT");
safeRename("statuslog","status_novo",   "statusnovo",      "TEXT NOT NULL DEFAULT ''");
safeRename("statuslog","created_at",    "createdat",       "TEXT");

// ── clientes ──────────────────────────────────────────────────────────────────
safeRename("clientes","created_at","createdat","TEXT");
safeAdd   ("clientes","ie",     "TEXT");
safeAdd   ("clientes","cidade", "TEXT");
safeAdd   ("clientes","uf",     "TEXT");
safeAdd   ("clientes","cep",    "TEXT");
safeAdd   ("clientes","notes",  "TEXT");

// ── users ─────────────────────────────────────────────────────────────────────
safeRename("users","created_at","createdat","TEXT");

// ── índices ───────────────────────────────────────────────────────────────────
const indexes = [
  "CREATE INDEX IF NOT EXISTS idx_ordens_status       ON ordens(status)",
  "CREATE INDEX IF NOT EXISTS idx_ordens_prazo        ON ordens(prazoentrega)",
  "CREATE INDEX IF NOT EXISTS idx_ordens_clienteid    ON ordens(clienteid)",
  "CREATE INDEX IF NOT EXISTS idx_lancamentos_data    ON lancamentos(data)",
  "CREATE INDEX IF NOT EXISTS idx_lancamentos_ordemid ON lancamentos(ordemid)",
  "CREATE INDEX IF NOT EXISTS idx_statuslog_ordemid   ON statuslog(ordemid)",
];
for (const sql of indexes) { try { db.exec(sql); } catch {} }

db.close();
console.log("\n✅ Migração concluída com sucesso.\n   Inicie o servidor normalmente: node server.js\n");
