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

## Contexto de negócio

A Arte e Molduras é uma loja física que:
- Fabrica e vende quadros, molduras e itens decorativos personalizados
- Possui uma oficina interna que executa os serviços
- Atende clientes balcão (cadastrados ou não)
- Controla caixa manualmente: recebe entradas parciais e saldos restantes

### Fluxo de uma OS
1. Cliente entra na loja → operador cria um **Orçamento** (tela `Orcamento.jsx`)
2. Orçamento aprovado → vira uma **OS** com status `Aguardando`
3. Oficina executa o serviço → status avança para `Em Produção` → `Pronto`
4. Cliente busca o produto → paga o saldo restante → status vai para `Entregue`
5. Em qualquer etapa antes de `Entregue` pode ir para `Cancelado`

> **Orçamento e OS são a mesma entidade no banco** (`ordens`). Não existe tabela separada de orçamentos.

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

## Variáveis de ambiente (.env)

O arquivo `.env` fica em `backend/.env` e **nunca é commitado**. Todas as vars são carregadas pelo `ecosystem.config.js` do PM2.

| Variável | Obrigatória | Exemplo / Descrição |
|---|---|---|
| `JWT_SECRET` | ✅ | String hex de 64 chars — gerada com `crypto.randomBytes(32).toString('hex')` |
| `PORT` | ❌ | `3001` (padrão) |
| `NODE_ENV` | ✅ | `production` em produção, `development` para ativar seed |
| `CORS_ORIGINS` | ✅ | `https://arteemolduras.com.br` — separado por vírgula se houver mais |
| `EVOLUTION_API_URL` | ❌ | `http://localhost:8080` |
| `EVOLUTION_API_KEY` | ❌ | Chave da Evolution API |
| `EVOLUTION_INSTANCE` | ❌ | Nome da instância WhatsApp |
| `WHATSAPP_ENABLED` | ❌ | `true` para ativar envio de mensagens |
| `SEED_DEV` | ❌ | `1` para forçar seed em produção (usar só para setup inicial) |

---

## Schema do banco de dados

**Arquivo:** `backend/data/oficina.db` (não commitado)
**Migrations:** adicionais de coluna ficam no array `migrations[]` em `database.js` — nunca alterar tabelas existentes, só `ALTER TABLE ADD COLUMN`

### Tabela `users`
```sql
id        INTEGER PRIMARY KEY AUTOINCREMENT
name      TEXT    NOT NULL
username  TEXT    UNIQUE NOT NULL
password  TEXT    NOT NULL          -- bcrypt hash
role      TEXT    NOT NULL          -- 'admin' | 'caixa' | 'oficina'
active    INTEGER DEFAULT 1
createdat TEXT    DEFAULT (datetime('now','localtime'))
```

### Tabela `clientes`
```sql
id         INTEGER PRIMARY KEY AUTOINCREMENT
name       TEXT NOT NULL
phone      TEXT
email      TEXT
cpf        TEXT
ie         TEXT                     -- Inscrição Estadual (PJ)
address    TEXT
cidade     TEXT
uf         TEXT
cep        TEXT
notes      TEXT
deletedat  TEXT    DEFAULT NULL     -- soft delete
deletedpor INTEGER DEFAULT NULL
createdat  TEXT DEFAULT (datetime('now','localtime'))
```

### Tabela `ordens` (OS e Orçamentos — mesma entidade)
```sql
id               INTEGER PRIMARY KEY AUTOINCREMENT
numero           TEXT UNIQUE NOT NULL               -- formato: OS-XXXX
clienteid        INTEGER                             -- FK clientes.id (pode ser null)
clientenome      TEXT NOT NULL
clientetelefone  TEXT
clientecpf       TEXT
servico          TEXT NOT NULL                      -- tipo do serviço (ex: 'Quadro', 'Moldura')
descricao        TEXT
valortotal       REAL NOT NULL DEFAULT 0
valorentrada     REAL DEFAULT 0
status           TEXT NOT NULL DEFAULT 'Aguardando' -- ver fluxo de status abaixo
prioridade       TEXT DEFAULT 'Normal'              -- 'Normal' | 'Alta' | 'Urgente'
prazoentrega     TEXT                               -- formato: YYYY-MM-DD
pagamento        TEXT DEFAULT 'Pix'                 -- forma de pagamento
observacoes      TEXT
criadopor        INTEGER                             -- FK users.id
deletedat        TEXT DEFAULT NULL                   -- soft delete
deletedpor       INTEGER DEFAULT NULL
deletedreason    TEXT DEFAULT NULL
createdat        TEXT DEFAULT (datetime('now','localtime'))
updatedat        TEXT DEFAULT (datetime('now','localtime'))
```

