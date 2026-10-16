# AGENTS.md - Contexto obrigatório para IA

Este arquivo é a fonte rápida de contexto para agentes de IA que trabalham no Sistema Arte e Molduras. Leia antes de propor ou aplicar alterações.

Objetivo deste documento:

- preservar regras de negócio que quebram produção quando esquecidas;
- apontar os arquivos canônicos do sistema;
- registrar armadilhas conhecidas de backend, frontend, NF-e, WhatsApp, impressão, banco e deploy;
- evitar que histórico de sessões antigas vire regra falsa.

Este arquivo não é changelog. Histórico, specs e planos ficam em `docs/`.

## Identidade

| Item | Valor |
|---|---|
| Sistema | Sistema Arte e Molduras |
| Domínio | `arteemolduras.com.br` |
| IP do Servidor | `187.127.22.223` |
| Repositório | `ersinayder/sistemaarte` |
| Branch protegida | `main` |
| Branch de trabalho | `develop` |
| Servidor | VPS Ubuntu 24.04 LTS (`/var/www/sistemaarte`) |
| Runtime | Node.js 22 LTS |
| Processos PM2 | `sistemaarte-backend` (com `TZ: 'America/Sao_Paulo'`) |

## Arquitetura

```txt
Cloudflare (Proxy / WAF)
  `-> Nginx (portas 80/443, SSL Cloudflare Origin, HTTP->HTTPS 301, CF-Connecting-IP, gzip, unbuffered SSE)
        `-> Express 4 local (127.0.0.1:3001)
              |-- Serve SPA em /var/www/sistemaarte/frontend/dist
              |-- API /api/*
              `-- SQLite local (/var/www/sistemaarte/backend/data/oficina.db)
```

Contratos estruturais:

- O backend Express serve a API e o build do frontend.
- O frontend chama `/api` com `withCredentials: true`.
- Autenticação usa cookie HttpOnly `token` com validade de 12h.
- `Authorization: Bearer` é fallback aceito e útil em testes automatizados e scripts.
- `GET /api/auth/me` retorna `401` quando não há sessão. Isso é esperado.
- SQLite roda com WAL, `busy_timeout = 5000` e `foreign_keys = ON`.
- PM2 roda em modo `fork` com 1 instância. Não ativar cluster sem redesenhar concorrência.
- O reinício do backend em deploy é orquestrado via systemd path unit (`deploy-trigger.path`).

## Stack

| Área | Tecnologia |
|---|---|
| Backend | Node.js 22, Express 4, CommonJS |
| Banco | SQLite com `better-sqlite3`, WAL, `busy_timeout=5000` |
| Frontend | React 18, Vite 8, React Router 6 |
| Web Server | Nginx (reverse proxy, gzip, proxy headers) |
| Proxy/DNS | Cloudflare com SSL e WAF |
| UI | CSS operacional, tokens globais, lucide-react |
| Testes | Vitest 4.1 |
| NF-e | `nfewizard-io@1.1.0`, Java 21 em CI |
| WhatsApp | Envio manual assistido (`wa.me` / app desktop `whatsapp://send`) |
| Impressão | HTML operacional via navegador do usuário (impressão direta no servidor desativada no Linux) |
| Deploy | GitHub Actions self-hosted (Linux), rsync, systemd sentinela, PM2 |

## Regras Críticas de OS

Status válidos, com acentos:

```txt
Aguardando -> Em Produção -> Pronto -> Entregue
                                  `-> Cancelado
