import { beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import {
  montarFechamentoCaixa,
  renderFechamentoCaixaHtml,
} from '../utils/print/caixaFechamento.js';
import { auditarIntegridadeFinanceiraOS } from '../services/financeiroIntegridadeService.js';

process.env.JWT_SECRET = 'test-financeiro-integracao';

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

const { getContasReceberPayload } = await import('../services/financeiroReceberService.js');
const financeiroModule = await import('../routes/financeiro.js');
const financeiroRouter = financeiroModule.default || financeiroModule;

function makeRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

function getRouteHandler(path, method = 'get') {
  const layer = financeiroRouter.stack.find(
    (entry) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

describe('Task 8: Integracao Financeira - Duas Visoes (Gaveta vs DRE / Fiado em Contas a Receber)', () => {
  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT,
        clientenome TEXT,
        clienteid INTEGER,
        status TEXT DEFAULT 'Aguardando',
        prazoentrega TEXT,
        valortotal REAL DEFAULT 0,
        deletedat TEXT DEFAULT NULL
      );

      CREATE TABLE clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        fiado_ativo INTEGER DEFAULT 0,
        fiado_limite REAL DEFAULT 0
      );

      CREATE TABLE lancamentos (
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
        acerto_id INTEGER,
        conta_pagar_id INTEGER,
        deletedat TEXT DEFAULT NULL
      );

      CREATE TABLE contas_pagar (
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

      CREATE TABLE cliente_credito_movimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL,
        ordem_id INTEGER,
        lancamento_id INTEGER,
        usuario_id INTEGER,
        motivo TEXT,
        estorna_id INTEGER,
        createdat TEXT DEFAULT (datetime('now','localtime'))
      );
    `);
  });

  describe('montarFechamentoCaixa', () => {
    it('exclui CreditoLoja da soma de gaveta fisica e isola no fechamento', () => {
      const lancamentos = [
        { id: 1, tipo: 'Entrada', pagamento: 'Dinheiro', valor: 100, descricao: 'Venda balcão' },
        { id: 2, tipo: 'Entrada', pagamento: 'Pix', valor: 80, descricao: 'Entrada OS-001' },
        { id: 3, tipo: 'Entrada', pagamento: 'CreditoLoja', valor: 50, descricao: 'Uso de Crédito Loja' },
        { id: 4, tipo: 'Saída', pagamento: 'Dinheiro', valor: 30, descricao: 'Compra lixa' },
        { id: 5, tipo: 'Saída', pagamento: 'Dinheiro', valor: 20, origem: 'credito_devolvido', descricao: 'Devolução de crédito em espécie' },
      ];

      const fechamento = montarFechamentoCaixa({ data: '2026-10-26', lancamentos });

      expect(fechamento.entrada).toBe(180);
      expect(fechamento.saida).toBe(50);
      expect(fechamento.saldo).toBe(130);
      expect(fechamento.totalCreditoLoja).toBe(50);

      const pagamentosGaveta = fechamento.entradasPorPagamento.map(p => p.pagamento);
      expect(pagamentosGaveta).toContain('Dinheiro');
      expect(pagamentosGaveta).toContain('Pix');
      expect(pagamentosGaveta).not.toContain('CreditoLoja');
    });

    it('renderiza secao informativa de Credito Loja Utilizado no HTML quando houver', () => {
      const lancamentos = [
        { id: 1, tipo: 'Entrada', pagamento: 'CreditoLoja', valor: 75.5, descricao: 'Pagamento com haver' },
        { id: 2, tipo: 'Entrada', pagamento: 'Dinheiro', valor: 100, descricao: 'Entrada normal' },
      ];

      const fechamento = montarFechamentoCaixa({ data: '2026-10-26', lancamentos });
      const html = renderFechamentoCaixaHtml({ data: '2026-10-26', fechamento, usuario: { name: 'Operador' } });

      expect(html).toContain('não entra na gaveta');
      expect(html).toContain('R$&nbsp;75,50');
    });
  });

  describe('getContasReceberPayload com OS Fiado Entregue', () => {
    it('inclui OS entregue com saldo em aberto (fiado) e ignora quitadas ou canceladas', () => {
      // 1. OS em produção com saldo (aparece)
      sqlite.prepare(`
        INSERT INTO ordens (id, numero, clientenome, clienteid, status, prazoentrega, valortotal)
        VALUES (1, 'OS-001', 'Cliente 1', 10, 'Em Produção', '2026-11-01', 500)
      `).run();
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, pagamento, valor, pago, ordemid, descricao)
        VALUES ('2026-10-20', 'Entrada', 'Pix', 200, 1, 1, 'Entrada')
      `).run();

      // 2. OS entregue com saldo (fiado - DEVE aparecer!)
      sqlite.prepare(`
        INSERT INTO ordens (id, numero, clientenome, clienteid, status, prazoentrega, valortotal)
        VALUES (2, 'OS-002', 'Cliente Fiado', 20, 'Entregue', '2026-10-25', 350)
      `).run();
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, pagamento, valor, pago, ordemid, descricao)
        VALUES ('2026-10-21', 'Entrada', 'Dinheiro', 100, 1, 2, 'Entrada parcial')
      `).run();

      // 3. OS entregue 100% quitada (saldo 0 - NÃO deve aparecer)
      sqlite.prepare(`
        INSERT INTO ordens (id, numero, clientenome, clienteid, status, prazoentrega, valortotal)
        VALUES (3, 'OS-003', 'Cliente Quitado', 30, 'Entregue', '2026-10-22', 200)
      `).run();
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, pagamento, valor, pago, ordemid, descricao)
        VALUES ('2026-10-22', 'Entrada', 'Pix', 200, 1, 3, 'Quitacao')
      `).run();

      // 4. OS cancelada (NÃO deve aparecer mesmo com saldo teórico)
      sqlite.prepare(`
        INSERT INTO ordens (id, numero, clientenome, clienteid, status, prazoentrega, valortotal)
        VALUES (4, 'OS-004', 'Cliente Cancelado', 40, 'Cancelado', '2026-10-23', 400)
      `).run();

      const lista = getContasReceberPayload();

      expect(lista.map(r => r.id)).toEqual([2, 1]); // ordenado por prazoentrega ASC
      const osFiado = lista.find(r => r.id === 2);
      expect(osFiado).toBeDefined();
      expect(osFiado.status).toBe('Entregue');
      expect(osFiado.saldo).toBe(250);
      expect(osFiado.clienteid).toBe(20);
    });
  });

  describe('DRE e Resumo Financeiro', () => {
    it('exclui saidas com origem credito_devolvido para evitar dupla deducao no DRE', async () => {
      // Receita bruta: 1000
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
        VALUES ('2026-10-01', 'Entrada', 'Venda', 'Venda 1', 'Pix', 1000, 1)
      `).run();

      // Devolução operacional comum (ex: balcão): 100
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
        VALUES ('2026-10-05', 'Saída', 'Devolucao', 'Devolucao comum', 'Pix', 100, 1)
      `).run();

      // Despesa comum: 200
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago)
        VALUES ('2026-10-06', 'Saída', 'Fornecedor', 'Madeira', 'Pix', 200, 1)
      `).run();

      // Devolução de crédito em dinheiro (origem: credito_devolvido): 150
      // Esta saída NUNCA pode entrar em despesas/devoluções do DRE pois a receita já foi reduzida no passado
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, categoria, descricao, pagamento, valor, pago, origem)
        VALUES ('2026-10-07', 'Saída', 'Devolucao', 'Restituicao haver em dinheiro', 'Dinheiro', 150, 1, 'credito_devolvido')
      `).run();

      const handlerDre = getRouteHandler('/dre');
      const req = { query: { mes: '2026-10' } };
      const res = makeRes();
      const next = (err) => { if (err) throw err; };

      await handlerDre(req, res, next);

      expect(res.body).toBeDefined();
      expect(res.body.receitaBruta).toBe(1000);
      // devolucoes deve conter apenas os 100 (não os 150 de credito_devolvido)
      expect(res.body.devolucoes).toBe(100);
      expect(res.body.receitaLiquida).toBe(900);
      // totalDespesas deve ser 200
      expect(res.body.totalDespesas).toBe(200);
      // resultado: 900 - 200 = 700
      expect(res.body.resultado).toBe(700);

      // Também testar getResumoFinanceiro (/resumo):
      const handlerResumo = getRouteHandler('/resumo');
      const resResumo = makeRes();
      await handlerResumo(req, resResumo, next);

      expect(resResumo.body).toBeDefined();
      expect(resResumo.body.receitaRealizada).toBe(1000);
      // saidasPagas deve somar 100 + 200 = 300, excluindo os 150 de credito_devolvido
      expect(resResumo.body.despesasPagas).toBe(300);
      expect(resResumo.body.saldoRealizado).toBe(700);
    });
  });

  describe('Auditoria de Integridade com Invariante de Credito', () => {
    it('audita integridade de credito e aponta divergencias na invariante ou saldos negativos', async () => {
      // Cliente com saldo inicial de 50
      sqlite.prepare(`
        INSERT INTO cliente_credito_movimentos (cliente_id, tipo, valor, motivo)
        VALUES (1, 'saldo_inicial', 50, 'Ficha papel')
      `).run();

      // Cliente gera crédito por redução de OS de 100
      sqlite.prepare(`
        INSERT INTO cliente_credito_movimentos (cliente_id, tipo, valor, motivo)
        VALUES (1, 'gerado', 100, 'Reducao OS')
      `).run();
      // Lançamento correspondente: Entrada com valor -100, pagamento CreditoLoja
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, pagamento, valor, pago, descricao)
        VALUES ('2026-10-26', 'Entrada', 'CreditoLoja', -100, 1, 'Credito gerado')
      `).run();

      // Cliente usa 40 de crédito
      sqlite.prepare(`
        INSERT INTO cliente_credito_movimentos (cliente_id, tipo, valor, motivo)
        VALUES (1, 'usado', -40, 'Uso OS-005')
      `).run();
      // Lançamento correspondente: Entrada com valor +40, pagamento CreditoLoja
      sqlite.prepare(`
        INSERT INTO lancamentos (data, tipo, pagamento, valor, pago, descricao)
        VALUES ('2026-10-26', 'Entrada', 'CreditoLoja', 40, 1, 'Uso credito')
      `).run();

      // Invariante perfeita:
      // movimentos não-saldo_inicial = 100 - 40 = 60
      // lancamentos CreditoLoja = -100 + 40 = -60. Negativo disso = 60. Bate!

      const handler = getRouteHandler('/integridade-os');
      const req = {};
      const res = makeRes();
      const next = (err) => { if (err) throw err; };

      await handler(req, res, next);

      expect(res.body.invarianteCredito.valido).toBe(true);
      expect(res.body.clientesComCreditoNegativo).toHaveLength(0);
      expect(res.body.itens.some(i => i.tipo === 'invariante_credito_divergente')).toBe(false);

      // Agora inserimos um saldo negativo para o cliente 2 (-15)
      sqlite.prepare(`
        INSERT INTO cliente_credito_movimentos (cliente_id, tipo, valor, motivo)
        VALUES (2, 'usado', -15, 'Uso indevido sem saldo')
      `).run();

      const res2 = makeRes();
      await handler(req, res2, next);

      expect(res2.body.clientesComCreditoNegativo).toHaveLength(1);
      expect(res2.body.clientesComCreditoNegativo[0].cliente_id).toBe(2);
      expect(res2.body.itens.some(i => i.tipo === 'cliente_credito_negativo')).toBe(true);
    });
  });
});
