# Design: Impressão Silenciosa Remota via Fila Segura e Agente Local

**Data:** 2026-10-19  
**Status:** Aprovado  
**Branch de trabalho:** `develop`  
**Autores:** Pair Programming (IA Antigravity + Usuário)

---

## 1. Contexto e Motivação (Intent & Why)

O Sistema Arte e Molduras opera com o backend hospedado em um VPS Ubuntu Linux na nuvem (`arteemolduras.com.br`), enquanto as impressoras físicas (Canon G3010 series) e os operadores ficam fisicamente na loja local.

Hoje, a tentativa de impressão direta no servidor Linux falha porque o Linux não tem acesso direto via spooler à impressora USB/SMB da loja física. Além disso, a impressão via navegador (`window.print()`) exige intervenção manual do atendente (caixa de diálogo do navegador, confirmação de configurações, múltiplos cliques), o que gera atrito e perda de agilidade no balcão e na oficina.

O objetivo deste projeto é permitir que **qualquer usuário** (em qualquer terminal, balcão, caixa ou celular) clique em **"Imprimir"** em qualquer documento do sistema (OS, Proposta ou Fechamento de Caixa) e o trabalho seja enviado **instantaneamente e de forma 100% silenciosa** para a impressora física Canon conectada ao computador da loja, sem exibir telas de configuração, janelas intermediárias ou pop-ups.

---

## 2. Metas (Goals), Não-Metas (Non-Goals) e Anti-Metas (Anti-Goals)

### Metas (Goals)
1. **Fila Segura de Impressão na Nuvem (`print_queue`):**
   - Criação da tabela `print_queue` no SQLite com controle de status (`pendente`, `processando`, `concluido`, `falha`).
   - Endpoint autenticado no backend para enfileirar ordens de impressão (OS, propostas, caixa).
   - Resposta imediata ao frontend (`< 80ms`) informando que o documento foi enfileirado com sucesso.
2. **Segurança Rigorosa (Zero Brechas):**
   - Inserção na fila restrita a usuários autenticados com as devidas permissões RBAC (`ordens.imprimir`, `propostas.imprimir`, `caixa.fechar`).
   - Acesso do Agente Local protegido por token criptográfico de máquina (`PRINT_AGENT_TOKEN`).
   - Endpoints do agente com rate-limit dedicado e validação estrita de headers.
   - Proteção contra SSRF e injeção de comandos no PowerShell local (validação estrita de parâmetros e nomes de impressoras já presente em `serverPrinter.js`).
3. **Agente de Impressão Local (Windows - PC Edu):**
   - Processo Node.js leve rodando em background no PC onde a Canon G3010 está conectada via USB.
   - Comunicação via polling inteligente / SSE com o backend na nuvem.
   - Execução do script silencioso em A5 (Edge/Chrome headless com `kiosk-printing` e `marginsType: 1`) já validado.
   - Confirmação de conclusão ou registro de erro no servidor.
   - Heartbeat periódico para monitoramento de status (Online/Offline).
4. **Experiência Silenciosa no Frontend:**
   - Ao receber resposta de que a impressão foi enfileirada (`mode: "queue"`), o frontend apenas exibe um toast de sucesso e **não** dispara iframe nem `window.print()`.
   - Se o agente estiver offline ou desativado, o sistema oferece fallback gracioso para visualização/impressão via navegador.
5. **Painel de Monitoramento em `/configuracoes`:**
   - Exibir o status do Agente de Impressão da Loja (Online, Último ping, Fila pendente).

### Não-Metas (Non-Goals)
- Impressão direta via spooler executada a partir do VPS Linux (o VPS não terá conexão USB/SMB com a loja).
- Geração de PDF binário pesado no servidor para impressão (o layout continua sendo o HTML operacional canônico formatado para A5).
- Suporte a múltiplos agentes de impressão concorrentes em lojas diferentes neste momento (foco na loja física atual com o PC Edu).

### Anti-Metas (Anti-Goals)
- **Nunca** permitir que o agente local execute código arbitrário ou eval enviado pelo servidor. O agente só executa o motor pré-validado `printHtml()` nativo.
- **Nunca** expor portas abertas na rede local da loja para a internet (a conexão é sempre de saída do agente local para o HTTPS da nuvem: outbound-only).
- **Nunca** travar a thread principal do Express com polling síncrono ou operações de I/O bloqueantes.

---

## 3. Modelo de Dados e Banco de Dados

### Tabela `print_queue` (SQLite)
```sql
CREATE TABLE IF NOT EXISTS print_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                  -- 'ordem', 'proposta', 'caixa'
  referencia_id INTEGER,               -- ID da OS, proposta ou lancamento
  documento_nome TEXT NOT NULL,        -- 'OS-0875', 'Proposta-12', etc.
  html TEXT NOT NULL,                  -- HTML oficial renderizado
  copias INTEGER NOT NULL DEFAULT 1,   -- 1 ou 2 vias
  papel TEXT NOT NULL DEFAULT 'A5',    -- 'A5' ou 'A4'
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente', 'processando', 'concluido', 'falha'
  erro TEXT,                           -- Mensagem em caso de falha
  tentativas INTEGER NOT NULL DEFAULT 0,
  createdat DATETIME DEFAULT (datetime('now', 'localtime')),
  updatedat DATETIME DEFAULT (datetime('now', 'localtime')),
  printedat DATETIME
);

CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status, createdat);
```

