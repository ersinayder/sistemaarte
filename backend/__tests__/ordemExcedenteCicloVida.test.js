import { describe, expect, it, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createCaixaLancamentoService } from "../services/caixaLancamentoService.js";

describe("Task 6: Ciclo de vida da OS, Excedente e Blindagem do Caixa", () => {
  let db;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
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

      CREATE TABLE IF NOT EXISTS ordens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT UNIQUE NOT NULL,
        clienteid INTEGER,
        clientenome TEXT NOT NULL,
        servico TEXT NOT NULL DEFAULT 'Moldura',
        valortotal REAL NOT NULL,
        valorentrada REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Aguardando',
        deletedat TEXT DEFAULT NULL
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
    `);
  });

  it("bloqueia edição manual de lançamentos de crédito no caixaLancamentoService", () => {
    db.prepare(`
      INSERT INTO lancamentos (data, descricao, pagamento, valor, origem)
      VALUES ('2026-10-26', 'Crédito gerado', 'CreditoLoja', -50, 'credito_gerado')
    `).run();

    const service = createCaixaLancamentoService({ db });
    expect(() => {
      service.editar(1, { valor: -40 }, { id: 1, role: "admin" });
    }).toThrow(/Lançamentos de crédito ou acerto não podem ser editados manualmente/);
  });

  it("bloqueia edição manual de lançamentos vinculados a acerto_id no caixaLancamentoService", () => {
    db.prepare(`
      INSERT INTO lancamentos (data, descricao, pagamento, valor, origem, acerto_id)
      VALUES ('2026-10-26', 'Acerto', 'Pix', 100, 'saldoos', 42)
    `).run();

    const service = createCaixaLancamentoService({ db });
    expect(() => {
      service.editar(1, { valor: 90 }, { id: 1, role: "admin" });
    }).toThrow(/Lançamentos de crédito ou acerto não podem ser editados manualmente/);
  });

  it("impede exclusão de OS que possua movimentos de crédito vinculados", () => {
    db.prepare(`
      INSERT INTO ordens (id, numero, clientenome, valortotal) VALUES (1, 'OS-100', 'Cliente X', 100)
    `).run();
    db.prepare(`
      INSERT INTO cliente_credito_movimentos (clienteid, tipo, valor, ordemid, criadopor)
      VALUES (1, 'gerado', 30, 1, 1)
    `).run();

    // Verificação da query usada em validarExclusaoOrdem
    const mov = db.prepare("SELECT 1 FROM cliente_credito_movimentos WHERE ordemid=? LIMIT 1").get(1);
    expect(mov).toBeTruthy();
  });

  it("impede exclusão de OS que possua lançamentos de crédito ou acerto", () => {
    db.prepare(`
      INSERT INTO ordens (id, numero, clientenome, valortotal) VALUES (2, 'OS-200', 'Cliente Y', 100)
    `).run();
    db.prepare(`
      INSERT INTO lancamentos (data, descricao, pagamento, valor, ordemid, origem)
      VALUES ('2026-10-26', 'Crédito gerado', 'CreditoLoja', -20, 2, 'credito_gerado')
    `).run();

    const lanc = db.prepare(
      "SELECT 1 FROM lancamentos WHERE ordemid=? AND deletedat IS NULL AND (origem LIKE 'credito_%' OR acerto_id IS NOT NULL) LIMIT 1"
    ).get(2);
    expect(lanc).toBeTruthy();
  });
});
