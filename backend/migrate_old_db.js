#!/usr/bin/env node
/**
 * migrate_old_db.js
 * Detecta variações de nome de colunas e padroniza o banco para o schema v2.
 * Seguro: todas as operações são idempotentes.
 * Uso: node migrate_old_db.js
 */
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_FILE  = path.join(__dirname, 'data', 'oficina.db');
const BAK_FILE = DB_FILE + '.bak_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

if (!fs.existsSync(DB_FILE)) {
  console.error('Banco não encontrado em', DB_FILE);
  process.exit(1);
}

fs.copyFileSync(DB_FILE, BAK_FILE);
console.log('Backup criado:', BAK_FILE);

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

function cols(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
}

function renameColumnSafe(table, oldName, newName) {
  const allCols = cols(table);
  if (!allCols.includes(oldName)) {
    if (allCols.includes(newName)) console.log(`  OK  ${table}.${newName} já existe`);
    else console.warn(`  --  ${table}.${oldName} não encontrado, pulando`);
    return;
  }
  if (allCols.includes(newName)) {
    console.warn(`  !!  ${table}: ambas "${oldName}" e "${newName}" existem — verifique manualmente`);
    return;
  }
  console.log(`  ->  ${table}: "${oldName}" → "${newName}"`);
  db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName};`);
}

function addColIfMissing(table, col, def) {
  if (!cols(table).includes(col)) {
    console.log(`  ++  ${table}: adicionando "${col}"`);
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
  }
}

console.log('\nSchema atual:');
['users','clientes','ordens','lancamentos','statuslog'].forEach(t => {
  try { console.log(`  ${t}: [${cols(t).join(', ')}]`); }
  catch(e) { console.log(`  ${t}: NÃO EXISTE`); }
});

console.log('\nIniciando migrações...\n');

db.transaction(() => {
  renameColumnSafe('ordens', 'valor_total',      'valortotal');
  renameColumnSafe('ordens', 'valor_entrada',    'valorentrada');
  renameColumnSafe('ordens', 'created_at',       'createdat');
  renameColumnSafe('ordens', 'updated_at',       'updatedat');
  renameColumnSafe('ordens', 'criado_por',       'criadopor');
  renameColumnSafe('ordens', 'prazo_entrega',    'prazoentrega');
  renameColumnSafe('ordens', 'cliente_id',       'clienteid');
  renameColumnSafe('ordens', 'cliente_nome',     'clientenome');
  renameColumnSafe('ordens', 'cliente_telefone', 'clientetelefone');
  renameColumnSafe('ordens', 'cliente_cpf',      'clientecpf');
  addColIfMissing('ordens', 'pagamento',   "TEXT DEFAULT 'Pix'");
  addColIfMissing('ordens', 'prioridade',  "TEXT DEFAULT 'Normal'");
  addColIfMissing('ordens', 'observacoes', 'TEXT');
  addColIfMissing('ordens', 'updatedat',   "TEXT DEFAULT (datetime('now','localtime'))");

  renameColumnSafe('lancamentos', 'ordem_id',   'ordemid');
  renameColumnSafe('lancamentos', 'criado_por', 'criadopor');
  renameColumnSafe('lancamentos', 'created_at', 'createdat');
  addColIfMissing('lancamentos', 'origem', 'TEXT DEFAULT NULL');
  addColIfMissing('lancamentos', 'pago',   'INTEGER DEFAULT 1');

  renameColumnSafe('statuslog', 'ordem_id',        'ordemid');
  renameColumnSafe('statuslog', 'usuario_id',      'usuarioid');
  renameColumnSafe('statuslog', 'created_at',      'createdat');
  renameColumnSafe('statuslog', 'status_anterior', 'statusanterior');
  renameColumnSafe('statuslog', 'status_novo',     'statusnovo');

  renameColumnSafe('users', 'created_at', 'createdat');
  addColIfMissing('users', 'active', 'INTEGER DEFAULT 1');

  renameColumnSafe('clientes', 'created_at', 'createdat');
  addColIfMissing('clientes', 'ie',     'TEXT');
  addColIfMissing('clientes', 'cidade', 'TEXT');
  addColIfMissing('clientes', 'uf',     'TEXT');
  addColIfMissing('clientes', 'cep',    'TEXT');
  addColIfMissing('clientes', 'notes',  'TEXT');
})();

console.log('\nSchema após migração:');
['users','clientes','ordens','lancamentos','statuslog'].forEach(t => {
  try { console.log(`  ${t}: [${cols(t).join(', ')}]`); }
  catch(e) { console.log(`  ${t}: NÃO EXISTE`); }
});

db.close();
console.log('\nMigração concluída! Banco pronto para o servidor v2.\n');
