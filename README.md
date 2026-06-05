# Sistema Arte e Molduras

Sistema operacional da loja Arte e Molduras para atendimento, ordens de servico, oficina, caixa, clientes, produtos, propostas, financeiro administrativo e NF-e.

O backend Express tambem serve o build da SPA em producao.

## Estado Atual

Validado localmente em 2026-06-05:

| Area | Estado |
|---|---|
| Backend | Node.js 22 + Express 4 |
| Frontend | React 18 + Vite 8 |
| Banco | SQLite com `better-sqlite3` e WAL |
| Auth | JWT em cookie HttpOnly, sessao 12h |
| Testes backend | 46 arquivos, 290 testes passando |
| Deploy | Windows Server, PM2, GitHub Actions self-hosted |
| Dominio | `arteemolduras.com.br` |

## Modulos

| Modulo | Rota frontend | Backend |
|---|---|---|
| Atendimento | `/atendimento` | `/api/ordens`, `/api/clientes`, `/api/caixa`, `/api/produtos` |
| Resumo/Dashboard | `/dashboard` | `/api/kpis`, `/api/relatorios` |
| Ordens de Servico | `/ordens`, `/ordens/:id`, `/ordens/lixeira` | `/api/ordens` |
| Oficina | `/oficina`, `/oficina/:id` | `/api/ordens` com role `oficina` |
| Caixa | `/caixa` | `/api/caixa` |
| Clientes | `/clientes` | `/api/clientes` |
| Produtos | `/produtos` | `/api/produtos` |
| Orcamento/Propostas | `/orcamento`, `/orcamento/calculadora`, `/propostas` | `/api/propostas` |
| Financeiro admin | `/financeiro` | `/api/financeiro` |
| Notas fiscais | `/nfe` | `/api/nfe` |
| Usuarios | `/usuarios` | `/api/users` |
| Configuracoes | `/configuracoes` | `/api/configuracoes`, `/api/backup` |

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 22 |
| Backend | Express 4 |
| Banco | SQLite via `better-sqlite3` |
| Frontend | React 18 + Vite 8 |
| Estilo | CSS/Tailwind legado + componentes React |
| Auth | `jsonwebtoken`, cookie HttpOnly |
| Testes | Vitest 4.1 |
| NF-e | `nfewizard-io@1.1.0` |
| Deploy | PM2 fork, 1 instancia |
| Windows print | PowerShell + impressora compartilhada |

## Regras Criticas

- Status de OS validos: `Aguardando`, `Em Produção`, `Pronto`, `Entregue`, `Cancelado`.
- Nunca usar `Em Producao` sem acento em dados reais, testes ou SQL.
- SQL deve usar apenas `Cancelado`, nao o alias legado `Cancelada`.
- Saldo de OS deve sempre vir de `getResumoFinanceiroOS()` em `backend/domain/financeiroRules.js`.
- Lancamento `pago=0` nao abate saldo.
- Lancamento com `deletedat IS NOT NULL` nao entra no saldo.
- Uma OS so pode virar `Entregue` com saldo zero.
- SQLite e single-writer; nao ativar PM2 cluster sem redesenhar concorrencia.
- Migrations em producao devem ser aditivas: `ALTER TABLE ADD COLUMN` ou `CREATE TABLE IF NOT EXISTS`.
- `GET /api/auth/me` retornar 401 sem login e comportamento esperado.

## NF-e

Fluxos implementados:

- Preview antes de emitir: `GET /api/nfe/emitir/:id/preview`
- Emissao: `POST /api/nfe/emitir/:id`
- Listagem: `GET /api/nfe`
- Eventos: `GET /api/nfe/:chave/eventos`
- Eventos por OS: `GET /api/nfe/ordem/:ordemId/eventos`
- XML autorizacao: `GET /api/nfe/:chave/xml/autorizacao`
- XML de evento: `GET /api/nfe/eventos/:eventoId/xml`
- DANFE HTML real: `GET /api/nfe/:chave/danfe`
- Carta de Correcao: `POST /api/nfe/:chave/cce`
- Cancelamento: `POST /api/nfe/:chave/cancelar`

Pontos fiscais importantes:

- `montarNFe()` retorna sempre `{ infNFe: {...} }`.
- `NFE_Autorizacao` recebe `{ idLote, indSinc, NFe: { infNFe } }`.
- Resposta de autorizacao e array; usar `resultado[0].protNFe.infProt`.
- `config.nfe.ambiente` deve ser number: `1` producao, `2` homologacao.
- No Windows, `config.lib.useOpenSSL = false`.
- Simples Nacional:
  - CSOSN 400 usa tag `ICMSSN102`
  - PIS/COFINS usam `PISNT`/`COFINSNT` com `CST: '07'`
- XML fiscal e salvo em banco (`ordens.nfe_xml`/`nfe_eventos.xml`) e disco (`backend/data/nfe_xmls/`).
- Rejeicoes SEFAZ sao formatadas por `formatarRejeicaoSefaz()` em `backend/utils/nfe.js`.

## Rodar Localmente

### Backend

```powershell
cd backend
npm install
$env:NODE_ENV="development"
node server.js
```

Backend: `http://localhost:3001`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

### Observacao PowerShell

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd`:

```powershell
npm.cmd test
npm.cmd run build
```

## Usuarios de Desenvolvimento

O seed so roda quando:

- `NODE_ENV === 'development'`
- ou `SEED_DEV === '1'`

| Usuario | Senha | Role |
|---|---|---|
| admin | admin123 | admin |
| caixa | caixa123 | caixa |
| oficina | oficina123 | oficina |

## Variaveis de Ambiente

Arquivo de producao: `C:\sistemaarte\backend\.env`

O `.env` nao e versionado e nao e copiado pelo deploy.

Exemplo minimo:

```env
NODE_ENV=production
PORT=3001
JWT_SECRET=<string longa aleatoria>
CORS_ORIGINS=https://arteemolduras.com.br

NFE_AMBIENTE_NUM=2
NFE_CERT_SENHA=<senha>
NFE_CNPJ_EMITENTE=<cnpj>
NFE_SECRET_KEY=<32 bytes/base64 ou segredo forte para criptografia>

WHATSAPP_ENABLED=false
```

Configuracoes fiscais/empresa/WhatsApp tambem podem ser geridas pela tela `/configuracoes`.

## Estrutura

```txt
backend/
  __tests__/              Testes Vitest
  data/                   oficina.db, backups, XMLs fiscais (nao commitados)
  domain/                 Regras puras de negocio
  middlewares/            Auth, CSRF origin guard, error handler
  routes/                 Endpoints por recurso
  utils/                  NF-e, prints, WhatsApp, datas, numeros, backups
  database.js             Schema, migrations, WAL, backup
  ecosystem.config.js     PM2
  server.js               Entry point Express

frontend/src/
  components/             Layout, Sidebar
  context/                AuthContext
  pages/                  Telas principais
  services/               Axios e event bus
  utils/                  Impressao, WhatsApp, desconto, oficina
```

## Testes

```powershell
cd backend
npm.cmd test
```

Resultado esperado em 2026-06-05:

```txt
46 arquivos de teste
290 testes passando
```

Testes cobrem auth, roles, seguranca, OS, oficina, caixa, financeiro, propostas, NF-e, DANFE, WhatsApp, backups, paginacao, impressao e contratos de rota.

## Deploy

Fluxo principal:

1. PR para `main`.
2. GitHub Actions roda testes e build.
3. `robocopy` sincroniza backend e `frontend/dist`.
4. PM2 reinicia o backend via `ecosystem.config.js`.

Comandos uteis no servidor:

```powershell
cd C:\sistemaarte
git pull origin main

cd C:\sistemaarte\backend
npm install --omit=dev
pm2 restart sistemaarte-backend
```

Recriar PM2 do zero:

```powershell
cd C:\sistemaarte\backend
pm2 delete sistemaarte-backend
pm2 start ecosystem.config.js --env production
pm2 save
```

## Backups

- Backup local diario as 2h BRT.
- Diretorio: `backend/data/backups/`.
- Rotacao local: 7 arquivos.
- Status operacional: `GET /api/backup/status` e tela `/configuracoes`.
- Offsite versionado ainda e pendencia obrigatoria antes de uso SaaS/comercial.

## Documentacao Para Agentes

Leia `AGENTS.md` antes de alterar codigo. Ele contem:

- regras fiscais e financeiras criticas
- arquitetura
- armadilhas conhecidas
- estado atual dos modulos
- checklist NF-e
- roadmap
- historico de sessoes Codex
- comandos PowerShell de homologacao