### Tabela `lancamentos` (Caixa)
```sql
id        INTEGER PRIMARY KEY AUTOINCREMENT
data      TEXT NOT NULL                  -- formato: YYYY-MM-DD
tipo      TEXT NOT NULL DEFAULT 'Entrada' -- 'Entrada' | 'Saída' | 'Diversos'
categoria TEXT DEFAULT NULL              -- categoria do lançamento (ex: nome do serviço)
descricao TEXT NOT NULL
pagamento TEXT NOT NULL                  -- 'Pix' | 'Dinheiro' | 'Cartão' | etc.
valor     REAL NOT NULL
pago      INTEGER DEFAULT 1             -- 0 = pendente, 1 = pago (só pago=1 abate saldo da OS)
ordemid   INTEGER                        -- FK ordens.id (opcional — vincula ao caixa da OS)
criadopor INTEGER                        -- FK users.id
origem    TEXT DEFAULT NULL              -- 'entradaos' | 'saldoos' | 'manual'
deletedat TEXT DEFAULT NULL              -- soft delete
deletedpor INTEGER DEFAULT NULL
createdat TEXT DEFAULT (datetime('now','localtime'))
```

> **Atenção `origem`:** `entradaos` = entrada criada automaticamente ao criar a OS; `saldoos` = pagamento do saldo restante; `manual` = lançamento avulso.

### Tabela `statuslog`
```sql
id             INTEGER PRIMARY KEY AUTOINCREMENT
ordemid        INTEGER
statusanterior TEXT
statusnovo     TEXT NOT NULL
usuarioid      INTEGER
obs            TEXT
createdat      TEXT DEFAULT (datetime('now','localtime'))
```

### Tabela `produtos`
```sql
id          INTEGER PRIMARY KEY AUTOINCREMENT
nome        TEXT NOT NULL
categoria   TEXT DEFAULT 'Outros'
unidade     TEXT DEFAULT 'un'
preco       REAL DEFAULT 0
estoque     REAL DEFAULT 0
estoquemin  REAL DEFAULT 0
descricao   TEXT DEFAULT ''
deletedat   TEXT DEFAULT NULL
deletedpor  INTEGER DEFAULT NULL
createdat   TEXT DEFAULT (datetime('now','localtime'))
updatedat   TEXT DEFAULT (datetime('now','localtime'))
```

### Tabela `ordem_itens` (produtos vinculados a uma OS)
```sql
id             INTEGER PRIMARY KEY AUTOINCREMENT
ordemid        INTEGER NOT NULL               -- FK ordens.id
produto_id     INTEGER DEFAULT NULL           -- FK produtos.id (null se avulso)
nome           TEXT NOT NULL
quantidade     REAL NOT NULL DEFAULT 1
preco_unitario REAL NOT NULL DEFAULT 0
subtotal       REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED
avulso         INTEGER DEFAULT 0             -- 1 = item digitado manualmente (sem produto cadastrado)
createdat      TEXT DEFAULT (datetime('now','localtime'))
```

### Tabela `sequencias`
```sql
nome   TEXT PRIMARY KEY    -- 'os'
ultimo INTEGER DEFAULT 0   -- último número gerado (RETURNING garante atomicidade)
```

### Índices existentes
```sql
idx_ordens_status           ON ordens(status)
idx_ordens_prazo            ON ordens(prazoentrega)
idx_ordens_clienteid        ON ordens(clienteid)
idx_lancamentos_data        ON lancamentos(data)
idx_lancamentos_ordemid     ON lancamentos(ordemid)
idx_lancamentos_pago_del    ON lancamentos(ordemid, pago, deletedat)
idx_statuslog_ordemid       ON statuslog(ordemid)
idx_produtos_nome           ON produtos(nome COLLATE NOCASE)
idx_ordem_itens_ordemid     ON ordem_itens(ordemid)
```

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
- O único alias legado suportado é `'Cancelada'` → `'Cancelado'`. Nas queries SQL use **somente** `'Cancelado'`