```

Regras:

- Nunca usar `Em Producao` sem acento em dados, SQL, testes ou UI.
- Nunca criar status `Recebido`; é legado removido do fluxo.
- O alias legado suportado é apenas `Cancelada -> Cancelado`, via `normalizarStatus()`.
- Em SQL, usar somente `Cancelado`.
- Transições inválidas são bloqueadas por `validarStatus()` em `backend/domain/ordensRules.js`.
- Para entregar uma OS, o saldo deve ser zero em todas as rotas que alteram status.
- `oficina` pode atualizar status, mas não tem permissão geral de edição de OS.

Arquivos canônicos:

- `backend/domain/ordensRules.js`
- `backend/routes/ordens.js`
- `frontend/src/pages/Ordens.jsx`
- `frontend/src/pages/OrdemDetalhe.jsx`
- `frontend/src/pages/Oficina.jsx`

## Regras Financeiras

Fonte única de saldo de OS:

```js
const { getResumoFinanceiroOS } = require("../domain/financeiroRules");
```

Não reimplementar saldo inline.

Regras:

- Lançamentos com `pago=0` não abatem saldo.
- Lançamentos com `deletedat IS NOT NULL` são ignorados no saldo.
- Saldo nunca fica abaixo de zero.
- Pagamento excedente deve ser tratado com `Math.max(0, saldo)`.
- `getResumoFinanceiroOS()` é usado por OS, impressão, caixa e validação de entrega.
- Contas a pagar quitadas criam lançamento de saída no caixa.
- Financeiro admin (`/financeiro`, `/api/financeiro`) é exclusivo de `admin`.
- Caixa diário é operacional; financeiro admin é gerencial.

Arquivos canônicos:

- `backend/domain/financeiroRules.js`
- `backend/domain/financeiroAdminRules.js`
- `backend/routes/caixa.js`
- `backend/routes/financeiro.js`
- `frontend/src/pages/Caixa.jsx`
- `frontend/src/pages/Financeiro.jsx`

## Cliente por Nome é Intencional

`resolveClienteData()` em `backend/routes/ordens.js` busca telefone/CPF pelo nome quando `clienteid` não é fornecido:

```js
const cli = getOne("SELECT phone, cpf FROM clientes WHERE name=? LIMIT 1", [clientenome]);
```

Isso é UX deliberada para atendimento rápido. Não alterar sem validar o fluxo de criação de OS no frontend.

Se houver nomes ambíguos, o operador deve informar `clienteid` explicitamente.

## Roles

| Role | Permissões principais |
|---|---|
| `admin` | Tudo, incluindo lixeira, exclusão permanente, usuários, configurações e financeiro admin |
| `caixa` | Atendimento, OS, clientes, produtos, caixa, propostas e NF-e |
| `oficina` | Oficina e atualização de status, com dados sensíveis redigidos |

`auth()` revalida usuário ativo e role atual a cada request. Se o usuário for desativado ou mudar de role, a sessão antiga deixa de valer.

## Banco de Dados

Arquivo real:

```txt
backend/data/oficina.db
```

Esse arquivo não é commitado.

Regras:

- Nunca recriar tabela existente em produção.
- Novas colunas entram no array `migrations[]` em `backend/database.js`.
- Usar `ALTER TABLE ADD COLUMN` para campos novos.
- Tabelas novas devem usar `CREATE TABLE IF NOT EXISTS`.
- Não remover, renomear ou alterar tipo de coluna existente sem plano de migração explícito.
- `backend/data/`, `*.db`, XMLs fiscais e certificados nunca entram no git.
- Backups locais ficam em `backend/data/backups/`.
- XMLs de NF-e ficam em `backend/data/nfe_xmls/`.

Tabelas principais:

- `users`
- `clientes`
- `ordens`
- `ordem_itens`
- `lancamentos`
- `lancamento_itens`
- `statuslog`
- `produtos`
- `propostas`
- `proposta_itens`
- `contas_pagar`
- `sequencias`
- `empresa_config`
- `fiscal_config`
- `nfe_sequencias`
- `nfe_autxml`
- `nfe_eventos`
- `nfe_inutilizacoes`
- `whatsapp_config`
- `whatsapp_avisos`
- `impressao_config`

## Seed de Desenvolvimento

O seed de usuários padrão só roda quando:

```js
process.env.NODE_ENV === "development" || process.env.SEED_DEV === "1"
```

Nunca trocar por `NODE_ENV !== "production"`.

Usuários gerados pelo seed:

| Usuário | Senha | Role |
|---|---|---|
| `admin` | `admin123` | `admin` |
| `caixa` | `caixa123` | `caixa` |
| `oficina` | `oficina123` | `oficina` |

## Backend

Rotas montadas em `backend/server.js`:

```txt
/api/auth
/api/users
/api/clientes
/api/ordens
/api/ordens        # também monta impressão/HTML de OS
/api/propostas
/api/caixa
/api/relatorios
/api/financeiro
/api/consulta
/api/backup
/api/produtos
/api/configuracoes
/api/kpis
/api/nfe
/api/health
```

Middlewares globais:

- `helmet()`
- `cors({ origin: allowedOrigins, credentials: true })`
- `express.json()`
- `cookieParser()`
- `csrfOriginGuard({ allowedOrigins })` em `/api`
- rate limit global `/api`: 60 req/min
- `/api/kpis/stream` pula o rate limit global e tem limite SSE próprio
- `errorHandler` no final
- fallback da SPA fora de `/api`

Armadilhas:

- Em produção, `CORS_ORIGINS` é obrigatório.
- `TRUST_PROXY` só ativa com `TRUST_PROXY=1` ou `TRUST_PROXY=true`.
- `csrfOriginGuard` bloqueia métodos não seguros por `Origin/Referer`; testes PowerShell funcionam melhor com Bearer token.
- Erros SQLite devem ser sanitizados por `errorHandler`; não vazar schema.

## Frontend

Rotas reais em `frontend/src/App.jsx`:

```txt
/
/login
/atendimento
/dashboard
/ordens
/ordens/lixeira
/ordens/:id
/oficina
/oficina/:id
/caixa
/caixa/:id
/clientes
/clientes/:id
/financeiro
/relatorios                 -> redirect para /financeiro
/orcamento                  -> Nova proposta
/orcamento/calculadora      -> Calculadora rápida
/orcamento-rapido           -> redirect para /orcamento/calculadora
/propostas
/produtos
/usuarios
/configuracoes
/nfe
/nfe/lixeira
```

Regras:

- Derivar rotas de `App.jsx`, não de memória.
- `oficina` entra por padrão em `/oficina`; `admin` e `caixa` entram em `/atendimento`.
- Não guardar JWT em `localStorage`.
- Usar `frontend/src/services/api.js` para chamadas HTTP.
- Em chamadas de status/health/WhatsApp/preview fiscal/impressão, usar `skipGlobalErrorToast` quando apropriado para evitar cascata de toasts.
- Preservar estilo operacional: telas densas, sem hero/landing page, sem UI de marketing.
- Reutilizar tokens/classes globais antes de inventar CSS isolado: `btn`, `card`, `form-input`, `badge`, `table-wrap`, `mobile-record-*`.
- Impressões operacionais são HTML imprimível vindo do backend.
- Não criar PDF binário no frontend para OS, proposta, caixa, financeiro ou DANFE.

## Mapa de Arquivos

```txt
backend/
  domain/                  Regras de negócio e validadores
  middlewares/             Auth, CSRF, error handler
  routes/                  Endpoints por recurso
  services/                Serviços com estado externo
  utils/                   NF-e, WhatsApp, impressão, datas, números, backups
  data/                    Banco, backups e XMLs fiscais, não versionados
  database.js              Schema, migrations, WAL, backup
  server.js                Entry point Express
  ecosystem.config.js      PM2 backend

