import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';

process.env.JWT_SECRET = 'test-e2e-fiado-credito';

let sqlite;
const dbMock = {
  getOne: (sql, p = []) => sqlite.prepare(sql).get(...(Array.isArray(p) ? p : [p])),
  getAll: (sql, p = []) => sqlite.prepare(sql).all(...(Array.isArray(p) ? p : [p])),
  run: (sql, p = []) => sqlite.prepare(sql).run(...(Array.isArray(p) ? p : [p])),
  runInsert: (sql, p = []) => sqlite.prepare(sql).run(...(Array.isArray(p) ? p : [p])).lastInsertRowid,
  transaction: (fn) => sqlite.transaction(fn)(),
  getDB: () => sqlite,
};

const require = createRequire(import.meta.url);
const dbModulePath = require.resolve('../database.js');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: dbMock,
};

const { createClienteAcertoService } = await import('../services/clienteAcertoService.js');
const { createClienteCreditoService } = await import('../services/clienteCreditoService.js');
const { getResumoFinanceiroOS } = await import('../domain/financeiroRules.js');
const { validarEntregaComSaldo } = await import('../domain/clienteFiadoRules.js');
const { getContasReceberPayload } = await import('../services/financeiroReceberService.js');
const { auditarIntegridadeFinanceiraOS } = await import('../services/financeiroIntegridadeService.js');

