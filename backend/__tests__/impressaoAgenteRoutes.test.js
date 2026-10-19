import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';

const require = createRequire(import.meta.url);

process.env.JWT_SECRET = 'test-agent-jwt-secret';
process.env.PRINT_AGENT_TOKEN = 'token-secreto-agente-123';

let testDb;
let server;
let baseUrl;
let impressaoAgenteRouter;
let notificarNovoJob;
let printAgentEvents;

function setupDatabase() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE impressao_config (
      id INTEGER PRIMARY KEY,
      printer_name TEXT DEFAULT 'Impressoraloja',
      printer_ip TEXT,
      paper_size TEXT DEFAULT 'A5',
      color INTEGER DEFAULT 1,
      direct_print_enabled INTEGER DEFAULT 0,
      agent_mode INTEGER NOT NULL DEFAULT 1,
      agent_last_seen DATETIME,
      updatedat DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    INSERT INTO impressao_config (id, agent_mode, agent_last_seen)
    VALUES (1, 1, datetime('now', 'localtime'));

    CREATE TABLE print_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      referencia_id INTEGER,
      documento_nome TEXT NOT NULL,
      html TEXT NOT NULL,
      copias INTEGER NOT NULL DEFAULT 1,
      papel TEXT NOT NULL DEFAULT 'A5',
      status TEXT NOT NULL DEFAULT 'pendente',
      erro TEXT,
      tentativas INTEGER NOT NULL DEFAULT 0,
      createdat DATETIME DEFAULT (datetime('now', 'localtime')),
      updatedat DATETIME DEFAULT (datetime('now', 'localtime')),
      printedat DATETIME
    );

    CREATE TABLE permission_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      base_role TEXT,
      system INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO permission_profiles (id, key, name, base_role, active) VALUES (1, 'admin', 'Administrador', 'admin', 1);

    CREATE TABLE profile_permissions (
      profile_id INTEGER NOT NULL,
      permission TEXT NOT NULL,
      UNIQUE(profile_id, permission)
    );
    INSERT INTO profile_permissions (profile_id, permission) VALUES (1, 'configuracoes.ver');

    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      username TEXT,
      role TEXT,
      active INTEGER DEFAULT 1,
      profile_key TEXT DEFAULT 'admin',
      deletedat DATETIME,
      access_version INTEGER DEFAULT 1
    );
    INSERT INTO users (id, name, username, role, active, access_version, profile_key)
    VALUES (1, 'Admin', 'admin', 'admin', 1, 1, 'admin');
  `);

  const dbMock = {
    getDB: () => testDb,
    getOne: (sql, params = []) => testDb.prepare(sql).get(...params),
    getAll: (sql, params = []) => testDb.prepare(sql).all(...params),
    run: (sql, params = []) => testDb.prepare(sql).run(...params),
  };

  require.cache[require.resolve('../database.js')] = {
    id: require.resolve('../database.js'),
    filename: require.resolve('../database.js'),
    loaded: true,
    exports: dbMock,
  };
}

describe('Rotas Seguras do Agente de Impressão (/api/impressao/agente)', () => {
  beforeAll(async () => {
    setupDatabase();
    process.env.PRINT_AGENT_TOKEN = 'token-secreto-agente-123';

    const mod = await import('../routes/impressaoAgente.js');
    impressaoAgenteRouter = mod.default || mod;
    notificarNovoJob = impressaoAgenteRouter.notificarNovoJob;
    printAgentEvents = impressaoAgenteRouter.printAgentEvents;

    const app = express();
    app.use(express.json());
    app.use('/api/impressao/agente', impressaoAgenteRouter);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}/api/impressao/agente`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(() => {
    process.env.PRINT_AGENT_TOKEN = 'token-secreto-agente-123';
    testDb.exec(`DELETE FROM print_queue;`);
    testDb.exec(`UPDATE impressao_config SET agent_mode = 1, agent_last_seen = datetime('now', 'localtime') WHERE id = 1;`);
  });

  describe('Autenticação Timing-Safe', () => {
    it('rejeita requisições sem token com 401', async () => {
      const res = await fetch(`${baseUrl}/ping`, { method: 'POST' });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/token/i);
    });

    it('rejeita requisições com token inválido com 401', async () => {
      const res = await fetch(`${baseUrl}/ping`, {
        method: 'POST',
        headers: { 'X-Print-Agent-Token': 'token-errado' },
      });
      expect(res.status).toBe(401);
    });

    it('rejeita com 401 se PRINT_AGENT_TOKEN não estiver configurado no servidor', async () => {
      delete process.env.PRINT_AGENT_TOKEN;
      const res = await fetch(`${baseUrl}/ping`, {
        method: 'POST',
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(401);
    });

    it('aceita autenticação via header X-Print-Agent-Token', async () => {
      const res = await fetch(`${baseUrl}/ping`, {
        method: 'POST',
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('aceita autenticação via header Authorization: Bearer <token>', async () => {
      const res = await fetch(`${baseUrl}/ping`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  describe('POST /ping', () => {
    it('atualiza agent_last_seen e responde sucesso', async () => {
      testDb.prepare("UPDATE impressao_config SET agent_last_seen = '2026-01-01 00:00:00' WHERE id = 1").run();

      const res = await fetch(`${baseUrl}/ping`, {
        method: 'POST',
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.agentLastSeen).toBeDefined();

      const row = testDb.prepare("SELECT agent_last_seen FROM impressao_config WHERE id = 1").get();
      expect(row.agent_last_seen).not.toBe('2026-01-01 00:00:00');
    });
  });

  describe('GET /tarefas', () => {
    it('retorna tarefa: null quando a fila estiver vazia', async () => {
      const res = await fetch(`${baseUrl}/tarefas`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tarefa).toBeNull();
    });

    it('seleciona o primeiro job pendente FIFO e avança para processando', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, referencia_id, documento_nome, html, copias, papel, status)
        VALUES 
          (10, 'ordem', 101, 'OS-0101', '<html>1</html>', 1, 'A5', 'pendente'),
          (11, 'ordem', 102, 'OS-0102', '<html>2</html>', 2, 'A5', 'pendente')
      `).run();

      const res = await fetch(`${baseUrl}/tarefas`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tarefa).toBeDefined();
      expect(data.tarefa.id).toBe(10);
      expect(data.tarefa.status).toBe('processando');
      expect(data.tarefa.tentativas).toBe(1);

      // Segundo fetch deve pegar o próximo job (FIFO)
      const res2 = await fetch(`${baseUrl}/tarefas`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      const data2 = await res2.json();
      expect(data2.tarefa.id).toBe(11);

      // Terceiro fetch retorna null
      const res3 = await fetch(`${baseUrl}/tarefas`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      const data3 = await res3.json();
      expect(data3.tarefa).toBeNull();
    });

    it('recupera job em lease timeout (> 120s) com tentativas < 3 retornando para pendente', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status, tentativas, updatedat)
        VALUES (20, 'ordem', 'OS-0020', '<html>OS</html>', 'processando', 1, datetime('now', 'localtime', '-130 seconds'))
      `).run();

      const res = await fetch(`${baseUrl}/tarefas`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tarefa).toBeDefined();
      expect(data.tarefa.id).toBe(20);
      expect(data.tarefa.tentativas).toBe(2);
      expect(data.tarefa.status).toBe('processando');
    });

    it('marca job em lease timeout com tentativas >= 3 como falha', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status, tentativas, updatedat)
        VALUES (30, 'ordem', 'OS-0030', '<html>OS</html>', 'processando', 3, datetime('now', 'localtime', '-130 seconds'))
      `).run();

      const res = await fetch(`${baseUrl}/tarefas`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tarefa).toBeNull();

      const row = testDb.prepare("SELECT status, erro FROM print_queue WHERE id = 30").get();
      expect(row.status).toBe('falha');
      expect(row.erro).toMatch(/timeout/i);
    });

    it('impede que chamadas simultâneas peguem a mesma tarefa duas vezes (concorrência atômica)', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status)
        VALUES (35, 'ordem', 'OS-0035', '<html>OS</html>', 'pendente')
      `).run();

      const fetchTarefa = () =>
        fetch(`${baseUrl}/tarefas`, {
          headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
        }).then((r) => r.json());

      const [res1, res2] = await Promise.all([fetchTarefa(), fetchTarefa()]);

      const jobsObtidos = [res1.tarefa, res2.tarefa].filter(Boolean);
      expect(jobsObtidos.length).toBe(1);
      expect(jobsObtidos[0].id).toBe(35);
    });
  });

  describe('POST /tarefas/:id/concluir', () => {
    it('valida body exigindo campo ok booleano', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status)
        VALUES (40, 'ordem', 'OS-0040', '<html>OS</html>', 'processando')
      `).run();

      const res = await fetch(`${baseUrl}/tarefas/40/concluir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Print-Agent-Token': 'token-secreto-agente-123',
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it('retorna 404 para job inexistente', async () => {
      const res = await fetch(`${baseUrl}/tarefas/999/concluir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Print-Agent-Token': 'token-secreto-agente-123',
        },
        body: JSON.stringify({ ok: true }),
      });
      expect(res.status).toBe(404);
    });

    it('marca status como concluido e grava printedat quando ok = true', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status)
        VALUES (41, 'ordem', 'OS-0041', '<html>OS</html>', 'processando')
      `).run();

      const res = await fetch(`${baseUrl}/tarefas/41/concluir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Print-Agent-Token': 'token-secreto-agente-123',
        },
        body: JSON.stringify({ ok: true }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      const row = testDb.prepare("SELECT status, printedat FROM print_queue WHERE id = 41").get();
      expect(row.status).toBe('concluido');
      expect(row.printedat).toBeTruthy();
    });

    it('marca status como falha e salva mensagem de erro quando ok = false', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status)
        VALUES (42, 'ordem', 'OS-0042', '<html>OS</html>', 'processando')
      `).run();

      const res = await fetch(`${baseUrl}/tarefas/42/concluir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Print-Agent-Token': 'token-secreto-agente-123',
        },
        body: JSON.stringify({ ok: false, error: 'Papel encravado' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      const row = testDb.prepare("SELECT status, erro FROM print_queue WHERE id = 42").get();
      expect(row.status).toBe('falha');
      expect(row.erro).toBe('Papel encravado');
    });
  });

  describe('GET /status', () => {
    it('permite consulta com token de agente', async () => {
      testDb.prepare(`
        INSERT INTO print_queue (id, tipo, documento_nome, html, status)
        VALUES 
          (50, 'ordem', 'OS-0050', '<html>1</html>', 'pendente'),
          (51, 'ordem', 'OS-0051', '<html>2</html>', 'processando')
      `).run();

      const res = await fetch(`${baseUrl}/status`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.online).toBe(true);
      expect(data.fila.pendentes).toBe(1);
      expect(data.fila.processando).toBe(1);
    });

    it('permite consulta com token de usuário autenticado do sistema', async () => {
      const userToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);
      const res = await fetch(`${baseUrl}/status`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.online).toBe(true);
    });

    it('rejeita com 401 se não for nem agente nem usuário logado', async () => {
      const res = await fetch(`${baseUrl}/status`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /stream (SSE)', () => {
    it('estabelece conexão SSE e emite evento job ao enfileirar', async () => {
      const controller = new AbortController();
      const res = await fetch(`${baseUrl}/stream`, {
        headers: { 'X-Print-Agent-Token': 'token-secreto-agente-123' },
        signal: controller.signal,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(res.headers.get('connection')).toBe('keep-alive');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      // Ler primeira mensagem (connected comment)
      const firstChunk = await reader.read();
      const firstText = decoder.decode(firstChunk.value);
      expect(firstText).toContain(': connected');

      // Notificar novo job via EventEmitter singleton
      notificarNovoJob({ id: 99, tipo: 'ordem', documento_nome: 'OS-0099' });

      // Ler próximo chunk que deve conter o evento job
      const jobChunk = await reader.read();
      const jobText = decoder.decode(jobChunk.value);
      expect(jobText).toContain('event: job');
      expect(jobText).toContain('"id":99');

      controller.abort();
    });
  });
});