frontend/src/
  components/              Layout, modais e componentes compartilhados
  context/                 AuthContext
  pages/                   Telas principais
  services/                Axios centralizado
  styles/                  CSS operacional e tokens
  utils/                   Helpers de impressão, WhatsApp e UI

whatsapp-service/          (Legado descomissionado — substituído por envio manual assistido)
```

## NF-e

Estado atual:

- Emissão, cancelamento, CC-e, DANFE HTML, XML legal, eventos fiscais e inutilização manual existem.
- Preview fiscal editável existe antes de emitir pela tela `/nfe`.
- Lixeira fiscal existe em `/nfe/lixeira` e é separada da lixeira de OS.
- A lixeira fiscal deve aceitar somente notas rejeitadas. Não mover nota autorizada/cancelada para lixeira.

Endpoints principais:

```txt
GET    /api/nfe
GET    /api/nfe/lixeira
GET    /api/nfe/status-servico
GET    /api/nfe/emitir/:id/preview
POST   /api/nfe/emitir/:id
GET    /api/nfe/:chave/eventos
GET    /api/nfe/ordem/:ordemId/eventos
GET    /api/nfe/:chave/xml/autorizacao
GET    /api/nfe/eventos/:eventoId/xml
GET    /api/nfe/:chave/danfe
POST   /api/nfe/:chave/cce
POST   /api/nfe/:chave/cancelar
DELETE /api/nfe/:id
POST   /api/nfe/:id/restore
GET    /api/nfe/inutilizacoes/contexto
GET    /api/nfe/inutilizacoes
POST   /api/nfe/inutilizacoes
GET    /api/nfe/inutilizacoes/:id/xml/:tipo
```

Contratos da `nfewizard-io`:

```js
const payload = montarNFe({ ordem, itens, cliente, emitente, numero, serie });
// payload = { infNFe: { ide, emit, dest, det, total, transp, pag } }
```

- Acessar `payload.infNFe`, nunca `payload.ide`.
- `NFE_Autorizacao` recebe `{ idLote, indSinc, NFe: { infNFe } }`.
- A resposta de autorização é array; acessar `resultado[0].protNFe.infProt`.
- Cancelamento no código atual usa `wizard.NFE_Cancelamento(eventoPayload)`.
- CC-e usa `wizard.NFE_CartaDeCorrecao(eventoPayload)`.
- Inutilização usa `wizard.NFE_Inutilizacao(payload)`.

Configuração fiscal:

```js
const config = {
  dfe: {
    pathCertificado: path.resolve(certPath),
    senhaCertificado: process.env.NFE_CERT_PASSWORD,
  },
  nfe: {
    ambiente: Number(process.env.NFE_AMBIENTE_NUM),
    versaoDF: "4.00",
  },
  lib: {
    useOpenSSL: false,
  },
};
```

Armadilhas:

- `NFE_CERT_PASSWORD` é o nome correto no código, não `NFE_CERT_SENHA`.
- `config.dfe.pathCertificado` e `config.dfe.senhaCertificado` ficam dentro de `dfe`.
- `config.nfe.ambiente` deve ser número (`1` ou `2`), não string.
- `config.lib.useOpenSSL = false` é padrão seguro adotado no runtime.
- Use `path.resolve()` para certificado.
- `dhEmi`/eventos devem sair com offset `-03:00`, sem milissegundos e sem `Z`.
- CSOSN 400 usa `ICMSSN102`. `ICMSSN400` não existe no XSD.
- PIS/COFINS Simples Nacional usam `PISNT`/`COFINSNT` com `CST: '07'`.
- XML autorizado e eventos devem ser XML real, não JSON da lib.
- Rejeições devem passar por `formatarRejeicaoSefaz()`.
- Nunca transmitir inutilização em produção por script automatizado. Usar UI com confirmação explícita.

Inutilização:

- Tabela: `nfe_inutilizacoes`.
- Confirmação textual é recalculada no backend: `INUTILIZAR 280` ou `INUTILIZAR 280-285`.
- Status locais: `processando`, `autorizado`, `rejeitado`, `incerto`, `falha_local`.
- `incerto` significa não reenviar cegamente.
- XML de envio/retorno fica em banco e em `backend/data/nfe_xmls/inut-...xml`.

Runbook: `docs/nfe-inutilizacao-operacao.md`.

## WhatsApp

A política canônica do sistema é **envio manual assistido**, sem microserviço Baileys em execução:

- O microserviço Baileys em segundo plano (`whatsapp-service` / `sistema-arte-whatsapp`) foi descomissionado por instabilidade e risco de banimento de número.
- Atendimento e OS geram mensagens prontas e abrem diretamente o WhatsApp do atendente:
  - Web: `https://wa.me/{numero}?text={mensagem}`
  - Desktop: `whatsapp://send?phone={numero}&text={mensagem}`
