'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Tenta reutilizar printHtml de backend/utils/print/serverPrinter.js
let defaultPrintHtml = null;
try {
  const serverPrinter = require('../../backend/utils/print/serverPrinter');
  defaultPrintHtml = serverPrinter.printHtml;
} catch {
  // Caso executado em ambiente isolado ou empacotado sem acesso direto
}

const DEFAULTS = {
  PRINTER_NAME: 'Canon G3010 series',
  PRINT_SERVER_URL: 'https://arteemolduras.com.br',
  SETTLE_MS: 4000,
  POLL_INTERVAL_MS: 5000,
  PING_INTERVAL_MS: 20000,
};

/**
 * Lê arquivo .env simples no diretório especificado
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = {};
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Carrega a configuração do agente combinando:
 * 1. process.env
 * 2. .env em services/print-agent/.env
 * 3. config.json em services/print-agent/config.json
 * 4. Defaults
 */
function carregarConfiguracao(envOverride = null, baseDir = __dirname) {
  const localEnv = parseEnvFile(path.join(baseDir, '.env'));
  let localJson = {};
  const jsonPath = path.join(baseDir, 'config.json');
  if (fs.existsSync(jsonPath)) {
    try {
      localJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      // Ignora erro de JSON malformado
    }
  }

  const env = envOverride || process.env;

  const rawServerUrl =
    env.PRINT_SERVER_URL ||
    localEnv.PRINT_SERVER_URL ||
    localJson.PRINT_SERVER_URL ||
    localJson.serverUrl ||
    DEFAULTS.PRINT_SERVER_URL;

  const serverUrl = String(rawServerUrl).replace(/\/+$/, '');

  const printerName =
    env.PRINTER_NAME ||
    localEnv.PRINTER_NAME ||
    localJson.PRINTER_NAME ||
    localJson.printerName ||
    DEFAULTS.PRINTER_NAME;

  const token =
    env.PRINT_AGENT_TOKEN ||
    localEnv.PRINT_AGENT_TOKEN ||
    localJson.PRINT_AGENT_TOKEN ||
    localJson.token ||
    '';

  const rawSettle =
    env.PRINT_SETTLE_MS ||
    localEnv.PRINT_SETTLE_MS ||
    localJson.PRINT_SETTLE_MS ||
    localJson.settleMs ||
    DEFAULTS.SETTLE_MS;

  const settleMs = Number(rawSettle) || DEFAULTS.SETTLE_MS;

  const rawPoll =
    env.PRINT_POLL_INTERVAL_MS ||
    localEnv.PRINT_POLL_INTERVAL_MS ||
    localJson.pollIntervalMs ||
    DEFAULTS.POLL_INTERVAL_MS;

  const pollIntervalMs = Number(rawPoll) || DEFAULTS.POLL_INTERVAL_MS;

  const rawPing =
    env.PRINT_PING_INTERVAL_MS ||
    localEnv.PRINT_PING_INTERVAL_MS ||
    localJson.pingIntervalMs ||
    DEFAULTS.PING_INTERVAL_MS;

  const pingIntervalMs = Number(rawPing) || DEFAULTS.PING_INTERVAL_MS;

  return {
    serverUrl,
    printerName,
    token,
    settleMs,
    pollIntervalMs,
    pingIntervalMs,
  };
}

/**
 * Wrapper de fetch nativo do Node 22 com fallback
 */
const defaultFetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;

/**
 * Busca e processa a próxima tarefa pendente na fila
 */
