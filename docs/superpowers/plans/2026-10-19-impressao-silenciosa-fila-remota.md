# Plano de Implementação: Impressão Silenciosa Remota via Fila Segura e Agente Local

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que qualquer usuário em qualquer dispositivo envie impressões de OS, Propostas e Caixa de forma 100% silenciosa e instantânea direto para a Canon no PC da loja através de uma fila segura na nuvem e um agente local.

**Architecture:** O backend na nuvem gerencia uma fila SQLite atômica (`print_queue`) e notifica o agente local via SSE / endpoints protegidos por token de máquina. O agente local no Windows consome a fila e dispara o Chrome/Edge headless nativo sem abrir nenhuma interface gráfica.

**Tech Stack:** Node.js 22 LTS, Express 4, better-sqlite3 (WAL), Server-Sent Events (SSE), Vitest 4.1, PowerShell / Chrome-headless A5.

**Spec:** `docs/superpowers/specs/2026-10-19-impressao-silenciosa-fila-remota-design.md`

## Global Constraints

- Backend em CommonJS, Node 22, SQLite com WAL e `busy_timeout = 5000`.
- Não quebrar rotas existentes ou regras de negócio canônicas (`getResumoFinanceiroOS`, `renderOrdemServicoHtml`).
- Todas as datas no fuso horário `America/Sao_Paulo` (UTC-3).
- Autenticação do agente local com `crypto.timingSafeEqual`.
- Zero dependências npm desnecessárias.

## Review Focus

1. **Token ausente ou incorreto:** Retornar 401 sem vazar detalhes de erro.
2. **Concorrência de tarefas:** Dois nós ou requisições concorrentes não podem puxar o mesmo job (transação atômica SQLite).
3. **Agente offline:** Fallback automático e gracioso para `mode: "browser"` se `agent_last_seen` for maior que 35 segundos.
4. **Jobs travados em `processando`:** Recuperação automática de lease após 2 minutos e limite de 3 tentativas antes de marcar `falha`.
5. **Comandos PowerShell:** Sanitização estrita contra injeção de parâmetros ou caminhos arbitrários.

---

### Task 1: Banco de Dados e Regras de Domínio da Fila (`print_queue`)

**Files:**
- Create: `backend/domain/printQueueRules.js`
- Modify: `backend/database.js`
- Test: `backend/__tests__/printQueueRules.test.js`

- [ ] **Step 1:** Escrever teste de falha em `backend/__tests__/printQueueRules.test.js` cobrindo:
  - Validação de payload de enfileiramento (tipo aceito: `ordem`, `proposta`, `caixa`; html obrigatório; cópias 1 ou 2; papel A5/A4).
  - Normalização de dados e transição de estados válidos (`pendente` -> `processando` -> `concluido` / `falha`).
  - Cálculo de disponibilidade do agente (`isAgenteOnline` com limiar de 35 segundos).
  - Regra de lease timeout (reatribuição para `pendente` se `processando` > 2 min e `tentativas < 3`).
- [ ] **Step 2:** Executar teste para confirmar falha:
  `cd backend && npx vitest run __tests__/printQueueRules.test.js`
- [ ] **Step 3:** Implementar `backend/domain/printQueueRules.js`.
- [ ] **Step 4:** Adicionar migração da tabela `print_queue` e colunas `agent_mode`, `agent_last_seen` em `backend/database.js`.
- [ ] **Step 5:** Executar testes unitários e de migração para confirmar aprovação:
  `cd backend && npx vitest run __tests__/printQueueRules.test.js`
- [ ] **Step 6:** Commit das alterações de domínio e banco:
  `git commit -am "feat: add print queue domain rules and database migration"`

---

### Task 2: Endpoints Seguros do Agente Local no Backend

**Files:**
- Create: `backend/routes/impressaoAgente.js`
- Modify: `backend/server.js`
- Modify: `backend/domain/permissionRules.js`
- Test: `backend/__tests__/impressaoAgenteRoutes.test.js`

- [ ] **Step 1:** Escrever teste em `backend/__tests__/impressaoAgenteRoutes.test.js` cobrindo:
  - Rejeição de requisições sem `X-Print-Agent-Token` ou com token inválido (401).
  - Endpoint `GET /api/impressao/agente/tarefas` retornando o próximo job atômico e marcando como `processando`.
  - Endpoint `POST /api/impressao/agente/tarefas/:id/concluir` marcando `concluido` com timestamp ou `falha` com erro.
  - Endpoint `POST /api/impressao/agente/ping` atualizando `agent_last_seen`.
  - Endpoint SSE `GET /api/impressao/agente/stream` com keep-alive e evento `job` ao enfileirar.
- [ ] **Step 2:** Executar teste para confirmar que falha:
  `cd backend && npx vitest run __tests__/impressaoAgenteRoutes.test.js`