- A rota `/api/whatsapp/avisos` registra a intenção e histórico de mensagens geradas.
- O endpoint `/api/configuracoes/whatsapp/web-status` responde `manual_mode: true` e `connected: true` sem depender de socket local.
- O modo preferencial (Desktop ou Web) é configurado na tela `/configuracoes`.

## Impressão

Regras:

- Impressões operacionais são HTML imprimível servido pelo backend.
- Não gerar PDF binário no servidor para OS/proposta/caixa/financeiro/DANFE.
- `sendPrintHtml()` aplica headers e CSP de impressão.
- OS usa `renderOrdemServicoHtml()` com saldo oficial.
- No VPS Linux (Ubuntu), a impressão direta via spooler SMB (`\\ARTESERVER\Impressoraloja` / PowerShell) não é suportada e está desativada (`process.platform !== 'win32'`).
- O modo canônico de impressão é **Navegador do Usuário**: o operador visualiza o documento e a impressão é acionada pelo browser do cliente (`window.print()`).
- A tela `/configuracoes` exibe o modo Navegador ativo quando executando no servidor Linux.

Endpoints úteis:

```txt
GET  /api/ordens/:id/pdf
POST /api/ordens/:id/print
GET  /api/caixa/fechamento
GET  /api/financeiro/resumo/pdf
GET  /api/financeiro/contas-pagar/pdf
GET  /api/financeiro/contas-receber/pdf
GET  /api/financeiro/dre/pdf
GET  /api/relatorios/producao/pdf
GET  /api/propostas/:id/pdf
GET  /api/nfe/:chave/danfe
```

## Backups

Local:

- Backup diário agendado às 2h BRT (em `backend/server.js`).
- Executa `PRAGMA wal_checkpoint(PASSIVE)` antes do backup para gravar páginas WAL sem bloquear operações de escrita.
- Diretório: `backend/data/backups/`.
- Rotação: 7 arquivos locais mantidos automaticamente.
- Status persistido em `backup-status.json`.
- Tela: `/configuracoes`.
- API: `GET /api/backup/status`.

Offsite:

