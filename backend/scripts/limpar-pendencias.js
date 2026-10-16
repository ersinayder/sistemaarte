const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/oficina.db');
console.log('Abrindo banco de dados em:', dbPath);

const db = new Database(dbPath);

// 1. Liberar tentativas que não foram autorizadas garantindo que o número seja reutilizável
const r1 = db.prepare(`
  UPDATE nfe_emissao_tentativas 
  SET status = 'falha_local', cstat = 'falha_local', motivo = 'Liberado para correcao e reemissao', updatedat = datetime('now', 'localtime') 
  WHERE status IN ('incerto', 'processando')
`).run();

// 2. Marcar notas na tabela nfe_notas como 'rejeitada' se estiverem como 'incerto' ou 'emitindo' (não autorizadas)
const r2 = db.prepare(`
  UPDATE nfe_notas 
  SET status = 'rejeitada', updatedat = datetime('now', 'localtime') 
  WHERE status IN ('emitindo', 'incerto')
`).run();

// 3. Atualizar status na tabela ordens se estiver como 'emitindo' ou 'incerto'
let r3 = { changes: 0 };
const hasOrdensNfeStatus = db.prepare("PRAGMA table_info(ordens)").all().some(c => c.name === 'nfe_status');
if (hasOrdensNfeStatus) {
  r3 = db.prepare(`
    UPDATE ordens 
    SET nfe_status = 'rejeitada' 
    WHERE nfe_status IN ('emitindo', 'incerto')
  `).run();
}

console.log('----------------------------------------');
console.log('✅ Tentativas incertas liberadas:', r1.changes);
console.log('✅ Notas pendentes liberadas:', r2.changes);
console.log('✅ Ordens com status pendente liberadas:', r3.changes);

// 4. Se informou uma OS específica como argumento (ex: node scripts/limpar-pendencias.js 623)
const osParam = process.argv[2];
if (osParam) {
  const osClean = osParam.replace(/\D/g, '');
  const ordem = db.prepare("SELECT id, numero FROM ordens WHERE id = ? OR numero = ? OR numero LIKE ?").get(osParam, osParam, `%${osClean}%`);
  if (ordem) {
    if (hasOrdensNfeStatus) {
      db.prepare("UPDATE ordens SET nfe_status = NULL WHERE id = ?").run(ordem.id);
    }
    db.prepare("UPDATE nfe_emissao_tentativas SET status = 'falha_local', motivo = 'Reset manual para reemissao' WHERE ordemid = ? AND status != 'autorizado'").run(ordem.id);
    db.prepare("UPDATE nfe_notas SET status = 'rejeitada' WHERE ordemid = ? AND status != 'autorizada'").run(ordem.id);
    console.log(`✅ OS ${ordem.numero} (ID ${ordem.id}) resetada com sucesso para nova emissão!`);
  } else {
    console.log(`⚠️ OS "${osParam}" não encontrada no banco.`);
  }
}
console.log('----------------------------------------');
db.close();
