# Arquitetura - Backend v2

Resumo técnico do backend do Sistema Arte e Molduras. Para regras completas de negócio e armadilhas operacionais, leia `../AGENTS.md`.

## Camadas

```txt
routes/       Mapeiam endpoints HTTP -> chamam domínio/serviços -> respondem
domain/       Regras de negócio e validadores centrais
services/     Serviços com estado externo ou fluxo fiscal/operacional mais longo
middlewares/  Auth, CSRF origin guard e error handler
utils/        NF-e, WhatsApp, impressão, backups, datas e números
database.js   SQLite via better-sqlite3, WAL, migrations e backups
server.js     Boot Express, rotas, CORS, health, backup agendado e SPA fallback
```

`domain/` deve ser preferencialmente puro. Há exceções centrais e legadas, como `financeiroRules.js`, que acessa o banco para manter o cálculo de saldo em uma única fonte de verdade.

## Decisões Técnicas

| Ponto | Decisão | Motivo |
|---|---|---|
| Ambiente de Produção | VPS Ubuntu 24.04 LTS | Estabilidade, isolamento e performance sob Linux |
| Reverse Proxy | Nginx + Cloudflare WAF | Terminação SSL, compressão gzip, SSE sem buffer e proteção de borda |
| SQLite | `better-sqlite3`, WAL, `busy_timeout=5000` | WAL nativo, persistência imediata, tolerância a concorrência e transações síncronas |
| Concorrência | PM2 fork com 1 instância (`TZ: 'America/Sao_Paulo'`) | SQLite é single-writer |
| Operações compostas | `transaction()` | Atomicidade em OS, itens, logs e lançamentos |
| Regras de negócio | `domain/` | Evita validação duplicada em rotas |
| Serviços longos | `services/` | Isola fluxos como inutilização NF-e |
| Auth | JWT em cookie HttpOnly, Bearer como fallback | Segurança no browser e flexibilidade para testes de API |
| CORS | Lista via `CORS_ORIGINS` | Evita `origin: "*"` com credenciais |
| CSRF | `csrfOriginGuard` em `/api` | Bloqueia mutações cross-site por `Origin/Referer` |
| Seed | Só em `NODE_ENV=development` ou `SEED_DEV=1` | Impede usuário padrão em produção |
| Backup | `wal_checkpoint(PASSIVE)` + `backup()` | Cópia consistente sem travar leituras e escritas |
| Impressão | HTML imprimível via navegador do usuário | Layout fiel sem depender de spooler no Linux ou PDF binário |
| WhatsApp | Envio manual assistido (`wa.me` / app desktop) | Confiabilidade sem risco de banimento de número ou desautenticação de socket |

## Boot do Servidor

`server.js`:

- carrega `.env`;
- exige `CORS_ORIGINS` em produção;
- configura `helmet`, CORS, JSON, cookies e CSRF origin guard;
- aplica rate limit global em `/api`, exceto SSE de KPIs;
- monta rotas `/api/*`;
- agenda backup diário às 2h BRT;
- serve `frontend/dist` quando existe;
- inicializa o banco com `initDB()` (WAL, `busy_timeout=5000`, `foreign_keys=ON`);
- disponibiliza endpoints de health e status operacional do VPS.

## Fluxo de Criação de OS

```txt
POST /api/ordens
  -> validarEntradaOS()
  -> transaction() {
       gerar número OS-XXXX via sequencias
       INSERT ordens
       INSERT ordem_itens
       INSERT statuslog (Aguardando)
       INSERT lancamentos quando houver entrada/pagamento
       registrar aviso WhatsApp quando aplicável
     }
  -> resposta JSON com OS criada
```

Se qualquer etapa falhar, a transaction faz rollback automático.

## Fluxo de Status de OS

```txt
Aguardando -> Em Produção -> Pronto -> Entregue
                                  `-> Cancelado
```

Regras:

- `validarStatus()` bloqueia transições inválidas.
- `normalizarStatus()` só mantém alias legado `Cancelada -> Cancelado`.
- `Entregue` exige saldo zero.
- `oficina` só pode alterar status pelo caminho permitido.

## Fluxo Financeiro da OS

Saldo oficial:

```js
getResumoFinanceiroOS(ordemId)
```

O cálculo considera apenas lançamentos:

- vinculados à OS;
- com `pago=1`;
- com `deletedat IS NULL`.

O saldo é limitado a zero com `Math.max(0, ...)`.

## NF-e

O backend centraliza:

- preview fiscal;
- emissão;
- CC-e;
- cancelamento;
- DANFE HTML;
- download de XML;
- lixeira fiscal;
- inutilização manual segura.

Arquivos principais:

- `routes/nfe.js`
- `domain/nfeRules.js`
- `domain/nfeEmissionRules.js`
- `domain/nfeInutilizacaoRules.js`
- `services/nfeInutilizacaoService.js`
- `utils/nfe.js`
- `utils/nfeConfig.js`
- `utils/nfeInutilizacao.js`
- `utils/danfe.js`

Armadilhas:

- `montarNFe()` retorna `{ infNFe }`.
- `NFE_CERT_PASSWORD` é o env correto para senha do certificado.
- `config.nfe.ambiente` deve ser número.
- `config.lib.useOpenSSL = false` é padrão seguro adotado no runtime.
- XML fiscal deve ser salvo como XML real.
- Não transmitir inutilização em produção por script automatizado.

## Regras Que Protegem Produção

- Nunca criar status `Recebido`.
- Nunca usar `Em Producao` sem acento.
- Nunca recalcular saldo de OS fora de `getResumoFinanceiroOS()`.
- Nunca recriar tabela existente em produção.
- Nunca versionar `.env`, `*.db`, `backend/data/`, XMLs fiscais ou certificados.
- Nunca ativar microserviço Baileys em segundo plano em produção (usar WhatsApp assistido).
- Não utilizar impressão direta por spooler SMB em Linux; utilizar o modo navegador do usuário.
- Nunca ativar PM2 cluster sem redesenhar a camada de persistência.
