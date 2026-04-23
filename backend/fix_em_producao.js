// Migration I-1: normaliza registros com status sem acento
// Executar UMA vez: node fix_em_producao.js
const { initDB, run } = require('./database');
initDB();
const r = run("UPDATE ordens SET status='Em Produ\u00e7\u00e3o' WHERE status='Em Producao'");
console.log('OS corrigidas:', r.changes);
