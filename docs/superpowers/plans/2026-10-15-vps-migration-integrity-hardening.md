# VPS Migration Integrity & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabilizar, proteger e blindar integralmente o Sistema Arte e Molduras no VPS Ubuntu 24.04 (`187.127.22.223`), sanando todas as 25 vulnerabilidades e inconsistências diagnosticadas na auditoria (firewall UFW, Nginx Cloudflare Real-IP, permissões Unix, fuso horário America/Sao_Paulo, rotação de backups locais, bug da lixeira de OS, estorno financeiro de contas no caixa, resiliência do Puppeteer, remoção limpa do serviço automatizado de WhatsApp em prol do envio manual assistido, e atualização completa da documentação expurgando resíduos legados do Windows Server).

**Architecture:** Cloudflare WAF/Proxy -> Nginx (reverse proxy escutando apenas com SSL e porta 80 redirecionando 301, restaurando o IP real via `CF-Connecting-IP`, com gzip e SSE buffering otimizado) -> Express 4 escutando exclusivamente em `127.0.0.1:3001` -> SQLite com modo WAL e `busy_timeout = 5000`. Impressão operacional via navegador (`mode: 'browser'`). Notificação de WhatsApp assistida manual (`wa.me` / protocolo desktop local) desvinculada do daemon Baileys.

**Tech Stack:** Node.js 22 LTS, Express 4, better-sqlite3 (WAL), React 18, Vite 8, Nginx, UFW, PM2 Linux, Google Chrome Headless, Vitest 4.1.