- Oracle Object Storage criptografado já existe como recurso opcional secundário.
- Ativação por `OFFSITE_BACKUP_ENABLED=1`.
- Detalhes em `docs/backup-offsite-oracle.md`.

Não sobrescrever `backend/data/` no deploy.

## Deploy

CI:

- `.github/workflows/ci.yml` roda em push para `develop` e PR para `main`/`develop` no runner `ubuntu-latest`.
- Instala dependências do backend com `npm ci`.
- Executa `npm audit --omit=dev`.
- Roda `npm test` no backend com Java 21 (para validação de schema XML da NF-e).

Deploy:

- `.github/workflows/deploy.yml` roda em push para `main` no runner Linux self-hosted do VPS Ubuntu.
- Executa testes e auditoria do backend.
- Instala dependências do frontend e compila a SPA (`npm run build`).
- Sincroniza `frontend/dist/` para `/var/www/sistemaarte/frontend/dist/`.
- Sincroniza `backend/` para `/var/www/sistemaarte/backend/` via `rsync`, excluindo `node_modules`, `data`, `certs`, `.env` e `*.db*`.
- Instala runtime do backend com `npm ci --omit=dev`.
- Grava sentinela em `/var/www/sistemaarte/backend/.deploy-trigger`.
- A unidade do systemd `/etc/systemd/system/deploy-trigger.path` detecta a alteração e aciona `deploy-trigger.service` para reiniciar o backend com `pm2 restart sistemaarte-backend --update-env`.

Comandos PM2 no VPS Ubuntu:

```bash
pm2 list
pm2 restart sistemaarte-backend --update-env
pm2 logs sistemaarte-backend --lines 80
pm2 show sistemaarte-backend
```

## Testes e Validação

Baseline validado após modernização VPS (outubro/2026):

```txt
Backend:  87 arquivos de teste, 828 testes passando
Frontend: 14 arquivos de teste, 72 testes passando
```

Comandos no Linux / VPS:

```bash
cd backend
npm test

cd ../frontend
npm test
npm run build
```

Comandos no Windows (desenvolvimento local):

```powershell
cd backend
npm.cmd test

cd ..\frontend
npm.cmd test
npm.cmd run build
```

Focos úteis:

```bash
cd backend
npx vitest run __tests__/routeContracts.test.js
npx vitest run __tests__/nfeInutilizacaoService.test.js
npx vitest run __tests__/ordemPrintRoute.test.js
npx vitest run __tests__/servidorRoutes.test.js
npx vitest run __tests__/workflowSecurity.test.js

cd ../frontend
npx vitest run src/pages/NotasFiscais.test.jsx
npx vitest run src/pages/Configuracoes.test.jsx
npx vitest run src/pages/Servidor.test.jsx
```

Login manual e testes de API:

```bash
# Obter token de sessão:
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sua_senha"}' \
  -c - | grep token | awk '{print $7}')

# Testar endpoint protegido:
curl -s http://localhost:3001/api/nfe \
  -H "Authorization: Bearer $TOKEN"
```

## Armadilhas Conhecidas

- Não assumir que docs antigas em `docs/superpowers/` são fonte canônica; são planos/specs históricos.
- Não usar contagens antigas de testes. Rode a suíte se a contagem importar.
- Não trocar `NFE_CERT_PASSWORD` por nomes em português.
- Não usar `NFeRecepcaoEvento` em exemplos novos; o código atual usa helpers da `nfewizard-io` expostos como `NFE_Cancelamento`, `NFE_CartaDeCorrecao` e `NFE_Inutilizacao`.
- Não recriar microserviço Baileys em produção. Utilizar o fluxo manual assistido.
- Não tentar impressão direta via spooler SMB em Linux; o modo suportado é navegador do usuário.
- Não mover NF-e autorizada/cancelada para lixeira fiscal.
- Não recalcular saldo de OS em SQL improvisado sem comparar com `getResumoFinanceiroOS()`.
- Não alterar `resolveClienteData()` sem validar atendimento no frontend.
- Não expor portas desnecessárias diretamente na internet. No VPS Linux, o UFW deve permitir apenas 80, 443 e SSH (porta 22) preferencialmente restrito ou via Cloudflare Access.

## Documentação Relacionada

- `README.md` - visão geral, setup, deploy e operação.
- `backend/ARCHITECTURE.md` - resumo da arquitetura backend.
- `docs/nfe-inutilizacao-operacao.md` - inutilização manual segura.
- `docs/backup-offsite-oracle.md` - backup offsite Oracle.
- `docs/superpowers/` - specs e planos históricos.
