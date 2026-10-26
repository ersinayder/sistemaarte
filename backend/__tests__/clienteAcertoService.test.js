import { describe, expect, it, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createClienteAcertoService } from "../services/clienteAcertoService.js";

describe("Task 7: clienteAcertoService", () => {
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

      CREATE TABLE IF NOT EXISTS empresa_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nomefantasia TEXT DEFAULT 'Arte e Molduras',
        chave_pix TEXT DEFAULT '12345678000199'
      );
      INSERT INTO empresa_config (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        fiado_ativo INTEGER DEFAULT 1,
        fiado_limite REAL DEFAULT 500,
        deletedat TEXT DEFAULT NULL
      );
      INSERT INTO clientes (id, name, phone) VALUES (1, 'João da Silva', '31988887777');

      CREATE TABLE IF NOT EXISTS ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        clienteid INTEGER,
        clientenome TEXT NOT NULL,
        servico TEXT NOT NULL DEFAULT 'Moldura 30x40',
        valortotal REAL NOT NULL,
        valorentrada REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Entregue',
        createdat TEXT DEFAULT (datetime('now','localtime')),
        deletedat TEXT DEFAULT NULL
      );
      INSERT INTO ordens (id, numero, clienteid, clientenome, servico, valortotal, status)
      VALUES (1, 'OS-101', 1, 'João da Silva', 'Moldura 30x40', 120, 'Entregue');
      INSERT INTO ordens (id, numero, clienteid, clientenome, servico, valortotal, status)
      VALUES (2, 'OS-102', 1, 'João da Silva', 'Quadro Canvas', 80, 'Entregue');

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
        deletedpor INTEGER DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS cliente_acertos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clienteid INTEGER NOT NULL,
        valor_total REAL NOT NULL,
        pagamento TEXT NOT NULL,
        observacao TEXT DEFAULT NULL,
        criadopor INTEGER NOT NULL,
        createdat TEXT DEFAULT (datetime('now','localtime')),
        estornado_em TEXT DEFAULT NULL,
        estornado_por INTEGER DEFAULT NULL,
        FOREIGN KEY(clienteid) REFERENCES clientes(id)
      );
    `);

    service = createClienteAcertoService({ db });
  });

  it("retorna conta em aberto com a lista de ordens entregues e total correto", () => {
    const conta = service.getContaEmAberto(1);
    expect(conta.totalEmAberto).toBe(200);
    expect(conta.ordens).toHaveLength(2);
    expect(conta.ordens[0].saldo).toBe(120);
    expect(conta.ordens[1].saldo).toBe(80);
  });

  it("realiza o acerto quitando todas as ordens e vinculando os lancamentos ao acerto_id", () => {
    const res = service.receberAcerto({
      clienteId: 1,
      pagamento: "Pix",
      ordem_ids: [1, 2],
      valor_total_esperado: 200,
      usuarioId: 1,
    });

    expect(res.ok).toBe(true);
    expect(res.acertoId).toBeDefined();
    expect(res.totalPago).toBe(200);

    // Conta em aberto agora deve estar zerada
    const contaAtualizada = service.getContaEmAberto(1);
    expect(contaAtualizada.totalEmAberto).toBe(0);
    expect(contaAtualizada.ordens).toHaveLength(0);

    // Conferir lançamentos
    const lancs = db.prepare("SELECT * FROM lancamentos WHERE acerto_id=?").all(res.acertoId);
    expect(lancs).toHaveLength(2);
    expect(lancs[0].valor).toBe(120);
    expect(lancs[0].pagamento).toBe("Pix");
    expect(lancs[0].origem).toBe("saldoos");
    expect(lancs[1].valor).toBe(80);
  });

  it("rejeita acerto se valor esperado for divergente da soma real", () => {
    expect(() => {
      service.receberAcerto({
        clienteId: 1,
        pagamento: "Pix",
        ordem_ids: [1, 2],
        valor_total_esperado: 150, // divergente (real é 200)
        usuarioId: 1,
      });
    }).toThrow(/Valores divergentes/);
  });

  it("gera texto de cobranca formatado para WhatsApp com chave Pix", () => {
    const cobranca = service.gerarMensagemCobranca({ clienteId: 1 });
    expect(cobranca.texto).toContain("João da Silva");
    expect(cobranca.texto).toContain("Arte e Molduras");
    expect(cobranca.texto).toContain("OS-101");
    expect(cobranca.texto).toContain("Moldura 30x40");
    expect(cobranca.texto).toContain("Total em aberto: R$ 200,00");
    expect(cobranca.texto).toContain("Pix: 12345678000199");
    expect(cobranca.urlWhatsAppWeb).toContain("wa.me");
  });

  it("permite estornar acerto reabrindo o débito das OSs", () => {
    const res = service.receberAcerto({
      clienteId: 1,
      pagamento: "Pix",
      ordem_ids: [1, 2],
      valor_total_esperado: 200,
      usuarioId: 1,
    });

    service.estornarAcerto({ acertoId: res.acertoId, usuarioId: 1 });

    const contaReaberta = service.getContaEmAberto(1);
    expect(contaReaberta.totalEmAberto).toBe(200);
    expect(contaReaberta.ordens).toHaveLength(2);

    const acerto = db.prepare("SELECT * FROM cliente_acertos WHERE id=?").get(res.acertoId);
    expect(acerto.estornado_em).not.toBeNull();
  });
});
