const { initDB, run } = require('./database');
initDB();
const r = run("UPDATE ordens SET status='Aguardando' WHERE status='Recebido'");
console.log('OS corrigidas:', r.changes);