**Spec:** [`AUDITORIA_MASTER_VPS.md`](file:///C:/Users/sinayder/.gemini/antigravity/brain/76edbb32-a671-4f3e-9147-26472eab0970/AUDITORIA_MASTER_VPS.md) e diretrizes operacionais do usuário.

## Global Constraints

- **Zero Regressões de Negócio:** Nenhuma regra canônica de OS (status com acentos, saldo via `getResumoFinanceiroOS()`, bloqueio de entrega com saldo pendente) ou NF-e pode ser alterada ou enfraquecida.
- **Segurança Máxima:** Nenhuma porta de backend (3001) pode permanecer exposta publicamente na internet. Acesso direto só via Nginx/Cloudflare ou localhost.
- **Estabilidade de Produção:** Qualquer teste ou validação que envolva escrita no banco deve ser executado com cópia isolada ou testes automatizados via `vitest`. O banco vivo `/var/www/sistemaarte/backend/data/oficina.db` só recebe migrações ou alterações devidamente validadas.
- **WhatsApp:** Não subir nem reativar o `whatsapp-service` com Baileys na VPS. Preservar estritamente o modo manual assistido (links no navegador/app desktop) que já funciona perfeitamente e previne bloqueios de chip pela Meta.
- **Expurgo de Resíduos Windows:** Eliminar scripts, comandos e referências obsoletas a `powershell.exe`, spooler SMB `\\ARTESERVER\Impressoraloja`, robocopy e caminhos `C:\sistemaarte` do código e da documentação.
- **Comandos de Teste:** Executar testes locais no PowerShell com `npm.cmd test`.

## Review Focus

1. **Restauração de IP do Cloudflare no Express:** Garantir que `req.ip` retorne o IP real do cliente (não o proxy da Cloudflare), impedindo lockout coletivo da loja no rate limit.
2. **Crash da Lixeira de OS:** Garantir que `/ordens/lixeira` trate tanto array simples quanto resposta paginada `{ data, meta }` sem lançar `TypeError`.
3. **Fuso Horário e Virada de Mês:** Garantir que transições de OS e lançamentos de caixa feitos após as 21:00 BRT não recebam data do dia seguinte no SQLite e no Node.
4. **Desconexão do Chrome em DANFE PDF:** Garantir que se o Chrome cair, a instância de navegador se recupere sem travar a rota de DANFE permanentemente.
5. **Estorno de Conta a Pagar no Caixa:** Garantir que excluir uma saída do caixa associada a uma conta a pagar reverta a conta para pendente sem corromper lançamentos regulares.

---

### Task 1: VPS Hardening, Firewall e Nginx (Infraestrutura)

**Files:**
- Modify: `backend/server.js` (binding em `127.0.0.1`)
- VPS Remote: `/etc/nginx/sites-available/sistemaarte`
- VPS Remote: `/etc/default/ufw` / regras UFW

**Interfaces:**
- Produces: Express restrito a `127.0.0.1:3001`; Nginx com `CF-Connecting-IP`, redirect HTTP->HTTPS 301, gzip e buffer SSE desativado; Firewall UFW bloqueando acesso externo direto à porta 3001.

- [ ] **Step 1: Teste local de binding do Express**
  Verificar em `backend/server.js` que `app.listen(PORT, '127.0.0.1')` ou host configurável via variável `HOST` padrão `127.0.0.1` seja utilizado em vez de escutar em todas as interfaces (`0.0.0.0`).
- [ ] **Step 2: Alterar `backend/server.js` para vincular ao host local**
  Garantir `const HOST = process.env.HOST || '127.0.0.1';` e `app.listen(PORT, HOST, ...)`.
- [ ] **Step 3: Fechar porta 3001 no UFW do VPS**
  Executar no VPS:
  `ufw delete allow 3001/tcp`
  `ufw status` (confirmar que 3001 não está mais na lista de portas abertas publicamente).
- [ ] **Step 4: Atualizar configuração do Nginx no VPS com Real-IP do Cloudflare e Redirect 301**
  Configurar no `/etc/nginx/sites-available/sistemaarte`:
  - Bloco HTTP porta 80 com `return 301 https://$host$request_uri;`
  - Diretivas `set_real_ip_from` para toda a faixa oficial de IPs do Cloudflare (IPv4 e IPv6) e `real_ip_header CF-Connecting-IP;`
  - Compressão `gzip on; gzip_types text/plain text/css application/json application/javascript text/xml;`
  - Bloco de location `/api/kpis/stream` com `proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s;`
- [ ] **Step 5: Testar e recarregar Nginx no VPS**
  Executar no VPS: `nginx -t && nginx -s reload`.
  Testar externamente: `curl -I http://187.127.22.223:3001/api/health` deve falhar/dar timeout. `curl -I http://arteemolduras.com.br` deve retornar `301 Moved Permanently`. `curl -I https://arteemolduras.com.br/api/health` deve retornar `200 OK`.
- [ ] **Step 6: Instalar e configurar Fail2ban no VPS**
  Executar no VPS: `apt-get update && apt-get install -y fail2ban && systemctl enable --now fail2ban`.
- [ ] **Step 7: Ajustar permissões Unix estritas no VPS**
  Executar no VPS:
  ```bash
  chmod 755 /var/www/sistemaarte
  find /var/www/sistemaarte -type d -exec chmod 750 {} +
  find /var/www/sistemaarte -type f -exec chmod 640 {} +
  chmod 600 /var/www/sistemaarte/backend/.env
  chmod 600 /var/www/sistemaarte/backend/certs/*.pfx
  chmod 660 /var/www/sistemaarte/backend/data/oficina.db*
  ```

---

### Task 2: Fuso Horário, Memória SWAP e SQLite Busy Timeout (Ambiente & Banco)

**Files:**
- Modify: `backend/database.js`
- Modify: `backend/ecosystem.config.js`
- VPS Remote: `timedatectl`, `/swapfile`

**Interfaces:**
- Produces: SO e Node operando em `America/Sao_Paulo`; 4GB de SWAP ativa; SQLite com `busy_timeout = 5000` e WAL checkpoint passivo; `.env` alinhado com `NFE_AMBIENTE=producao`.

- [ ] **Step 1: Escrever teste de configuração do SQLite (busy_timeout e WAL)**
  Criar/atualizar teste em `backend/__tests__/databaseMigrations.test.js` para validar que `busy_timeout` do banco é `>= 5000` ms.
- [ ] **Step 2: Aplicar `busy_timeout` em `backend/database.js`**
  Em `backend/database.js` (função `initDB`):
  ```javascript
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  ```
- [ ] **Step 3: Ajustar Fuso Horário no VPS**
  Executar no VPS:
  `timedatectl set-timezone America/Sao_Paulo`
  Validar com `timedatectl` que exibe `Time zone: America/Sao_Paulo (-03, -0300)`.
- [ ] **Step 4: Configurar `TZ: 'America/Sao_Paulo'` no PM2 Ecosystem**
  Em `backend/ecosystem.config.js`, incluir `TZ: 'America/Sao_Paulo'` dentro de `env_production` e `env_dev`. Atualizar caminhos Windows residuais (`cwd: 'C:\\sistemaarte'` -> `/var/www/sistemaarte/backend`, logs em `/var/log/sistemaarte` ou relativo).
- [ ] **Step 5: Criar SWAP de 4GB no VPS**
  Executar no VPS:
  ```bash
  if ! swapon --show | grep -q "/swapfile"; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q "/swapfile" /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swappiness.conf
  fi
  ```
  Validar com `free -m`.
- [ ] **Step 6: Alinhar `.env` do VPS para Produção Fiscal Real**
  No `/var/www/sistemaarte/backend/.env` do VPS, ajustar:
  `NFE_AMBIENTE=producao`
  `NFE_AMBIENTE_NUM=1`
- [ ] **Step 7: Executar testes de banco**
  Rodar: `cd backend; npm.cmd test -- databaseMigrations.test.js`

---

### Task 3: Estabilização do Agendador de Backups e Limpeza de Retenção

**Files:**
- Modify: `backend/database.js`
- Modify: `backend/utils/backupStatus.js`
- VPS Remote: `/var/www/sistemaarte/backend/data/backups/`

**Interfaces:**
- Produces: `_backupDate` inicializada a partir da data do último backup persistido em disco; rotação limpa sem arquivos obsoletos; checkpoint passivo do WAL durante o backup.

- [ ] **Step 1: Escrever teste para inicialização e rotação de backup**
  Criar teste comprovando que ao iniciar o banco, se já existir um backup concluído na data atual, o agendador não dispara um novo backup nos primeiros 5 minutos.
- [ ] **Step 2: Implementar persistência da data do último backup em `database.js`**
  Modificar `initDB()` em `backend/database.js` para carregar `_backupDate` a partir do `lastSuccess` em `backup-status.json` ou do arquivo mais recente em `backend/data/backups/`, formatado na data civil de Brasília (`hoje()`).
- [ ] **Step 3: Adicionar checkpoint passivo do WAL no backup**
  Em `database.js` (função `backup()`):
  Adicionar `db.pragma("wal_checkpoint(PASSIVE)");` antes ou imediatamente após o backup para consolidar páginas sem bloquear leituras.
- [ ] **Step 4: Remover arquivos legados `pre-producao-*.db` na pasta de backups do VPS**
  No VPS, mover ou remover os 2 arquivos `pre-producao-*.db` de `/var/www/sistemaarte/backend/data/backups/`, liberando as 2 vagas sequestradas na retenção.
- [ ] **Step 5: Rodar testes de backup**
  Rodar: `cd backend; npm.cmd test -- backupStatus.test.js`

---

### Task 4: Correções de Regras de Negócio e Tratamento de Datas (Backend)

**Files:**
- Modify: `backend/routes/clientes.js`
- Modify: `backend/routes/caixa.js`
- Modify: `backend/routes/propostas.js`
- Modify: `backend/utils/pdf/danfePdf.js`
- Test: `backend/__tests__/clientesDates.test.js` (novo ou estender existente)
- Test: `backend/__tests__/caixaEstornoContaPagar.test.js` (novo)

**Interfaces:**
- Produces: `routes/clientes.js` usando `hoje()` de Brasília; `DELETE /api/caixa/:id` revertendo conta a pagar associada para `Pendente`; `danfePdf.js` com auto-recuperação do Puppeteer; `propostas.js` com timestamp padronizado.

- [ ] **Step 1: Escrever testes que falham**
  - Teste 1: Em `routes/clientes.js`, OS com prazo de hoje não deve ser marcada como `osVencidas` independentemente de horário (usando `hoje()`).
  - Teste 2: Em `routes/caixa.js`, `DELETE /api/caixa/:id` de um lançamento com `origem === 'conta-pagar'` e `conta_pagar_id` atualiza a conta em `contas_pagar` para `status = 'Pendente'`.
- [ ] **Step 2: Corrigir `routes/clientes.js`**
  Em `backend/routes/clientes.js:77`, substituir:
  ```javascript
  const { hoje } = require("../utils/dates");
  // ...
  const dataHoje = hoje();
  const osVencidas = ordens.filter(o =>
    statusAberto.includes(o.status) && o.prazoentrega && o.prazoentrega < dataHoje
  ).length;
  ```
- [ ] **Step 3: Corrigir estorno de Contas a Pagar em `routes/caixa.js`**
  Em `backend/routes/caixa.js` (rota `DELETE /:id`):
  Ao excluir suavemente o lançamento (`deletedat = datetime('now','localtime')`), se `lancamento.origem === 'conta-pagar'` e `lancamento.conta_pagar_id`, executar:
  ```javascript
  run("UPDATE contas_pagar SET status='Pendente', datapagamento=NULL, updatedat=datetime('now','localtime') WHERE id=?", [lancamento.conta_pagar_id]);
  ```
- [ ] **Step 4: Corrigir resiliência do Puppeteer em `danfePdf.js`**
  Em `backend/utils/pdf/danfePdf.js`:
  - Adicionar listener no browser instanciado:
    ```javascript
    browser.on('disconnected', () => { browserPromise = null; });
    ```
  - Incluir flags Linux de estabilidade nos argumentos do launch:
    `'--disable-dev-shm-usage'`, `'--disable-gpu'`.
- [ ] **Step 5: Padronizar data de criação em `routes/propostas.js`**
  Em `backend/routes/propostas.js` (conversão para OS), padronizar `createdat` da OS gerada para `${hoje()} 00:00:00` (alinhado com o balcão) ou carimbo canônico consistente.
- [ ] **Step 6: Executar suítes de teste**
  Rodar: `cd backend; npm.cmd test -- clientes caixa danfePdf`

---

### Task 5: Correções de Interface (Lixeira de OS e Bloqueio de Impressão Direta)

**Files:**
- Modify: `frontend/src/pages/OrdemLixeira.jsx`
- Modify: `backend/routes/configuracoes.js`
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Test: `frontend/src/pages/OrdemLixeira.test.jsx` (ou estender)

**Interfaces:**
- Produces: `/ordens/lixeira` desempacotando respostas paginadas; `/api/configuracoes/impressao` bloqueando `directPrintEnabled` no Linux; tela de configurações indicando modo Navegador no VPS.

- [ ] **Step 1: Escrever teste para `OrdemLixeira.jsx`**
  Criar/atualizar teste comprovando que ao receber `{ data: [{ id: 1, numero: 'OS-0001' }], meta: { total: 1 } }`, a tabela renderiza as linhas sem disparar `TypeError`.
- [ ] **Step 2: Corrigir desempacotamento de dados em `OrdemLixeira.jsx`**
  Em `frontend/src/pages/OrdemLixeira.jsx:22-23`:
  ```javascript
  const { data } = await api.get('/ordens?lixeira=1');
  setOrdens(Array.isArray(data) ? data : (data?.data || []));
  ```
- [ ] **Step 3: Proteger rota de configuração de impressão direta no backend**
  Em `backend/routes/configuracoes.js`, na rota de salvar configuração de impressão:
  ```javascript
  if (process.platform !== 'win32' && directPrintEnabled) {
    return res.status(400).json({
      error: 'Impressao direta no servidor esta disponivel apenas no Windows Server. Utilize o modo Navegador.'
    });
  }
  ```
- [ ] **Step 4: Atualizar UI de Configurações no frontend**
  Em `frontend/src/pages/Configuracoes.jsx`:
  Exibir informação clara de que no servidor VPS o modo de impressão ativo é "Navegador do usuário" e desabilitar o checkbox de impressão direta quando o servidor reportar plataforma Linux / não-Windows.
- [ ] **Step 5: Validar build e testes do frontend**
  Rodar: `cd frontend; npm.cmd test; npm.cmd run build`

---

### Task 6: Descomissionamento Limpo do Serviço Baileys e Fortalecimento do WhatsApp Manual Assistido

**Files:**
- Modify: `backend/server.js` (desabilitar inicialização de worker web)
- Modify: `backend/routes/configuracoes.js`
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Modify: `backend/utils/whatsappConfig.js`

**Interfaces:**
- Produces: Backend livre de dependências ou tentativas de conexão a `127.0.0.1:8080`; modo manual assistido (`wa.me` / app desktop) destacado e simplificado; tela de configurações informando "Modo Manual Assistido Ativo".

- [ ] **Step 1: Garantir desligamento do worker Baileys no backend**
  Verificar em `backend/server.js` que `startWhatsappWorker()` só inicia se `WHATSAPP_WEB_ENABLED === 'true'`. Garantir que com `WHATSAPP_WEB_ENABLED=false` (padrão de produção), nenhuma conexão ou log espúrio para a porta 8080 seja executado.
- [ ] **Step 2: Ajustar endpoint de status do WhatsApp no backend**
  Em `backend/routes/configuracoes.js`:
  O endpoint `GET /api/configuracoes/whatsapp/web-status` deve retornar status `{ state: 'manual_mode', message: 'Envio manual assistido ativo via navegador' }` quando o serviço local estiver desativado, sem tentar efetuar requisições HTTP para a porta 8080.
- [ ] **Step 3: Ajustar interface de Configurações do WhatsApp**
  Em `frontend/src/pages/Configuracoes.jsx`:
  Destacar a seção de Envio Manual Assistido (links para WhatsApp Web ou Aplicativo Desktop). Deixar claro que a automação em background está pausada por decisão operacional para evitar bloqueios de chip pela Meta.
- [ ] **Step 4: Validar testes de WhatsApp**
  Rodar: `cd backend; npm.cmd test -- whatsappConfigRules.test.js whatsappOficinaUrl.test.js`

---

### Task 7: Rastreamento do Painel Servidor, Sentinela Systemd e Limpeza de Código Untracked

**Files:**
- Track & Modify: `backend/routes/servidor.js`
- Track & Modify: `backend/utils/serverStats.js`
- Track & Modify: `frontend/src/pages/Servidor.jsx`
- VPS Remote: `/etc/systemd/system/deploy-trigger.path` e `.service`
- Modify: `.gitignore`

**Interfaces:**
- Produces: Módulos do painel Servidor versionados no Git com métricas Linux nativas; rotação de logs e reinício via `.deploy-trigger` funcional no Linux via systemd path listener; `scratch/` protegido no `.gitignore`.

- [ ] **Step 1: Blindar `.gitignore` contra vazamento de credenciais locais**
  Adicionar a `.gitignore`:
  ```gitignore
  scratch/
  *.pfx
  ```
- [ ] **Step 2: Refatorar `backend/utils/serverStats.js` para Linux nativo**
  Substituir verificações e comandos Windows residuais (`powershell`, `C:\`, `wmic`) por leitura direta de `/proc/meminfo`, `/proc/loadavg` e `df` no Linux.
- [ ] **Step 3: Alinhar RBAC de `backend/routes/servidor.js`**
  Em `backend/routes/servidor.js`, usar `authPermission('servidor.ver')` ou `authPermission('configuracoes.ver')` em vez de checagem exclusiva de `req.user.role === 'admin'`.
- [ ] **Step 4: Configurar Listener Systemd para `.deploy-trigger` no VPS**
  Criar no VPS:
  1. `/etc/systemd/system/deploy-trigger.path`:
     ```ini
     [Unit]
     Description=Monitora .deploy-trigger para reinicio do backend
     [Path]
     PathModified=/var/www/sistemaarte/backend/.deploy-trigger
     Unit=deploy-trigger.service
     [Install]
     WantedBy=multi-user.target
     ```
  2. `/etc/systemd/system/deploy-trigger.service`:
     ```ini
     [Unit]
     Description=Reinicia o backend do Sistema Arte ao detectar sentinela
     [Service]
     Type=oneshot
     ExecStart=/usr/bin/pm2 restart sistemaarte-backend --update-env
     ```
  3. Ativar: `systemctl daemon-reload && systemctl enable --now deploy-trigger.path`.
- [ ] **Step 5: Adicionar e versionar arquivos do Servidor no Git**
  Executar: `git add backend/routes/servidor.js backend/utils/serverStats.js frontend/src/pages/Servidor.jsx frontend/src/pages/Servidor.test.jsx`.
- [ ] **Step 6: Executar testes do painel servidor**
  Rodar: `cd backend; npm.cmd test -- servidorRoutes.test.js`

---

### Task 8: Modernização do Pipeline de Deploy e Atualização Completa da Documentação

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `backend/ARCHITECTURE.md`
- Modify: `.github/workflows/deploy.yml`
- Modify: `deploy.sh`
- Delete: `deploy.ps1` (obsoleto para deploy local SMB Windows)

**Interfaces:**
- Produces: Documentação canônica 100% atualizada para VPS Ubuntu / Cloudflare / Nginx; pipeline de CI/CD sem dependência de runner Windows ou robocopy.

- [ ] **Step 1: Atualizar `AGENTS.md`**
  - Remover todas as menções a servidor Windows físico, `C:\sistemaarte`, impressora `\\ARTESERVER\Impressoraloja`, robocopy, e Windows Task Scheduler `PM2-DeployRestart`.
  - Documentar a arquitetura real do VPS Ubuntu: Linux 24.04, Cloudflare, Nginx reverse proxy, PM2 com fuso `America/Sao_Paulo`, Express em `127.0.0.1:3001`, SQLite WAL com `busy_timeout=5000`.
  - Documentar a política de WhatsApp: envio manual assistido via navegador/app desktop (sem microserviço Baileys em segundo plano).
  - Atualizar tabela de credenciais, portas e comandos de manutenção.
- [ ] **Step 2: Atualizar `README.md` e `backend/ARCHITECTURE.md`**
  - Alinhar visão geral de arquitetura, requisitos de sistema, fluxo de deploy em VPS Linux e procedimentos de recuperação de desastre.
- [ ] **Step 3: Modernizar `.github/workflows/deploy.yml` e `deploy.sh`**
  - Atualizar o script de deploy para rodar no ambiente Linux, executando `npm ci --omit=dev`, `npm run build` no frontend e sincronização limpa para `/var/www/sistemaarte`.
- [ ] **Step 4: Remover script de rede local Windows obsoleto**
  - Remover `deploy.ps1` que tentava conectar a `\\192.168.15.250\sistemaarte`.

---

### Task 9: Validação Global, Verificação de Não-Regressão e Entrega

**Files:**
- Whole Repository & Production VPS

**Interfaces:**
- Produces: Suíte completa passando (backend e frontend); deploy sincronizado no VPS; testes finais de ponta a ponta em produção via HTTPS.

- [ ] **Step 1: Executar suíte completa de testes no backend**
  Rodar: `cd backend; npm.cmd test`
  Confirmar que todos os testes passam (esperado > 800 testes passando, zero falhas).
- [ ] **Step 2: Executar testes e build de produção do frontend**
  Rodar: `cd frontend; npm.cmd test; npm.cmd run build`
  Confirmar compilação sem warnings ou erros de empacotamento.
- [ ] **Step 3: Sincronizar alterações validadas no VPS de Produção**
  Atualizar os arquivos no VPS `/var/www/sistemaarte` (backend e frontend/dist compilado).
- [ ] **Step 4: Reiniciar processos PM2 no VPS com fuso atualizado**
  Executar no VPS:
  `pm2 restart sistemaarte-backend --update-env`
  `pm2 logs sistemaarte-backend --lines 40 --nostream` (verificar inicialização limpa).
- [ ] **Step 5: Verificação final de sanidade em produção via HTTPS**
  - `curl -I https://arteemolduras.com.br/api/health` -> 200 OK
  - `curl -I https://arteemolduras.com.br/api/auth/me` -> 401 Unauthorized (esperado)
  - `curl -I http://187.127.22.223:3001` -> Bloqueado / Recusado (esperado)
  - Acesso à rota `/ordens/lixeira` no navegador renderizando tabela sem erros.
  - Consulta de status SEFAZ respondendo normalmente.
