# Sistema Arte e Molduras

Sistema operacional da loja Arte e Molduras para atendimento, ordens de serviço, oficina, caixa, clientes, produtos, propostas comerciais, financeiro administrativo, impressão operacional, WhatsApp local e NF-e.

O backend Express também serve o build da SPA em produção. A aplicação roda em Windows Server com PM2, SQLite local em WAL mode e deploy por GitHub Actions self-hosted.

## Visão Rápida

| Item | Estado atual |
|---|---|
| Domínio | `arteemolduras.com.br` |
| Servidor | Windows Server em `C:\sistemaarte` |
| Runtime | Node.js 22 |
| Backend | Express 4 na porta `3001` |
| Frontend | React 18 + Vite 8 |
| Banco | SQLite via `better-sqlite3`, WAL e `foreign_keys=ON` |
| Auth | JWT em cookie HttpOnly `token`, sessão de 12h |
| WhatsApp | Serviço local Baileys em `127.0.0.1:8080` |
| NF-e | `nfewizard-io@1.1.0` em homologação/produção por configuração |
| Testes backend | 56 arquivos, 398 testes passando em 2026-06-19 |

## Arquitetura

```txt
Cloudflare -> Windows Server (PM2)
                |-- Express 4 (porta 3001)
                |     |-- API /api/*
                |     `-- SPA fallback para frontend/dist
                |-- WhatsApp local (porta 8080, 127.0.0.1)
                `-- SQLite (backend/data/oficina.db)
```

Pontos importantes:

- O backend serve a API e o frontend buildado.
- O frontend usa axios com `baseURL=/api` e `withCredentials: true`.
- `GET /api/auth/me` é o handshake de sessão. Retornar `401` sem login é esperado.
- O WhatsApp local é um processo PM2 separado: `sistema-arte-whatsapp`.
- SQLite é single-writer. Não use PM2 cluster sem redesenhar concorrência e testar locks.

## Módulos

| Módulo | Frontend | Backend |
|---|---|---|
| Atendimento | `/atendimento` | `/api/ordens`, `/api/clientes`, `/api/caixa`, `/api/produtos` |
| Dashboard | `/dashboard` | `/api/kpis`, `/api/relatorios` |
| Ordens de Serviço | `/ordens`, `/ordens/:id`, `/ordens/lixeira` | `/api/ordens` |
| Oficina | `/oficina`, `/oficina/:id` | `/api/ordens` com redação/permissões por role |
| Caixa | `/caixa`, `/caixa/:id` | `/api/caixa` |
| Clientes | `/clientes`, `/clientes/:id` | `/api/clientes`, `/api/consulta` |
| Produtos | `/produtos` | `/api/produtos` |
| Propostas | `/propostas`, `/orcamento` | `/api/propostas` |
| Calculadora rápida | `/orcamento/calculadora` | pode gerar OS imediata ou proposta |
| Financeiro admin | `/financeiro` | `/api/financeiro` |
| NF-e | `/nfe`, `/nfe/lixeira` | `/api/nfe` |
| Usuários | `/usuarios` | `/api/users` |
| Configurações | `/configuracoes` | `/api/configuracoes`, `/api/backup` |

Rotas legadas/redirecionadas:

- `/relatorios` redireciona para `/financeiro`.
- `/orcamento-rapido` redireciona para `/orcamento/calculadora`.

## Stack

| Área | Tecnologia |
|---|---|
| Backend | Node.js 22, Express 4, CommonJS |
| Banco | SQLite, `better-sqlite3`, WAL |
| Frontend | React 18, Vite 8, React Router 6 |
| UI | CSS operacional, tokens globais, lucide-react |
| Testes | Vitest 4.1 |
| NF-e | `nfewizard-io@1.1.0`, Java 21 em CI |
| WhatsApp | `whatsapp-service` com Baileys |
| Deploy | GitHub Actions self-hosted, robocopy, PM2 fork |
| Impressão | HTML imprimível e impressão direta via PowerShell/Windows |

O `package.json` da raiz não é um workspace de desenvolvimento. Instale e rode comandos por serviço: `backend`, `frontend` e `whatsapp-service`.

