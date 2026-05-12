const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'oficina.db'));

const cols = db.prepare('PRAGMA table_info(clientes)').all().map(c => c.name);
console.log('Colunas atuais:', cols.join(', '));

const sqls = [
  'ALTER TABLE clientes ADD COLUMN logradouro TEXT',
  'ALTER TABLE clientes ADD COLUMN numero TEXT',
  'ALTER TABLE clientes ADD COLUMN bairro TEXT',
  "UPDATE clientes SET logradouro = address WHERE logradouro IS NULL AND address IS NOT NULL",
];

for (const sql of sqls) {
  try { db.exec(sql); console.log('OK:', sql.substring(0, 60)); }
  catch(e) { console.log('Skip:', e.message.substring(0, 70)); }
}

const after = db.prepare('PRAGMA table_info(clientes)').all().map(c => c.name);
console.log('Colunas finais:', after.join(', '));
db.close();
