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
| Repositório | `ersinayder/sistemaarte` |
| Branch protegida | `main` |
| Branch de trabalho | `develop` |
| Servidor | Windows Server em `C:\sistemaarte` |
| Runtime | Node.js 22 |
| Processos PM2 | `sistemaarte-backend`, `sistema-arte-whatsapp` |

## Arquitetura

```txt
Cloudflare -> Windows Server (PM2)
                |-- Express 4 (porta 3001)
                |     |-- Serve SPA em frontend/dist
                |     `-- API /api/*
                |-- WhatsApp local (127.0.0.1:8080)
                `-- SQLite (backend/data/oficina.db)
```

Contratos estruturais:

- O backend Express serve a API e o build do frontend.
- O frontend chama `/api` com `withCredentials: true`.
- Autenticação usa cookie HttpOnly `token` com validade de 12h.
- `Authorization: Bearer` é fallback aceito e útil em testes PowerShell.
- `GET /api/auth/me` retorna `401` quando não há sessão. Isso é esperado.
- SQLite roda com WAL e `foreign_keys=ON`.
- PM2 deve ficar em `fork` com 1 instância. Não ativar cluster sem redesenhar concorrência.

## Stack

| Área | Tecnologia |
|---|---|
| Backend | Node.js 22, Express 4, CommonJS |
| Banco | SQLite com `better-sqlite3` |
| Frontend | React 18, Vite 8, React Router 6 |
| UI | CSS operacional, tokens globais, lucide-react |
| Testes | Vitest 4.1 |
| NF-e | `nfewizard-io@1.1.0`, Java 21 em CI |
| WhatsApp | `whatsapp-service` com Baileys |
| Deploy | GitHub Actions self-hosted, robocopy, PM2 |

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

whatsapp-service/
  src/                     Serviço local Express + Baileys
  sessions/                Sessões WhatsApp, não versionadas
  ecosystem.config.js      PM2 WhatsApp
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
- `config.lib.useOpenSSL = false` é obrigatório no Windows.
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

## WhatsApp Local

Processo PM2:

```txt
sistema-arte-whatsapp
```

Produção esperada:

```txt
Serviço local: C:\sistemaarte\whatsapp-service
URL local: http://127.0.0.1:8080
Instância atual: ArteeMolduras
Sessão: C:\sistemaarte\whatsapp-service\sessions\ArteeMolduras
Endpoint: GET /instance/connectionState/:instance
```

Regras:

- O nome da instância na tela `/configuracoes` deve bater exatamente com a pasta de sessão.
- Qualquer diferença de letra, espaço, acento ou caixa cria outra instância.
- Se o serviço exigir API key, o backend envia header `apikey`.
- Backend usa `webApiKey` salvo em Configurações > WhatsApp ou variáveis de ambiente.
- `/api/configuracoes/whatsapp/web-status` nunca deve derrubar a tela com 500 quando o serviço local falhar; retornar estado offline/desconectado.
- QR Code deve aparecer quando o serviço retornar `state=qr` com `qr`/`qrcode`.
- Existem modo manual assistido e fila automática.
- O worker automático só inicia se `WHATSAPP_WEB_ENABLED === "true"` e runtime estiver completo.

Diagnóstico direto:

```powershell
$headers = @{ apikey = "COLE_A_CHAVE_AQUI" }
Invoke-RestMethod "http://127.0.0.1:8080/instance/connectionState/ArteeMolduras" -Headers $headers
```

Sessão corrompida costuma aparecer como:

```txt
Bad MAC
Key used already or never filled
failed to decrypt message
Stream Errored (restart required)
WhatsApp desconectado
```

Procedimento seguro:

```powershell
cd C:\sistemaarte\whatsapp-service
pm2 stop sistema-arte-whatsapp
Rename-Item ".\sessions\ArteeMolduras" ("ArteeMolduras-badmac-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
pm2 restart sistema-arte-whatsapp --update-env
pm2 logs sistema-arte-whatsapp --lines 80
```

Não apagar a pasta antiga imediatamente.

## Impressão

Regras:

- Impressões operacionais são HTML imprimível servido pelo backend.
- Não gerar PDF binário no servidor para OS/proposta/caixa/financeiro/DANFE.
- `sendPrintHtml()` aplica headers e CSP de impressão.
- OS usa `renderOrdemServicoHtml()` com saldo oficial.
- Impressão direta usa `backend/utils/print/serverPrinter.js`.
- Impressora padrão: `\\ARTESERVER\Impressoraloja`.
- `ORDEM_PRINTER_NAME` sobrescreve a impressora.
- `normalizePrintCopies()` valida cópias antes de mandar para PowerShell.

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

- Backup diário às 2h BRT.
- Diretório: `backend/data/backups/`.
- Rotação: 7 arquivos.
- Status em `backup-status.json`.
- Tela: `/configuracoes`.
- API: `GET /api/backup/status`.

Offsite:

- Oracle Object Storage criptografado já existe como recurso opcional.
- Ativação por `OFFSITE_BACKUP_ENABLED=1`.
- Detalhes em `docs/backup-offsite-oracle.md`.

Não sobrescrever `backend/data/` no deploy.

## Deploy

CI:

- `.github/workflows/ci.yml` roda em push para `develop` e PR para `main`/`develop`.
- Instala backend com `npm ci`.
- Executa `npm audit --omit=dev`.
- Roda `npm test` no backend.

Deploy:

- `.github/workflows/deploy.yml` roda em push para `main`.
- Roda testes backend.
- Audita backend e frontend.
- Builda frontend.
- Sincroniza `frontend/dist`.
- Sincroniza `backend/` excluindo `node_modules`, `data`, `certs`, `.env` e `*.db`.
- Instala runtime do backend com `npm ci --omit=dev`.
- Grava `C:\sistemaarte\backend\.deploy-trigger`.
- A tarefa Windows `PM2-DeployRestart` reinicia o backend ao detectar a sentinela.

Comandos PM2:

```powershell
pm2 list
pm2 restart sistemaarte-backend --update-env
pm2 restart sistema-arte-whatsapp --update-env
pm2 logs sistemaarte-backend --lines 80
pm2 logs sistema-arte-whatsapp --lines 80
```

`pm2 restart whatsapp-service` está errado neste servidor.

## Testes e Validação

Baseline backend validado em 2026-06-19:

```txt
56 arquivos de teste
398 testes passando
```

Comandos:

```powershell
cd backend
npm.cmd test

cd ..\frontend
npm.cmd test
npm.cmd run build

cd ..\whatsapp-service
npm.cmd test
```

Focos úteis:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
npm.cmd test -- whatsappWebProvider.test.js
npm.cmd test -- nfeInutilizacaoService.test.js
npm.cmd test -- ordemPrintRoute.test.js

cd ..\frontend
npm.cmd test -- NotasFiscais.test.jsx
npm.cmd test -- InutilizacaoModal.test.jsx
```

PowerShell:

- Use `npm.cmd`, não `npm`, quando houver bloqueio por execution policy.
- `-WebSession` do PowerShell não reenvia bem cookies HttpOnly/SameSite neste fluxo.
- Para testes manuais, extraia o token do `Set-Cookie` e use `Authorization: Bearer`.

Login manual:

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"username":"admin","password":"lojanova"}'
$token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""

Invoke-RestMethod -Uri "http://localhost:3001/api/nfe" `
  -Method GET -Headers @{ Authorization = "Bearer $token" }
```

## Armadilhas Conhecidas

- Não assumir que docs antigas em `docs/superpowers/` são fonte canônica; são planos/specs históricos.
- Não usar contagens antigas de testes. Rode a suíte se a contagem importar.
- Não trocar `NFE_CERT_PASSWORD` por nomes em português.
- Não usar `NFeRecepcaoEvento` em exemplos novos; o código atual usa helpers da `nfewizard-io` expostos como `NFE_Cancelamento`, `NFE_CartaDeCorrecao` e `NFE_Inutilizacao`.
- Não ativar `WHATSAPP_WEB_ENABLED=true` sem base URL, instância e provider coerentes.
- Não tratar falha do WhatsApp local como erro fatal de tela.
- Não mover NF-e autorizada/cancelada para lixeira fiscal.
- Não recalcular saldo de OS em SQL improvisado sem comparar com `getResumoFinanceiroOS()`.
- Não alterar `resolveClienteData()` sem validar atendimento no frontend.
- Não expor RDP diretamente na internet. Preferir VPN, Tailscale/ZeroTier ou Cloudflare Access.

## Documentação Relacionada

- `README.md` - visão geral, setup, deploy e operação.
- `backend/ARCHITECTURE.md` - resumo da arquitetura backend.
- `whatsapp-service/README.md` - contrato e instalação do serviço local.
- `docs/nfe-inutilizacao-operacao.md` - inutilização manual segura.
- `docs/backup-offsite-oracle.md` - backup offsite Oracle.
- `docs/whatsapp-service-mini-evolution.md` - evolução do serviço local.
- `docs/superpowers/` - specs e planos históricos.
