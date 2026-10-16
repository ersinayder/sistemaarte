# Sistema Arte e Molduras

Sistema operacional da loja Arte e Molduras para atendimento, ordens de serviço, oficina, caixa, clientes, produtos, propostas comerciais, financeiro administrativo, impressão operacional, WhatsApp assistido e NF-e.

O backend Express também serve o build da SPA em produção. A aplicação roda em VPS Ubuntu 24.04 LTS com Nginx, PM2, SQLite local em WAL mode e deploy automático por GitHub Actions self-hosted.

## Visão Rápida

| Item | Estado atual |
|---|---|
| Domínio | `arteemolduras.com.br` |
| Servidor | VPS Ubuntu 24.04 LTS (`187.127.22.223`) em `/var/www/sistemaarte` |
| Runtime | Node.js 22 LTS |
| Backend | Express 4 na porta `3001` (local via reverse proxy Nginx) |
| Frontend | React 18 + Vite 8 |
| Banco | SQLite via `better-sqlite3`, WAL, `busy_timeout=5000` e `foreign_keys=ON` |
| Auth | JWT em cookie HttpOnly `token`, sessão de 12h |
| WhatsApp | Envio manual assistido (`wa.me` / app desktop) |
| Impressão | Navegador do usuário (HTML imprimível gerado pelo backend) |
| NF-e | `nfewizard-io@1.1.0` em homologação/produção por configuração |
| Testes | 87 arquivos backend (828 testes) + 14 arquivos frontend (72 testes) |

## Arquitetura

```txt
Cloudflare (Proxy / WAF)
  `-> Nginx (portas 80/443, SSL Cloudflare Origin, HTTP->HTTPS 301, CF-Connecting-IP, gzip, unbuffered SSE)
        `-> Express 4 local (127.0.0.1:3001)
              |-- API /api/*
              |-- SPA fallback para /var/www/sistemaarte/frontend/dist
              `-- SQLite (/var/www/sistemaarte/backend/data/oficina.db)
```

Pontos importantes:

- O backend serve a API e os arquivos estáticos do frontend buildado.
- O frontend usa axios com `baseURL=/api` e `withCredentials: true`.
- `GET /api/auth/me` é o handshake de sessão. Retornar `401` sem login é esperado.
- O WhatsApp opera em modo manual assistido pelo operador (sem socket/microserviço vulnerável em background).
- SQLite é single-writer: PM2 roda em modo `fork` com 1 instância. Não use PM2 cluster sem redesenhar concorrência.

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
| Banco | SQLite, `better-sqlite3`, WAL, `busy_timeout=5000` |
| Frontend | React 18, Vite 8, React Router 6 |
| Web Server | Nginx (reverse proxy, gzip, proxy headers) |
| Proxy/DNS | Cloudflare com SSL e WAF |
| UI | CSS operacional, tokens globais, lucide-react |
| Testes | Vitest 4.1 |
| NF-e | `nfewizard-io@1.1.0`, Java 21 em CI |
| WhatsApp | Envio manual assistido (`wa.me` / app desktop) |
| Impressão | HTML operacional via navegador do usuário (impressão direta no servidor desativada no Linux) |
| Deploy | GitHub Actions self-hosted (Linux), rsync, systemd sentinela, PM2 fork |

Instale e rode comandos nos diretórios de cada serviço: `backend` e `frontend`.

## Rodar Localmente

### Backend

```bash
cd backend
npm install
export NODE_ENV="development"
export JWT_SECRET="dev-secret-local"
npm run dev
```

*(No Windows PowerShell: `$env:NODE_ENV="development"`; `$env:JWT_SECRET="dev-secret-local"`; `npm.cmd run dev`)*

Backend: `http://localhost:3001`

O seed de desenvolvimento roda somente com `NODE_ENV=development` ou `SEED_DEV=1`.

| Usuário | Senha | Role |
|---|---|---|
| `admin` | `admin123` | `admin` |
| `caixa` | `caixa123` | `caixa` |
| `oficina` | `oficina123` | `oficina` |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

### WhatsApp

O sistema utiliza **modo manual assistido**. As mensagens de orçamento, OS e avisos de oficina são geradas pelo sistema e acionam o link direto do WhatsApp Web (`wa.me`) ou app Desktop (`whatsapp://send`), sem dependência de microserviço Baileys em execução.

## Comandos Úteis

```bash
# Backend (testes com Vitest)
cd backend
npm test

# Frontend (testes e build de produção)
cd frontend
npm test
npm run build
```

*(No Windows, utilize `npm.cmd` caso a execução de scripts do PowerShell esteja restrita).*

## Variáveis de Ambiente

Arquivo de produção principal: `/var/www/sistemaarte/backend/.env`.

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
NFE_CERT_PATH=/var/www/sistemaarte/backend/certs/certificado.pfx
NFE_CERT_PASSWORD=<senha-do-certificado>
NFE_CNPJ_EMITENTE=<cnpj>
NFE_SECRET_KEY=<chave-forte-para-segredos-fiscais>

WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=manual
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

- Backup local diário às 2h BRT agendado pelo backend.
- Executa `PRAGMA wal_checkpoint(PASSIVE)` antes de copiar para persistir dados sem travar gravações.
- Diretório local: `backend/data/backups/`.
- Rotação local: 7 arquivos mais recentes.
- Status: `GET /api/backup/status` e tela `/configuracoes`.
- Backup offsite Oracle Object Storage existe como recurso opcional secundário, ativado por `OFFSITE_BACKUP_ENABLED=1`.

Detalhes do offsite: `docs/backup-offsite-oracle.md`.

## Deploy e CI/CD

Fluxo recomendado:

```txt
develop -> PR -> main -> deploy automático
```

CI:

- `.github/workflows/ci.yml` roda em push para `develop` e PR para `main`/`develop` no runner `ubuntu-latest`.
- CI instala dependências do backend, executa `npm audit --omit=dev` e roda `npm test` (com Java 21).

Deploy:

- `.github/workflows/deploy.yml` roda em push para `main` no runner Linux self-hosted do VPS Ubuntu.
- Executa testes do backend e auditoria.
- Instala dependências do frontend e compila a SPA (`npm run build`).
- Sincroniza `frontend/dist/` para `/var/www/sistemaarte/frontend/dist/` via `rsync`.
- Sincroniza `backend/` para `/var/www/sistemaarte/backend/` via `rsync`, excluindo `node_modules`, `data`, `certs`, `.env` e `*.db*`.
- Instala runtime do backend com `npm ci --omit=dev`.
- Grava sentinela em `/var/www/sistemaarte/backend/.deploy-trigger`.
- A unidade do systemd `/etc/systemd/system/deploy-trigger.path` detecta o arquivo e dispara `deploy-trigger.service` para reiniciar o backend (`pm2 restart sistemaarte-backend --update-env`).

Processos PM2 de produção:

```bash
pm2 restart sistemaarte-backend --update-env
pm2 logs sistemaarte-backend --lines 80
pm2 show sistemaarte-backend
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
```

## Documentação Relacionada

- `AGENTS.md` - contexto obrigatório para IA e alterações de código.
- `backend/ARCHITECTURE.md` - arquitetura resumida do backend.
- `docs/nfe-inutilizacao-operacao.md` - runbook de inutilização segura.
- `docs/backup-offsite-oracle.md` - backup offsite criptografado.
- `docs/superpowers/` - specs e planos históricos de implementação.
