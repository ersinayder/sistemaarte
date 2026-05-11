# AGENTS.md — Contexto para IA

Este arquivo contextualiza agentes de IA (Copilot, Cursor, Perplexity, Claude, etc.) sobre o projeto.
Leia antes de propor qualquer alteração de código.

---

## Identidade do sistema

- **Nome:** Sistema Arte e Molduras
- **Domínio:** `arteemolduras.com.br`
- **Servidor:** Windows Server, `C:\sistemaarte\`, Node.js 22, PM2
- **Repositório:** `ersinayder/sistemaarte` (branch padrão: `main`)

---

## Arquitetura

```
Cloudflare → Windows Server (PM2)
                ├── Express (porta 3001)
                │     ├── Serve SPA (frontend/dist)
                │     └── API /api/*
                └── SQLite (backend/data/oficina.db)
```

- Backend Express serve também o frontend buildado (SPA fallback)
- Autenticação via **cookie HttpOnly** (`token`, 12h). O axios usa `withCredentials: true`
- `GET /api/auth/me` é o handshake de sessão — retorna 401 quando não logado (comportamento esperado, não é bug)

---

## Stack completa

| Área | Tecnologia |
|---|---|
| Runtime | Node.js 22 |
| Framework backend | Express 4 |
| Banco | SQLite via `better-sqlite3` (síncrono) |
| WAL mode | Ativado em `initDB()` — `db.pragma('journal_mode = WAL')` |
| Frontend | React 18 + Vite + TailwindCSS |
| Auth | JWT (`jsonwebtoken`) + cookie HttpOnly |
| Testes | Vitest 1.6 |
| Deploy | PM2 (fork, 1 instância) + GitHub Actions self-hosted |
| Notificações | Evolution API (WhatsApp) — toggle `WHATSAPP_ENABLED` |

---

## Regras de negócio críticas

### Status de OS
Os valores exatos (com acentos) são:
```
'Aguardando' → 'Em Produção' → 'Pronto' → 'Entregue'
                                         → 'Cancelado'
```
- **Nunca** usar `'Em Producao'` sem acento — vai quebrar validações e testes
- `normalizarStatus()` em `domain/ordensRules.js` normaliza aliases (ex: `'Cancelada'` → `'Cancelado'`)
- Transições inválidas são bloqueadas por `validarStatus()`
- O único alias legado suportado é `'Cancelada'` → `'Cancelado'` via `normalizarStatus()`. Nas queries SQL use **somente** `'Cancelado'` — a migration normalizou todos os registros do banco.

### Roles de usuário
| Role | Permissões |
|---|---|
| `admin` | Tudo, incluindo lixeira e exclusão |
| `caixa` | Criar/editar OS, lançamentos, clientes |
| `oficina` | Somente atualizar status da OS |

### Financeiro
- Lançamentos com `pago=0` **não** abatam saldo da OS
- Lançamentos com `deletedat IS NOT NULL` são ignorados no saldo
- Saldo nunca vai abaixo de zero mesmo com pagamento excedente — tanto no `SEL_ORDEM` (via `CASE WHEN`) quanto em `getResumoFinanceiroOS()` (via `Math.max`)
- Para entregar uma OS (`status = 'Entregue'`), saldo deve ser zero — válido em **todas** as rotas que alteram status: `PATCH /status`, `PUT /:id` (role admin/caixa e role oficina)
- **Sempre** usar `getResumoFinanceiroOS()` de `domain/financeiroRules.js` para cálculo de saldo — **nunca** reimplementar inline

### Numeração de OS
- Formato: `OS-XXXX` (zero-padded, 4 dígitos)
- Gerada pela tabela `sequencias` com lock via `RETURNING`
- Em caso de conflito UNIQUE, retornar 409 e pedir para tentar novamente

### resolveClienteData — comportamento intencional
`resolveClienteData()` em `routes/ordens.js` faz lookup de telefone/CPF pelo **nome** do cliente quando o `clienteid` não é fornecido:

```js
const cli = getOne("SELECT phone, cpf FROM clientes WHERE name=? LIMIT 1", [clientenome]);
```

**Isso é UX deliberada**, não um bug. Permite criar uma OS digitando apenas o nome do cliente sem precisar selecionar o ID, priorizando agilidade no atendimento. Em caso de dois clientes com o mesmo nome, o sistema usa o primeiro cadastrado (id menor). Para clientes com nomes ambíguos, o operador deve informar o `clienteid` explicitamente. **Não alterar esse comportamento sem validar o fluxo de criação de OS no frontend.**

---

## Banco de dados

- **Arquivo:** `backend/data/oficina.db` (não commitado, no `.gitignore`)
- **Backups:** `backend/data/backups/` — rotação de 7 arquivos, gerado diariamente às 2h BRT
- **Migrations:** adicionais de coluna ficam no array `migrations[]` em `database.js` — nunca alterar tabelas existentes, só `ALTER TABLE ADD COLUMN`
- **SQLite é single-writer** — não ativar PM2 cluster sem migrar para WAL + testar locks
- Índices existentes:
  - `idx_ordens_status`, `idx_ordens_prazo`, `idx_ordens_clienteid`
  - `idx_lancamentos_data`, `idx_lancamentos_ordemid`
  - `idx_lancamentos_pago_del` — composto em `(ordemid, pago, deletedat)` para queries de saldo
  - `idx_statuslog_ordemid`, `idx_produtos_nome`, `idx_ordem_itens_ordemid`

---

## Seed de desenvolvimento

O seed de usuários padrão (`admin/admin123`, `caixa/caixa123`, `oficina/oficina123`) **só executa** quando:
- `NODE_ENV === 'development'` **OU**
- `SEED_DEV === '1'`

Em qualquer outro cenário (variável indefinida, `NODE_ENV=production`, etc.) o seed **não roda**. Nunca alterar esse guard para a lógica inversa (`!== 'production'`).

---

## Estrutura de arquivos relevantes

```
backend/
├── domain/
│   ├── ordensRules.js       # STATUSES_VALIDOS, TRANSICOES_VALIDAS, validarStatus, normalizarStatus
│   └── financeiroRules.js   # getResumoFinanceiroOS — UNICA fonte de verdade para saldo de OS
├── middlewares/
│   ├── auth.js              # Middleware JWT — lê cookie > header Authorization
│   └── errorHandler.js      # Sanitiza erros SQLite, nunca vaza schema
├── routes/
│   ├── auth.js              # POST /login, POST /logout, GET /me
│   ├── ordens.js            # CRUD OS + status + WhatsApp
│   ├── caixa.js             # Lançamentos financeiros
│   ├── kpis.js              # GET /kpis + SSE /kpis/stream (máx 10 conexões)
│   ├── pdf.js               # Geração de PDF das OS
│   ├── clientes.js          # CRUD clientes
│   ├── produtos.js          # CRUD produtos/estoque
│   ├── relatorios.js        # Relatórios financeiros
│   └── backup.js            # Trigger manual de backup
├── utils/
│   ├── dates.js             # hoje() — retorna YYYY-MM-DD no fuso America/Sao_Paulo
│   ├── numbers.js           # toNumber(), validarNaoNegativo()
│   └── whatsapp.js          # sendWhatsApp(), sendWhatsAppConfirmacao()
├── database.js              # initDB, WAL, schema, migrations, backup
├── ecosystem.config.js      # PM2 — carrega .env, injeta todas as vars
└── server.js                # Entry point — CORS, rotas, SPA fallback, errorHandler

frontend/src/
├── services/api.js          # Axios: baseURL=/api, withCredentials:true, interceptors 401/403/5xx
├── context/                 # AuthContext — handshake via GET /api/auth/me
└── pages/
    ├── Ordens.jsx           # Lista de OS com filtros (status, vencidas, busca)
    ├── Orcamento.jsx        # Criação/edição de OS (maior arquivo: ~55kb)
    ├── OrdemDetalhe.jsx     # Detalhe + histórico de status
    ├── Caixa.jsx            # Lançamentos do caixa
    ├── Dashboard.jsx        # KPIs em tempo real via SSE
    ├── Clientes.jsx         # CRUD clientes
    ├── Produtos.jsx         # CRUD produtos
    ├── Relatorios.jsx       # Relatórios
    ├── Oficina.jsx          # Visão da oficina (só troca status)
    └── Usuarios.jsx         # Gestão de usuários (admin only)
```

---

## CI/CD

- **Branch protegida:** `main` — requer PR + testes passando
- **Branch de trabalho:** `develop` — commits diretos permitidos
- **Fluxo:** `develop` → PR → testes (Vitest, 86 testes) → merge → deploy automático
- **Deploy:** `robocopy` sincroniza `backend/` e `frontend/dist/` no servidor, PM2 reinicia via `ecosystem.config.js`
- **O `.env` nunca é copiado pelo deploy** (`/XF .env` no robocopy)

---

## Armadilhas conhecidas

| Situação | Problema | Solução |
|---|---|---|
| Status sem acento | `'Em Producao'` quebra validações | Sempre usar `'Em Produção'` |
| PM2 sem .env | `JWT_SECRET` ausente → crash em loop | Sempre iniciar via `ecosystem.config.js` |
| SSE kpis | `idleTimer` deve ser declarado antes de `cleanup()` | `let idleTimer = null` no topo |
| Backup durante escrita | Sem WAL: lock no banco | WAL já ativo, backup usa `db.backup()` assíncrono |
| Múltiplos writers | SQLite single-writer | Não ativar PM2 cluster sem validar WAL + locks |
| Testes CJS + Vitest | `vi.mock` incompatível com `better-sqlite3` | Usar mocks manuais com objetos `better-sqlite3` reais |
| Guard do seed | `!== 'production'` roda se NODE_ENV undefined | Guard exige `=== 'development'` ou `SEED_DEV=1` |
| Saldo inline no PUT caixa | Diverge de `getResumoFinanceiroOS` | Sempre usar `getResumoFinanceiroOS()` — nunca reimplementar |
| `'Cancelada'` em queries SQL | Alias legado — banco já normalizado | Usar somente `'Cancelado'` em cláusulas WHERE/IN |
| `saldoaberto` negativo | Estornos podem exceder total | SEL_ORDEM usa `CASE WHEN < 0 THEN 0.0` |

---

## Roadmap / Backlog técnico

Itens validados mas não implementados ainda (features novas, não bugs):

| # | Item | Impacto |
|---|---|---|
| 10 | `criadopor` + `updatedat` em `ordem_itens` | Rastreabilidade por operador |
| 12 | SSE: limitar por `userId` (máx 3/usuário) | Evitar monopolização de conexões |
| 13 | Paginação no `GET /api/ordens` (`?page=&limit=`) | Escala com volume crescente |
| 9 | Backup: gravar `backup-status.json` + endpoint `/api/backup/status` | Observabilidade de falhas |

---

## Protocolo para novas features

1. Criar branch a partir de `develop`
2. Regras de negócio novas → adicionar em `domain/`
3. Novos campos no banco → `ALTER TABLE ADD COLUMN` no array `migrations[]` em `database.js`
4. Cobrir com testes em `backend/__tests__/`
5. PR de `develop` → `main` (testes obrigatórios)
6. Nunca commitar `.env`, `*.db`, `node_modules`, `data/`