### Configuração em `impressao_config`
Novos campos / colunas para suportar o modo Agente:
- `agent_mode`: INTEGER (0 = Navegador, 1 = Agente da Loja Silencioso).
- `agent_last_seen`: DATETIME (último heartbeat do agente local).

---

## 4. Arquitetura da API e Endpoints

### 4.1 Enfileiramento de Documentos
- `POST /api/ordens/:id/print` (permissão `ordens.imprimir`):
  - Verifica se `agent_mode` está ativo.
  - Se ativo: renderiza `renderOrdemServicoHtml()`, insere na `print_queue`, retorna:
    `{ ok: true, mode: "queue", message: "OS enviada para a impressora da loja.", jobId: 123 }`.
  - Se inativo (ou fallback): retorna `mode: "browser"` com `printUrl`.
- `POST /api/propostas/:id/print` (permissão `propostas.imprimir`):
  - Renderiza `renderPropostaHtml()`, insere na fila e responde similarmente.
- `POST /api/caixa/fechamento/print` (permissão `caixa.fechar`):
  - Renderiza `renderFechamentoHtml()`, insere na fila e responde similarmente.

### 4.2 Endpoints Exclusivos do Agente Local
Autenticação: Header `X-Print-Agent-Token` comparado com `process.env.PRINT_AGENT_TOKEN` via `crypto.timingSafeEqual`.

- `GET /api/impressao/agente/stream` (SSE - Server-Sent Events):
  - Conexão push em tempo real com keep-alive/heartbeat a cada 20 segundos (evita timeout de 100s do Cloudflare e bypass de buffer Nginx com `X-Accel-Buffering: no`).
  - Atualiza continuamente `agent_last_seen = datetime('now','localtime')` no banco.
  - Emite evento `job` com `{ id: job.id }` assim que um documento é enfileirado, garantindo disparo com latência zero (< 100ms) sem spam de requisições.
- `GET /api/impressao/agente/tarefas`:
  - Retorna o próximo job pendente e o avança para `processando` dentro de uma transação SQLite atômica.
  - **Recuperação de falhas (Lease Timeout de 2 minutos):** Se um job estiver com `status = 'processando'` há mais de 2 minutos e `tentativas < 3`, ele é reatribuído automaticamente como pendente com `tentativas = tentativas + 1`. Se `tentativas >= 3`, é marcado como `falha` com erro `Timeout de execução`.
- `POST /api/impressao/agente/tarefas/:id/concluir`:
  - Recebe `{ ok: true }` ou `{ ok: false, error: "..." }`.
  - Atualiza o job para `concluido` com `printedat = datetime('now','localtime')` ou `falha`.
- `POST /api/impressao/agente/ping`:
  - Heartbeat leve caso a conexão SSE esteja em reconexão.

### 4.3 Fallback Automático para Navegador (Agente Offline)
- O backend calcula a disponibilidade do agente em tempo real:
  `agenteOnline = agent_mode === 1 && agent_last_seen >= datetime('now', '-35 seconds')`.
- Se o agente estiver **Online**: responde `{ ok: true, mode: "queue", message: "Documento enviado para a impressora da loja." }`.
- Se o agente estiver **Offline** (PC desligado, dormindo ou sem internet): não deixa a impressão represada; responde automaticamente `{ ok: true, mode: "browser", message: "Impressora da loja indisponível. Abrindo no navegador...", printUrl: "..." }`, acionando o diálogo local do navegador e alertando o operador.

---

## 5. Arquitetura do Agente Local (Windows - PC Edu)

- Localização no repositório: `local-agent/` (ou `services/print-agent/`).
- Runtime: Node.js 22 LTS (já instalado na máquina).
- Execução:
  - Consome o endpoint seguro da nuvem via HTTPS.
  - Executa a função `printHtml()` do módulo `serverPrinter.js` já comprovado.
  - O script PowerShell executa Chrome ou Edge headless com perfil temporário descartável, flag `--kiosk-printing`, garantindo impressão em silêncio absoluto e com as cores/margens exatas em A5.
  - Registrado para iniciar no boot do Windows via arquivo de inicialização ou Windows Task Scheduler.

---

## 6. Frontend

- `frontend/src/utils/printOrdem.js`:
  - Quando a resposta do backend contiver `mode === 'queue'` (ou `mode === 'agent'`), resolve a Promise com sucesso imediatamente sem anexar iframe e sem chamar `window.print()`.
- Telas de atendimento, OS detalhe, propostas e caixa:
  - Exibem o toast de sucesso padrão: *"Documento enviado para a impressora da loja."*.
  - O botão "Visualizar" continua existindo caso o usuário queira abrir o documento na tela para conferência visual.

---

## 7. Estratégia de Testes e Validação

1. **Testes Unitários e de Integração no Backend:**
   - Validação da tabela `print_queue` e constraints de status.
   - Teste de autenticação por token de máquina com rejeição de tokens incorretos/ausentes (timing-safe).
   - Teste das rotas `/print` retornando `mode: "queue"` quando ativado.
   - Teste de concorrência: garantir que um job não seja retirado duas vezes.
2. **Testes no Frontend:**
   - Validação de que `printOrdem` não invoca `browserPrint` quando `mode === 'queue'`.
3. **Teste de Ponta a Ponta Local:**
   - Agente local rodando no PC Edu consumindo da API e imprimindo silenciosamente na Canon G3010.