## Rodar Localmente

### Backend

```powershell
cd backend
npm.cmd install
$env:NODE_ENV="development"
$env:JWT_SECRET="dev-secret-local"
npm.cmd run dev
```

Backend: `http://localhost:3001`

O seed de desenvolvimento roda somente com `NODE_ENV=development` ou `SEED_DEV=1`.

| Usuário | Senha | Role |
|---|---|---|
| `admin` | `admin123` | `admin` |
| `caixa` | `caixa123` | `caixa` |
| `oficina` | `oficina123` | `oficina` |

### Frontend

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Frontend: `http://localhost:5173`

### WhatsApp Local

```powershell
cd whatsapp-service
npm.cmd install
npm.cmd start
```

O serviço escuta por padrão em `http://127.0.0.1:8080`. Em produção, a instância operacional atual é `ArteeMolduras`.

## Comandos Úteis

```powershell
# Backend
cd backend
npm.cmd test

# Frontend
cd frontend
npm.cmd test
npm.cmd run build

# WhatsApp local
cd whatsapp-service
npm.cmd test
```

No Windows, prefira `npm.cmd` quando o PowerShell bloquear `npm.ps1`.

## Variáveis de Ambiente

Arquivo de produção principal: `C:\sistemaarte\backend\.env`.

O `.env`, bancos, certificados, XMLs fiscais e `backend/data/` não são versionados nem sobrescritos pelo deploy.

Exemplo mínimo:

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=<segredo-longo>
CONFIG_SECRET_KEY=<chave-forte-para-segredos-configuraveis>
CORS_ORIGINS=https://arteemolduras.com.br
TRUST_PROXY=1

NFE_AMBIENTE_NUM=2
NFE_CERT_PATH=C:\sistemaarte\backend\certs\certificado.pfx
NFE_CERT_PASSWORD=<senha-do-certificado>
NFE_CNPJ_EMITENTE=<cnpj>
NFE_SECRET_KEY=<chave-forte-para-segredos-fiscais>

WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=web_local
WHATSAPP_WEB_ENABLED=true
WHATSAPP_WEB_BASE_URL=http://127.0.0.1:8080
WHATSAPP_WEB_INSTANCE=ArteeMolduras
WHATSAPP_WEB_API_KEY=<mesma-chave-do-servico-local>
```

Configurações de empresa, fiscal, certificado, autorizados XML, WhatsApp, impressão, backups e segurança também são geridas por `/configuracoes`.

## Regras Críticas

- Status válidos de OS: `Aguardando`, `Em Produção`, `Pronto`, `Entregue`, `Cancelado`.
- Nunca grave `Em Producao` sem acento em dados, SQL ou testes.
- Use `Cancelado` em SQL. O alias legado `Cancelada` só existe em `normalizarStatus()`.
- Saldo de OS deve vir de `getResumoFinanceiroOS()` em `backend/domain/financeiroRules.js`.
- Lançamentos `pago=0` ou `deletedat IS NOT NULL` não abatem saldo.
- Uma OS só pode virar `Entregue` com saldo zero.
- Migrations em produção são aditivas: `ALTER TABLE ADD COLUMN` ou `CREATE TABLE IF NOT EXISTS`.
- `resolveClienteData()` busca telefone/CPF por nome quando não há `clienteid`; isso é UX deliberada.
- `auth()` revalida usuário ativo e role atual em cada request.
- `oficina` só deve alterar status e receber dados redigidos quando houver informação sensível.

Detalhes para agentes e implementadores ficam em `AGENTS.md`.

## NF-e

Fluxos implementados:

- Preview fiscal antes de emitir: `GET /api/nfe/emitir/:id/preview`
- Emissão: `POST /api/nfe/emitir/:id`
- Listagem: `GET /api/nfe`
- Lixeira fiscal: `GET /api/nfe/lixeira`
- XML de autorização: `GET /api/nfe/:chave/xml/autorizacao`
- DANFE HTML: `GET /api/nfe/:chave/danfe`
- CC-e: `POST /api/nfe/:chave/cce`
- Cancelamento: `POST /api/nfe/:chave/cancelar`
- Inutilização manual: `GET/POST /api/nfe/inutilizacoes`

Pontos fiscais que não devem ser improvisados:

- `montarNFe()` retorna sempre `{ infNFe: {...} }`.
- `config.nfe.ambiente` deve ser número: `1` produção, `2` homologação.
- No Windows, `config.lib.useOpenSSL = false`.
- CSOSN 400 usa tag `ICMSSN102`; `ICMSSN400` não existe no schema.
- PIS/COFINS no Simples Nacional usam `PISNT`/`COFINSNT` com `CST: '07'`.
- XML fiscal é salvo em banco e em `backend/data/nfe_xmls/`.
- Rejeições SEFAZ são formatadas por `formatarRejeicaoSefaz()`.

Runbook específico: `docs/nfe-inutilizacao-operacao.md`.

## Backups

- Backup local diário às 2h BRT.
- Diretório local: `backend/data/backups/`.
- Rotação local: 7 arquivos.
- Status: `GET /api/backup/status` e tela `/configuracoes`.
- Backup offsite Oracle Object Storage existe como recurso opcional, ativado por `OFFSITE_BACKUP_ENABLED=1`.

Detalhes do offsite: `docs/backup-offsite-oracle.md`.

## Deploy e CI/CD

Fluxo recomendado:

```txt
develop -> PR -> main -> deploy automático
```

CI:

- `.github/workflows/ci.yml` roda em push para `develop` e PR para `main`/`develop`.
- CI instala dependências do backend, executa `npm audit --omit=dev` e roda `npm test`.

Deploy:

- `.github/workflows/deploy.yml` roda em push para `main` no runner self-hosted.
- Executa testes backend e audit.
- Instala dependências do frontend, audita e roda build.
- Publica `frontend/dist` com `robocopy /MIR`.
- Sincroniza `backend/` excluindo `node_modules`, `data`, `certs`, `.env` e `*.db`.
- Instala runtime do backend com `npm ci --omit=dev`.
- Grava `C:\sistemaarte\backend\.deploy-trigger`.
- A tarefa agendada `PM2-DeployRestart` detecta a sentinela e reinicia o PM2.

Processos PM2 de produção:

```powershell
pm2 restart sistemaarte-backend --update-env
pm2 restart sistema-arte-whatsapp --update-env
pm2 logs sistemaarte-backend --lines 80
pm2 logs sistema-arte-whatsapp --lines 80
```

## Estrutura

```txt
backend/
  __tests__/              Testes Vitest
  data/                   oficina.db, backups e XMLs fiscais, não versionados
  domain/                 Regras de negócio e validadores centrais
  middlewares/            Auth, CSRF origin guard, error handler
  routes/                 Endpoints por recurso
  services/               Serviços de domínio com estado externo
  utils/                  NF-e, WhatsApp, impressão, datas, números, backups
  database.js             Schema, migrations, WAL e backup
  ecosystem.config.js     PM2
  server.js               Entry point Express

frontend/src/
  components/             Layout, sidebar, modais e componentes de domínio
  context/                AuthContext
  pages/                  Telas principais
  services/               Axios e event bus
  styles/                 Tokens e CSS operacional
  utils/                  Impressão, WhatsApp, desconto e helpers de UI

whatsapp-service/
  src/                    Express local e cliente Baileys
  sessions/               Sessões locais, não versionadas
  ecosystem.config.js     PM2 do serviço local
```

## Documentação Relacionada

- `AGENTS.md` - contexto obrigatório para IA e alterações de código.
- `backend/ARCHITECTURE.md` - arquitetura resumida do backend.
- `whatsapp-service/README.md` - contrato e operação do serviço local.
- `docs/nfe-inutilizacao-operacao.md` - runbook de inutilização segura.
- `docs/backup-offsite-oracle.md` - backup offsite criptografado.
- `docs/whatsapp-service-mini-evolution.md` - evolução do serviço local.
- `docs/superpowers/` - specs e planos históricos de implementação.