### Roles de usuário
| Role | Permissões |
|---|---|
| `admin` | Tudo, incluindo lixeira e exclusão permanente |
| `caixa` | Criar/editar OS, lançamentos, clientes |
| `oficina` | Somente atualizar status da OS |

### Financeiro
- Lançamentos com `pago=0` **não** abatam saldo da OS
- Lançamentos com `deletedat IS NOT NULL` são ignorados no saldo
- Saldo nunca vai abaixo de zero mesmo com pagamento excedente — tanto no `SEL_ORDEM` (via `CASE WHEN`) quanto em `getResumoFinanceiroOS()` (via `Math.max`)
- Para entregar uma OS (`status = 'Entregue'`), saldo deve ser zero — válido em **todas** as rotas que alteram status
- **Sempre** usar `getResumoFinanceiroOS()` de `domain/financeiroRules.js` para cálculo de saldo — **nunca** reimplementar inline

### Lançamentos do caixa — origens
| `origem` | Quem cria | Pode editar | Pode excluir |
|---|---|---|---|
| `entradaos` | Automático ao criar OS | Só admin (data/pagamento) | Não — via OS |
| `saldoos` | Operador ao receber saldo | admin/caixa | Só admin |
| `manual` | Operador (avulso) | admin/caixa | Só admin |

### Numeração de OS
- Formato: `OS-XXXX` (zero-padded, 4 dígitos)
- Gerada pela tabela `sequencias` com lock via `RETURNING`
- Em caso de conflito UNIQUE, retornar 409 e pedir para tentar novamente

### resolveClienteData — comportamento intencional
`resolveClienteData()` em `routes/ordens.js` faz lookup de telefone/CPF pelo **nome** do cliente quando o `clienteid` não é fornecido. Isso é UX deliberada — permite criar OS digitando apenas o nome sem selecionar o ID. **Não alterar sem validar o fluxo de criação de OS no frontend.**

### WhatsApp — quando dispara
| Evento | Função | Manual/Auto |
|---|---|---|
| OS muda para `Pronto` | `sendWhatsApp(os)` | **Automático** (via `maybeNotifyPronto`) |
| Operador clica "Enviar confirmação" | `sendWhatsAppConfirmacao(os)` | **Manual** |

- `WHATSAPP_ENABLED=true` é obrigatório para os envios ocorrerem
- Falhas no WhatsApp são capturadas com `.catch()` — não bloqueiam a operação principal da OS

---

## Contrato das rotas (API)

Todas as rotas exigem cookie `token` (HttpOnly). O header `Authorization: Bearer <token>` também é aceito como fallback.

### Auth
| Método | Rota | Roles | Body | Resposta |
|---|---|---|---|---|
| POST | `/api/auth/login` | — | `{ username, password }` | `{ token, user }` + cookie |
| POST | `/api/auth/logout` | qualquer | — | `{ ok: true }` + limpa cookie |
| GET | `/api/auth/me` | qualquer | — | `{ id, name, username, role }` ou 401 |

### Ordens (OS)
| Método | Rota | Roles | Descrição |
|---|---|---|---|
| GET | `/api/ordens` | qualquer | Lista OS. Query: `?status=`, `?q=`, `?vencidas=1`, `?lixeira=1` (admin) |
| GET | `/api/ordens/:id` | qualquer | Detalhe com `logs`, `itens`, `lancamentos` |
| POST | `/api/ordens` | admin, caixa | Cria OS. Body abaixo. |
| PUT | `/api/ordens/:id` | admin, caixa, oficina | Edita OS (oficina: só `status`) |
| PATCH | `/api/ordens/:id/status` | admin, caixa, oficina | Troca status. Body: `{ status, obs? }` |
| POST | `/api/ordens/:id/whatsapp-confirmacao` | admin, caixa | Envia mensagem de confirmação |
| DELETE | `/api/ordens/:id` | admin | Soft delete. Body: `{ reason? }` |
| POST | `/api/ordens/:id/restore` | admin | Restaura da lixeira |
| DELETE | `/api/ordens/:id/permanente` | admin | Exclusão definitiva (cascata) |