describe('Task 11: Validacao End-to-End de Fiado e Credito Loja', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS empresa_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        nomefantasia TEXT,
        chave_pix TEXT
      );
      INSERT INTO empresa_config (id, nomefantasia, chave_pix) VALUES (1, 'Arte e Molduras Oficial', 'pix@arteemolduras.com.br');

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'caixa'
      );
      INSERT INTO users (id, username, name, role) VALUES (1, 'admin', 'Administrador', 'admin');

      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        fiado_ativo INTEGER DEFAULT 0,
        fiado_limite REAL DEFAULT 0,
        deletedat TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        clienteid INTEGER NOT NULL,
        clientenome TEXT NOT NULL,
        servico TEXT NOT NULL DEFAULT 'Moldura',
        valortotal REAL NOT NULL,
        valorentrada REAL DEFAULT 0,
        pagamento TEXT DEFAULT 'Pix',
        status TEXT NOT NULL DEFAULT 'Aguardando',
        prazoentrega TEXT,
        createdat TEXT DEFAULT (datetime('now','localtime')),
        deletedat TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS lancamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'Entrada',
        categoria TEXT DEFAULT NULL,
        descricao TEXT NOT NULL,
        pagamento TEXT NOT NULL,
        valor REAL NOT NULL,
        pago INTEGER DEFAULT 1,
        ordemid INTEGER,
        clienteid INTEGER,
        criadopor INTEGER,
        origem TEXT DEFAULT NULL,
        acerto_id INTEGER DEFAULT NULL,
        conta_pagar_id INTEGER DEFAULT NULL,
        deletedat TEXT DEFAULT NULL,
        deletedpor INTEGER DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS cliente_acertos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clienteid INTEGER NOT NULL,
        valor_total REAL NOT NULL,
        pagamento TEXT NOT NULL,
        estornado_em TEXT DEFAULT NULL,
        estornado_por INTEGER DEFAULT NULL,
        criadopor INTEGER NOT NULL,
        createdat TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS cliente_credito_movimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clienteid INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL,
        ordemid INTEGER DEFAULT NULL,
        lancamentoid INTEGER DEFAULT NULL,
        estorna_id INTEGER DEFAULT NULL,
        motivo TEXT DEFAULT NULL,
        criadopor INTEGER NOT NULL,
        createdat TEXT DEFAULT (datetime('now','localtime'))
      );

      CREATE TABLE IF NOT EXISTS contas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor TEXT,
        descricao TEXT,
        categoria TEXT,
        valor REAL,
        vencimento TEXT,
        pagoem TEXT,
        status TEXT DEFAULT 'Pendente',
        deletedat TEXT DEFAULT NULL
      );
    `);
  });

  it('executa o ciclo de vida completo: fiado, cobranca pix, acerto em lote, credito por excedente, uso e devolucao', () => {
    const acertoService = createClienteAcertoService({ db: sqlite });
    const creditoService = createClienteCreditoService({ db: sqlite });

    // 1. Cadastra cliente habilitado para fiado com limite de R$ 1.000,00
    const clienteRes = sqlite.prepare(`
      INSERT INTO clientes (name, phone, fiado_ativo, fiado_limite)
      VALUES ('Galeria Arte Moderna', '41999998888', 1, 1000.00)
    `).run();
    const clienteId = clienteRes.lastInsertRowid;

    // 2. Cria OS-1 (R$ 300 com entrada de R$ 100 via Pix -> saldo devedor R$ 200)
    const os1Res = sqlite.prepare(`
      INSERT INTO ordens (numero, clienteid, clientenome, servico, valortotal, valorentrada, status)
      VALUES ('OS-001', ?, 'Galeria Arte Moderna', 'Moldura Nobre', 300.00, 100.00, 'Pronto')
    `).run(clienteId);
    const os1Id = os1Res.lastInsertRowid;

    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, descricao, pagamento, valor, pago, ordemid, clienteid, criadopor, origem)
      VALUES ('2026-10-26', 'Entrada', 'Entrada OS-001', 'Pix', 100.00, 1, ?, ?, 1, 'entradaos')
    `).run(os1Id, clienteId);

    // Cria OS-2 (R$ 250 sem entrada -> saldo devedor R$ 250)
    const os2Res = sqlite.prepare(`
      INSERT INTO ordens (numero, clienteid, clientenome, servico, valortotal, valorentrada, status)
      VALUES ('OS-002', ?, 'Galeria Arte Moderna', 'Gravura Especial', 250.00, 0, 'Pronto')
    `).run(clienteId);
    const os2Id = os2Res.lastInsertRowid;

    // Total devedor = R$ 450,00 (dentro do limite de R$ 1.000,00)
    const checagemFiado = validarEntregaComSaldo({
      saldoOrdem: 450,
      cliente: { id: clienteId, fiado_ativo: 1, fiado_limite: 1000 },
      dividaAtualCliente: 0,
      usuario: { id: 1, role: 'admin', permissions: ['*'] },
    });
    expect(checagemFiado.ok).toBe(true);

    // Entrega ambas as OSs com saldo em aberto (entrega fiado)
    sqlite.prepare("UPDATE ordens SET status = 'Entregue' WHERE id IN (?, ?)").run(os1Id, os2Id);

    // 3. Contas a Receber inclui ambas as ordens entregues no fiado
    const contasReceber = getContasReceberPayload();
    expect(contasReceber.length).toBe(2);
    const totalReceber = contasReceber.reduce((acc, i) => acc + i.saldo, 0);
    expect(totalReceber).toBe(450.00);
    expect(contasReceber.every((item) => item.status === 'Entregue')).toBe(true);

    // 4. Mensagem de cobrança no WhatsApp com chave Pix da loja
    const msg = acertoService.gerarMensagemCobranca({ clienteId });
    expect(msg.texto).toContain('Galeria Arte Moderna');
    expect(msg.texto).toContain('Arte e Molduras Oficial');
    expect(msg.texto).toContain('OS-001');
    expect(msg.texto).toContain('OS-002');
    expect(msg.texto).toContain('Total em aberto: R$ 450,00');
    expect(msg.texto).toContain('Pix: pix@arteemolduras.com.br');
    expect(msg.urlWhatsAppWeb).toContain('https://wa.me/5541999998888');

    // 5. Receber Acerto unificado de R$ 450,00 via Pix
    const acertoRes = acertoService.receberAcerto({
      clienteId,
      pagamento: 'Pix',
      ordem_ids: [os1Id, os2Id],
      valor_total_esperado: 450.00,
      usuarioId: 1,
    });
    expect(acertoRes.ok).toBe(true);
    expect(acertoRes.totalPago).toBe(450.00);
    expect(acertoRes.ordensAfetadas).toBe(2);

    // Verifica que o saldo oficial de ambas as OSs foi zerado
    const resumoOS1 = getResumoFinanceiroOS(os1Id);
    const resumoOS2 = getResumoFinanceiroOS(os2Id);
    expect(resumoOS1.saldo).toBe(0);
    expect(resumoOS2.saldo).toBe(0);

    // 6. Geração de Crédito Loja (Haver) por redução de escopo da OS-5
    // Cria OS-5: R$ 200 pagos antecipadamente no Pix
    const os5Res = sqlite.prepare(`
      INSERT INTO ordens (numero, clienteid, clientenome, servico, valortotal, valorentrada, status)
      VALUES ('OS-005', ?, 'Galeria Arte Moderna', 'Espelho Veneziano', 200.00, 200.00, 'Aguardando')
    `).run(clienteId);
    const os5Id = os5Res.lastInsertRowid;

    sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, descricao, pagamento, valor, pago, ordemid, clienteid, criadopor, origem)
      VALUES ('2026-10-26', 'Entrada', 'Entrada OS-005', 'Pix', 200.00, 1, ?, ?, 1, 'entradaos')
    `).run(os5Id, clienteId);

    // Escopo é reduzido para R$ 120 (excedente de R$ 80 destinado para crédito)
    sqlite.prepare('UPDATE ordens SET valortotal = 120.00 WHERE id = ?').run(os5Id);
    const lancCredito = sqlite.prepare(`
      INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago, ordemid, clienteid, criadopor, origem)
      VALUES ('2026-10-26', 'Saida', 'Ajuste de OS', 'Excedente de pagamento transformado em crédito loja', 'CreditoLoja', -80.00, 1, ?, ?, 1, 'credito_gerado')
    `).run(os5Id, clienteId);

    sqlite.prepare(`
      INSERT INTO cliente_credito_movimentos (clienteid, tipo, valor, ordemid, lancamentoid, criadopor)
      VALUES (?, 'gerado', 80.00, ?, ?, 1)
    `).run(clienteId, os5Id, lancCredito.lastInsertRowid);

    // Saldo da OS-5 com getResumoFinanceiroOS deve ser zero
    const resumoOS5 = getResumoFinanceiroOS(os5Id);
    expect(resumoOS5.saldo).toBe(0);

    // Extrato de crédito do cliente tem R$ 80,00 disponível
    const extrato1 = creditoService.getExtratoCredito(clienteId);
    expect(extrato1.saldo).toBe(80.00);

    // 7. Usar R$ 50,00 do crédito em uma nova OS-6 (R$ 150)
    const os6Res = sqlite.prepare(`
      INSERT INTO ordens (numero, clienteid, clientenome, servico, valortotal, valorentrada, status)
      VALUES ('OS-006', ?, 'Galeria Arte Moderna', 'Corte Passepartout', 150.00, 0, 'Aguardando')
    `).run(clienteId);
    const os6Id = os6Res.lastInsertRowid;

    const usoRes = creditoService.usarCreditoOS({
      ordemId: os6Id,
      clienteId,
      valor: 50.00,
      criadopor: 1,
    });
    expect(usoRes.saldoAtual).toBe(30.00);

    // Saldo restante da OS-6 passa a ser R$ 100,00
    const resumoOS6 = getResumoFinanceiroOS(os6Id);
    expect(resumoOS6.recebido).toBe(50.00);
    expect(resumoOS6.saldo).toBe(100.00);

    // 8. Devolver os R$ 30,00 restantes em dinheiro
    const devolucaoRes = creditoService.devolverCredito({
      clienteId,
      valor: 30.00,
      pagamento: 'Dinheiro',
      criadopor: 1,
    });
    expect(devolucaoRes.saldoAtual).toBe(0.00);

    const extratoFinal = creditoService.getExtratoCredito(clienteId);
    expect(extratoFinal.saldo).toBe(0.00);

    // 9. Auditoria de Integridade Financeira
    const todasOrdens = sqlite.prepare("SELECT id, numero, clientenome, valortotal, status FROM ordens WHERE deletedat IS NULL").all();
    const audit = auditarIntegridadeFinanceiraOS({
      ordens: todasOrdens,
      receberGerencial: getContasReceberPayload(),
      getResumoFinanceiroOS,
    });
    expect(audit.total).toBe(0);
    expect(audit.criticos).toBe(0);
    expect(audit.itens.length).toBe(0);
  });
});