async function processarProximaTarefa({
  config,
  fetchFn = defaultFetch,
  printFn = defaultPrintHtml,
}) {
  if (!config) throw new Error('Configuração obrigatória');
  if (!fetchFn) throw new Error('fetchFn não disponível');

  const headers = {
    'X-Print-Agent-Token': config.token,
    'Accept': 'application/json',
  };

  const urlTarefas = `${config.serverUrl}/api/impressao/agente/tarefas`;
  const res = await fetchFn(urlTarefas, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Erro ao buscar tarefas (HTTP ${res.status}): ${text}`);
  }

  const data = await res.json();
  const tarefa = data?.tarefa;

  if (!tarefa) {
    return null;
  }

  const { id, html, documento_nome, copias, papel } = tarefa;

  let sucesso = false;
  let erro = null;

  try {
    if (!printFn) {
      throw new Error('Função de impressão (printHtml) não disponível neste ambiente.');
    }

    // Executa impressão via serverPrinter
    await printFn({
      html,
      jobName: documento_nome || `job-${id}`,
      copies: copias || 1,
      settleMs: config.settleMs,
      env: {
        ...process.env,
        ORDEM_PRINTER_NAME: config.printerName,
      },
    });

    sucesso = true;
  } catch (err) {
    sucesso = false;
    erro = err.message || String(err);
  }

  // Notifica o servidor sobre a conclusão ou falha
  const urlConcluir = `${config.serverUrl}/api/impressao/agente/tarefas/${id}/concluir`;
  const bodyConcluir = sucesso ? { ok: true } : { ok: false, error: erro };

  try {
    await fetchFn(urlConcluir, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyConcluir),
    });
  } catch (reportErr) {
    console.error(`[PrintAgent] Erro ao reportar status da tarefa ${id}:`, reportErr.message);
  }

  if (sucesso) {
    return { id, sucesso: true };
  } else {
    return { id, sucesso: false, error: erro };
  }
}

/**
 * Executa um ciclo de drenagem até que não haja mais tarefas pendentes
 */
async function executarCicloDrenagem({
  processarFn,
  maxJobsPorCiclo = 50,
}) {
  let contador = 0;
  while (contador < maxJobsPorCiclo) {
    const resultado = await processarFn();
    if (!resultado) {
      break;
    }
    contador++;
  }
  return contador;
}

/**
 * Conexão com SSE em /api/impressao/agente/stream com reconexão resiliente
 */
function conectarSSE({
  config,
  onJob,
  onConnected,
  onError,
}) {
  let abortController = null;
  let reconectarTimeout = null;
  let ativo = true;
  let backoffMs = 1000;

  async function conectar() {
    if (!ativo) return;

    abortController = new AbortController();
    const url = `${config.serverUrl}/api/impressao/agente/stream`;

    try {
      const isHttps = url.startsWith('https:');
      const client = isHttps ? https : http;

      const headers = {
        'X-Print-Agent-Token': config.token,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      };

      const req = client.get(url, { headers }, (res) => {
        if (res.statusCode !== 200) {
          const err = new Error(`SSE Falhou com status ${res.statusCode}`);
          if (onError) onError(err);
          tentarReconectar();
          return;
        }

        backoffMs = 1000; // Reset backoff
        if (onConnected) onConnected();

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Mantém linha incompleta no buffer

          let currentEvent = 'message';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (currentEvent === 'job') {
                try {
                  const jobData = JSON.parse(dataStr);
                  if (onJob) onJob(jobData);
                } catch {
                  if (onJob) onJob({});
                }
              }
              currentEvent = 'message';
            }
          }
        });

        res.on('end', () => {
          tentarReconectar();
        });

        res.on('error', (err) => {
          if (onError) onError(err);
          tentarReconectar();
        });
      });

      req.on('error', (err) => {
        if (onError) onError(err);
        tentarReconectar();
      });

      req.setTimeout(60000, () => {
        req.destroy();
      });

    } catch (err) {
      if (onError) onError(err);
      tentarReconectar();
    }
  }

  function tentarReconectar() {
    if (!ativo) return;
    if (reconectarTimeout) clearTimeout(reconectarTimeout);
    reconectarTimeout = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 1.5, 30000);
      conectar();
    }, backoffMs);
  }

  conectar();

  return {
    fechar() {
      ativo = false;
      if (abortController) abortController.abort();
      if (reconectarTimeout) clearTimeout(reconectarTimeout);
    },
  };
}

/**
 * Cria a instância controlável do agente
 */
function criarAgente({
  env = null,
  baseDir = __dirname,
  fetchFn = defaultFetch,
  printFn = defaultPrintHtml,
} = {}) {
  const config = carregarConfiguracao(env, baseDir);
  let sseConexao = null;
  let pingTimer = null;
  let pollTimer = null;
  let drenando = false;
  let rodando = false;

  async function ping() {
    const url = `${config.serverUrl}/api/impressao/agente/ping`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'X-Print-Agent-Token': config.token,
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Ping falhou (HTTP ${res.status})`);
    }
    return res.json();
  }

  async function drenarFila() {
    if (drenando) return;
    drenando = true;
    try {
      await executarCicloDrenagem({
        processarFn: () => processarProximaTarefa({ config, fetchFn, printFn }),
      });
    } catch (err) {
      console.error('[PrintAgent] Erro durante drenagem:', err.message);
    } finally {
      drenando = false;
    }
  }

  function start() {
    if (rodando) return;
    rodando = true;

    console.log('[PrintAgent] Iniciando Agente de Impressão Local');
    console.log(`[PrintAgent] Servidor: ${config.serverUrl}`);
    console.log(`[PrintAgent] Impressora Alvo: ${config.printerName}`);

    if (!config.token) {
      console.warn('[PrintAgent] AVISO: PRINT_AGENT_TOKEN não foi configurado!');
    }

    // 1. Drenagem inicial
    drenarFila();

    // 2. SSE em tempo real
    sseConexao = conectarSSE({
      config,
      onConnected: () => {
        console.log('[PrintAgent] Conectado ao stream de eventos SSE.');
      },
      onJob: (job) => {
        console.log(`[PrintAgent] Novo job notificado: #${job.id || 'desconhecido'}. Drenando fila...`);
        drenarFila();
      },
      onError: (err) => {
        // SSE error silencioso ou log
      },
    });

    // 3. Heartbeat ping periódico a cada 20s
    pingTimer = setInterval(() => {
      ping().catch(() => {});
    }, config.pingIntervalMs);

    // 4. Polling de fallback (caso SSE caia ou perca evento)
    pollTimer = setInterval(() => {
      drenarFila();
    }, config.pollIntervalMs);
  }

  function stop() {
    rodando = false;
    if (sseConexao) {
      sseConexao.fechar();
      sseConexao = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    console.log('[PrintAgent] Agente finalizado.');
  }

  return {
    config,
    start,
    stop,
    ping,
    drenarFila,
  };
}

// Execução direta via `node agent.js`
if (require.main === module) {
  const agente = criarAgente();
  agente.start();

  process.on('SIGINT', () => {
    agente.stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    agente.stop();
    process.exit(0);
  });
}

module.exports = {
  carregarConfiguracao,
  processarProximaTarefa,
  executarCicloDrenagem,
  conectarSSE,
  criarAgente,
  DEFAULTS,
};
