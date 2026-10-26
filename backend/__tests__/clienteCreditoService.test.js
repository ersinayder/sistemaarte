import { describe, expect, it, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createClienteCreditoService } from "../services/clienteCreditoService.js";

describe("Task 4: clienteCreditoService", () => {
  let db, service;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      INSERT INTO users (id, name) VALUES (1, 'Admin');

      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        fiado_ativo INTEGER DEFAULT 0,
        fiado_limite REAL DEFAULT NULL,
        deletedat TEXT DEFAULT NULL
      );
      INSERT INTO clientes (id, name) VALUES (1, 'Cliente Teste');

      CREATE TABLE IF NOT EXISTS ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        clienteid INTEGER,
        clientenome TEXT NOT NULL,
        valortotal REAL NOT NULL,
        valorentrada REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Aguardando',
        deletedat TEXT DEFAULT NULL
      );
      INSERT INTO ordens (id, numero, clienteid, clientenome, valortotal)
      VALUES (1, 'OS-001', 1, 'Cliente Teste', 100);

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
        clienteid INTEGER DEFAULT NULL,
        acerto_id INTEGER DEFAULT NULL,
        criadopor INTEGER,
        origem TEXT DEFAULT NULL,
        deletedat TEXT DEFAULT NULL,
        deletedpor INTEGER DEFAULT NULL,
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
        createdat TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY(clienteid) REFERENCES clientes(id)
      );
    `);

    service = createClienteCreditoService({ db });
  });

  it("inicia com saldo zero e extrato vazio", () => {
    const extrato = service.getExtratoCredito(1);
    expect(extrato.saldo).toBe(0);
    expect(extrato.movimentos).toHaveLength(0);
  });

  it("lanca saldo inicial sem criar registro em lancamentos contabeis", () => {
    const res = service.lancarSaldoInicial({
      clienteId: 1,
      valor: 150.0,
      motivo: "Vale em papel antigo de 12/08/2026",
      criadopor: 1,
    });

    expect(res.saldoAtual).toBe(150);

    const extrato = service.getExtratoCredito(1);
    expect(extrato.saldo).toBe(150);
    expect(extrato.movimentos).toHaveLength(1);
    expect(extrato.movimentos[0].tipo).toBe("saldo_inicial");
    expect(extrato.movimentos[0].valor).toBe(150);

    // Contabilidade: NENHUM lançamento financeiro gerado
    const lancamentos = db.prepare("SELECT * FROM lancamentos").all();
    expect(lancamentos).toHaveLength(0);
  });

  it("gera credito por excedente criando lancamento CreditoLoja negativo e movimento no extrato", () => {
    const res = service.gerarCreditoPorExcedente({
      ordemId: 1,
      clienteId: 1,
      valor: 40.0,
      criadopor: 1,
    });

    expect(res.saldoAtual).toBe(40);
    expect(res.lancamentoId).toBeDefined();

    const lanc = db.prepare("SELECT * FROM lancamentos WHERE id=?").get(res.lancamentoId);
    expect(lanc.tipo).toBe("Entrada");
    expect(lanc.valor).toBe(-40);
    expect(lanc.pagamento).toBe("CreditoLoja");
    expect(lanc.origem).toBe("credito_gerado");
    expect(lanc.ordemid).toBe(1);
    expect(lanc.clienteid).toBe(1);

    const extrato = service.getExtratoCredito(1);
    expect(extrato.saldo).toBe(40);
    expect(extrato.movimentos[0].tipo).toBe("gerado");
    expect(extrato.movimentos[0].valor).toBe(40);
  });

  it("permite usar credito em OS abatendo o saldo do cliente", () => {
    // 1. Gera 100 de crédito inicial
    service.lancarSaldoInicial({ clienteId: 1, valor: 100, motivo: "Inicial", criadopor: 1 });

    // 2. Usa 35 em uma OS
    const resUso = service.usarCreditoOS({
      ordemId: 1,
      clienteId: 1,
      valor: 35.0,
      criadopor: 1,
    });

    expect(resUso.saldoAtual).toBe(65);

    const lanc = db.prepare("SELECT * FROM lancamentos WHERE id=?").get(resUso.lancamentoId);
    expect(lanc.tipo).toBe("Entrada");
    expect(lanc.valor).toBe(35);
    expect(lanc.pagamento).toBe("CreditoLoja");
    expect(lanc.origem).toBe("credito_usado");

    const extrato = service.getExtratoCredito(1);
    expect(extrato.saldo).toBe(65);
    expect(extrato.movimentos).toHaveLength(2);
  });

  it("impede usar credito se saldo for insuficiente", () => {
    service.lancarSaldoInicial({ clienteId: 1, valor: 50, motivo: "Inicial", criadopor: 1 });

    expect(() => {
      service.usarCreditoOS({ ordemId: 1, clienteId: 1, valor: 50.01, criadopor: 1 });
    }).toThrow(/Saldo de crédito insuficiente/);
  });

  it("devolve credito em dinheiro criando Saida no caixa e movimento de debito", () => {
    service.lancarSaldoInicial({ clienteId: 1, valor: 80, motivo: "Inicial", criadopor: 1 });

    const resDev = service.devolverCredito({
      clienteId: 1,
      valor: 30,
      pagamento: "Pix",
      criadopor: 1,
    });

    expect(resDev.saldoAtual).toBe(50);

    const lanc = db.prepare("SELECT * FROM lancamentos WHERE id=?").get(resDev.lancamentoId);
    expect(lanc.tipo).toBe("Saída");
    expect(lanc.valor).toBe(30);
    expect(lanc.pagamento).toBe("Pix");
    expect(lanc.origem).toBe("credito_devolvido");
    expect(lanc.categoria).toBe("Devolução de crédito");

    const extrato = service.getExtratoCredito(1);
    expect(extrato.saldo).toBe(50);
  });

  it("permite estornar movimento e reverte o saldo, bloqueando se deixar saldo negativo", () => {
    const m1 = service.lancarSaldoInicial({ clienteId: 1, valor: 100, motivo: "Inicial", criadopor: 1 });
    const m2 = service.usarCreditoOS({ ordemId: 1, clienteId: 1, valor: 80, criadopor: 1 });

    // Saldo atual = 20.
    // Tentar estornar m1 (tiraria 100 do saldo, deixando -80) -> DEVE BLOQUEAR!
    expect(() => {
      service.estornarMovimento({ movimentoId: m1.movimentoId, usuarioId: 1 });
    }).toThrow(/Estorno cancelado: deixaria o saldo do cliente negativo/);

    // Estornar m2 (devolve 80 de saldo) -> DEVE FUNCIONAR!
    const resEstorno = service.estornarMovimento({ movimentoId: m2.movimentoId, usuarioId: 1 });
    expect(resEstorno.saldoAtual).toBe(100);

    // O lançamento financeiro original de m2 deve ser soft-deleted
    const lancM2 = db.prepare("SELECT * FROM lancamentos WHERE id=?").get(m2.lancamentoId);
    expect(lancM2.deletedat).not.toBeNull();
  });
});