- [ ] **Step 3:** Implementar middleware de autenticação timing-safe por token de agente e a rota `backend/routes/impressaoAgente.js`.
- [ ] **Step 4:** Montar rota `/api/impressao/agente` em `backend/server.js`.
- [ ] **Step 5:** Executar testes para validar:
  `cd backend && npx vitest run __tests__/impressaoAgenteRoutes.test.js`
- [ ] **Step 6:** Commit:
  `git commit -am "feat: add authenticated print agent routes and sse stream"`

---

### Task 3: Integração do Enfileiramento nas Rotas de Documentos (OS, Proposta, Caixa)

**Files:**
- Modify: `backend/routes/pdf.js`
- Modify: `backend/routes/propostas.js`
- Modify: `backend/routes/caixa.js`
- Test: `backend/__tests__/ordemPrintRoute.test.js`
- Test: `backend/__tests__/propostaPrintRoute.test.js`

- [ ] **Step 1:** Atualizar teste `backend/__tests__/ordemPrintRoute.test.js` para validar que:
  - Quando o agente está Online (`isAgenteOnline === true`): enfileira em `print_queue` e responde `{ ok: true, mode: "queue", message: "OS enviada para a impressora da loja.", jobId }`.
  - Quando o agente está Offline: responde `{ ok: true, mode: "browser", printUrl: "..." }`.
- [ ] **Step 2:** Executar teste para verificar falha nas novas expectativas:
  `cd backend && npx vitest run __tests__/ordemPrintRoute.test.js`
- [ ] **Step 3:** Atualizar `backend/routes/pdf.js` para injetar o job na fila e notificar ouvintes SSE.
- [ ] **Step 4:** Adicionar enfileiramento similar em `backend/routes/propostas.js` e `backend/routes/caixa.js`.
- [ ] **Step 5:** Executar suíte de testes de rotas de impressão para garantir aprovação:
  `cd backend && npx vitest run __tests__/ordemPrintRoute.test.js`
- [ ] **Step 6:** Commit:
  `git commit -am "feat: integrate document print routes with silent print queue"`

---

### Task 4: Frontend - Consumo do Modo Fila Silenciosa

**Files:**
- Modify: `frontend/src/utils/printOrdem.js`
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Test: `frontend/src/utils/__tests__/printOrdem.test.js`

- [ ] **Step 1:** Escrever/atualizar teste em `frontend/src/utils/__tests__/printOrdem.test.js` para garantir que:
  - `data.mode === 'queue'` NÃO chama `browserPrint` / `printUrlInPage`.
  - `data.mode === 'browser'` chama `browserPrint` normalmente.
- [ ] **Step 2:** Executar teste frontend para confirmar comportamento:
  `cd frontend && npm test -- src/utils/__tests__/printOrdem.test.js`
- [ ] **Step 3:** Atualizar `frontend/src/utils/printOrdem.js` para tratar `data.mode === 'queue'`.
- [ ] **Step 4:** Atualizar a aba Impressão em `frontend/src/pages/Configuracoes.jsx` para exibir o status do Agente Local (Online/Offline, último visto, tarefas pendentes).
- [ ] **Step 5:** Executar testes do frontend:
  `cd frontend && npm test`
- [ ] **Step 6:** Commit:
  `git commit -am "feat: support silent queue mode in frontend without dialogs"`

---

### Task 5: Agente de Impressão Local para Windows (PC Edu)

**Files:**
- Create: `services/print-agent/agent.js`
- Create: `services/print-agent/iniciar-agente.bat`
- Create: `services/print-agent/README.md`
- Test: `services/print-agent/__tests__/agent.test.js`

- [ ] **Step 1:** Implementar teste unitário para o loop e executor do agente em `services/print-agent/__tests__/agent.test.js`.
- [ ] **Step 2:** Executar teste para verificar funcionamento:
  `cd backend && npx vitest run ../services/print-agent/__tests__/agent.test.js`
- [ ] **Step 3:** Implementar `services/print-agent/agent.js`:
  - Carrega variáveis de ambiente ou arquivo de configuração local (`PRINT_SERVER_URL`, `PRINT_AGENT_TOKEN`, `PRINTER_NAME`).
  - Estabelece SSE para receber jobs instantâneos e mantém reconexão com backoff exponencial.
  - Executa `printHtml()` com o documento recebido e chama o endpoint de conclusão.
- [ ] **Step 4:** Criar `iniciar-agente.bat` para inicialização automática no Windows.
- [ ] **Step 5:** Commit:
  `git commit -am "feat: add local windows print agent service"`

---

### Task 6: Validação de Segurança, Testes E2E e Suíte Completa

**Files:**
- Test: `backend/__tests__/*`
- Test: `frontend/src/*`

- [ ] **Step 1:** Rodar suíte completa do backend (garantir todos os 830+ testes passando):
  `cd backend && npm test`
- [ ] **Step 2:** Rodar suíte completa do frontend e build de produção:
  `cd frontend && npm test && npm run build`
- [ ] **Step 3:** Testar o agente localmente executando uma impressão teste de ponta a ponta na Canon G3010.
- [ ] **Step 4:** Commit final e relatório de verificação.