**Body POST/PUT `/api/ordens`:**
```json
{
  "clienteid": 1,
  "clientenome": "João Silva",
  "clientetelefone": "31999990000",
  "clientecpf": "000.000.000-00",
  "servico": "Quadro",
  "descricao": "Quadro 30x40 com moldura preta",
  "valortotal": 150.00,
  "valorentrada": 50.00,
  "prazoentrega": "2026-05-20",
  "prioridade": "Normal",
  "pagamento": "Pix",
  "observacoes": "Cliente pediu entrega rápida",
  "dataEntrada": "2026-05-11",
  "produtos": [
    { "produto_id": 3, "nome": "Moldura Preta", "quantidade": 1, "preco_unitario": 80.00 },
    { "nome": "Item avulso", "quantidade": 2, "preco_unitario": 35.00, "avulso": true }
  ]
}
```

**Campos computados retornados no GET:**
- `valorrecebido` — soma dos lançamentos `pago=1` vinculados
- `saldoaberto` — `valortotal - valorrecebido` (mínimo 0)
- `itens_resumo` — nomes dos itens concatenados
- `logs` — histórico de status (só no GET /:id)
- `lancamentos` — lançamentos vinculados (só no GET /:id)

### Caixa (Lançamentos)
| Método | Rota | Roles | Descrição |
|---|---|---|---|
| GET | `/api/caixa` | qualquer | Lista lançamentos. Query: `?data=YYYY-MM-DD`, `?mes=YYYY-MM` |
| POST | `/api/caixa` | admin, caixa | Cria lançamento. Body abaixo. |
| PUT | `/api/caixa/:id` | admin, caixa | Edita lançamento |
| DELETE | `/api/caixa/:id` | admin | Soft delete |

**Body POST `/api/caixa`:**
```json
{
  "data": "2026-05-11",
  "tipo": "Entrada",
  "descricao": "Venda avulsa",
  "pagamento": "Dinheiro",
  "valor": 80.00,
  "pago": 1,
  "ordemid": 42
}
```
> Se `ordemid` for informado, o sistema valida o saldo disponível da OS e define `origem='saldoos'` automaticamente.

### Demais rotas
| Prefixo | Arquivo | Principais endpoints |
|---|---|---|
| `/api/clientes` | `routes/clientes.js` | CRUD completo + soft delete |
| `/api/produtos` | `routes/produtos.js` | CRUD completo + soft delete |
| `/api/kpis` | `routes/kpis.js` | `GET /api/kpis` + `GET /api/kpis/stream` (SSE, máx 10 conexões) |
| `/api/relatorios` | `routes/relatorios.js` | Relatórios financeiros por período |
| `/api/pdf/:id` | `routes/pdf.js` | Gera PDF da OS |
| `/api/backup` | `routes/backup.js` | `POST /api/backup` — dispara backup manual |

---

## Estrutura de arquivos relevantes

```
backend/
├── domain/
│   ├── ordensRules.js       # STATUSES_VALIDOS, TRANSICOES_VALIDAS, validarStatus, normalizarStatus
│   └── financeiroRules.js   # getResumoFinanceiroOS — ÚNICA fonte de verdade para saldo de OS
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
    ├── Dashboard.jsx        # KPIs em tempo real via SSE
    ├── Ordens.jsx           # Lista de OS com filtros (status, vencidas, busca)
    ├── Orcamento.jsx        # Criação/edição de OS (~55kb — maior arquivo)
    ├── OrdemDetalhe.jsx     # Detalhe + histórico de status + linha do tempo
    ├── Caixa.jsx            # Lançamentos do caixa
    ├── Clientes.jsx         # CRUD clientes
    ├── Produtos.jsx         # CRUD produtos
    ├── Relatorios.jsx       # Relatórios financeiros
    ├── Oficina.jsx          # Visão da oficina (fila por prazo, só troca status)
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

## Seed de desenvolvimento

O seed de usuários padrão (`admin/admin123`, `caixa/caixa123`, `oficina/oficina123`) **só executa** quando:
- `NODE_ENV === 'development'` **OU**
- `SEED_DEV === '1'`

Em qualquer outro cenário o seed **não roda**. Nunca alterar esse guard para a lógica inversa (`!== 'production'`).

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
| `entradaos` editável | Só admin pode editar, e apenas data/pagamento | Nunca expor edição de `entradaos` para `caixa` |
| `resolveClienteData` com nomes duplicados | Usa o primeiro cliente cadastrado (id menor) | Para nomes ambíguos, informar `clienteid` explicitamente |

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
