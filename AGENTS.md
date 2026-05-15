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
│   ├── nfe.js               # Emissão de NF-e via nfewizard-io
│   └── backup.js            # Trigger manual de backup
├── utils/
│   ├── dates.js             # hoje() — retorna YYYY-MM-DD no fuso America/Sao_Paulo
│   ├── numbers.js           # toNumber(), validarNaoNegativo()
│   └── whatsapp.js          # sendWhatsApp(), sendWhatsAppConfirmacao()
├── data/
│   ├── oficina.db           # banco principal (não commitado)
│   ├── backups/             # rotação 7 arquivos — backup diário 2h BRT
│   └── nfe_xmls/            # XMLs de NF-e — retenção legal 5 anos (não commitado)
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

## Testes via PowerShell

> ⚠️ `-WebSession` do PowerShell **não funciona** com cookies `HttpOnly`/`SameSite` — o cookie não é reenviado automaticamente. O método correto é extrair o token do header `Set-Cookie` e passar como `Bearer` em todas as chamadas seguintes.

### Padrão de autenticação (usar em todos os testes)

```powershell
# Login — extrai token do cookie HttpOnly
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"username":"admin","password":"lojanova"}'
$token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""

# Usar $token em qualquer chamada subsequente
Invoke-RestMethod -Uri "http://localhost:3001/api/nfe" `
  -Method GET -Headers @{ Authorization = "Bearer $token" }
```

### Teste completo de cancelamento (one-liner para console)

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"lojanova"}'; $token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""; $nota = (Invoke-RestMethod -Uri "http://localhost:3001/api/nfe" -Method GET -Headers @{ Authorization = "Bearer $token" }).notas | Where-Object { $_.nfe_status -eq "autorizado" } | Select-Object -First 1; if (-not $nota) { Write-Host "Nenhuma nota autorizada" -ForegroundColor Yellow } else { Write-Host "Cancelando OS#$($nota.id) chave=$($nota.nfe_chave)" -ForegroundColor Cyan; try { $r = Invoke-RestMethod -Uri "http://localhost:3001/api/nfe/$($nota.nfe_chave)/cancelar" -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"motivo":"Nota emitida para teste de cancelamento em homologacao"}'; Write-Host "OK cStat=$($r.cStat) protocolo=$($r.protocolo)" -ForegroundColor Green } catch { Write-Host "ERRO $($_.Exception.Response.StatusCode.value__): $($_.ErrorDetails.Message)" -ForegroundColor Red } }
```

### Outros endpoints úteis

```powershell
# Listar notas
Invoke-RestMethod -Uri "http://localhost:3001/api/nfe" -Method GET -Headers @{ Authorization = "Bearer $token" }

# Cancelar chave específica
Invoke-RestMethod -Uri "http://localhost:3001/api/nfe/CHAVE44DIGITOS/cancelar" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body '{"motivo":"Nota emitida para teste de cancelamento em homologacao"}'
```

### cStat esperados no cancelamento (homologação)

| cStat | Significado |
|---|---|
| `135` | ✅ Evento registrado e vinculado à NF-e |
| `155` | ✅ Cancelamento homologado |
| `218` | ❌ NF-e não consta na base SEFAZ |
| `573` | ❌ Duplicidade de evento (já cancelada) |

---

## NF-e — nfewizard-io (homologado ✅)

> Integração testada e com nota aprovada na SEFAZ. Versão: `nfewizard-io@1.0.4`.

### Configuração correta do objeto `config`

```js
const config = {
  dfe: {
    pathCertificado: path.resolve('backend/certs/certificado.pfx'), // usar path.resolve(), nunca string hardcoded com barras
    senhaCertificado: process.env.NFE_CERT_SENHA,
  },
  nfe: {
    ambiente: Number(process.env.NFE_AMBIENTE_NUM), // number: 1=produção, 2=homologação — NÃO string
    versaoDF: '4.00',
  },
  lib: {
    useOpenSSL: false, // Windows não tem openssl no PATH — SEMPRE false no servidor Windows
  },
};
```

**Armadilhas críticas de configuração:**
- `pathCertificado` e `senhaCertificado` ficam dentro de `config.dfe`, **não** na raiz do objeto
- `config.nfe.ambiente` deve ser **number** (`1` ou `2`), não string (`'2'` vai rejeitar)
- `config.lib.useOpenSSL = false` é obrigatório no Windows — a lib tenta chamar `openssl` do PATH e quebra
- No `ecosystem.config.js`, caminhos do `.pfx` usam `\\` duplo. No código, **sempre usar `path.resolve()`** em vez de concatenação manual de strings — evita problemas com barra simples vs. dupla no Windows

### Tributação — Simples Nacional

| Campo | Valor correto | ❌ Errado |
|---|---|---|
| `ICMS.CST` (CSOSN 400) | `ICMSSN102` | `ICMSSN400` — não existe no schema SEFAZ |
| PIS regime SN | `PISNT` com `CST: '07'` | `PISAliq`, `PISNT` com outro CST |
| COFINS regime SN | `COFINSNT` com `CST: '07'` | `COFINSAliq`, `COFINSNT` com outro CST |

> `ICMSSN400` **não existe** no XSD da SEFAZ. Usar sempre `ICMSSN102` para CSOSN 400.

### Formatação de `dhEmi`

```js
// UTC-3 sem milissegundos — formato exigido pela SEFAZ
const now = new Date();
const dhEmi = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  .toISOString()
  .replace(/\.\d{3}Z$/, '-03:00');
// Resultado: '2025-05-14T09:22:00-03:00'
```

Nunca passar `new Date().toISOString()` direto — a SEFAZ rejeita milissegundos e UTC puro (`Z`).

### Chamada de autorização

```js
const resultado = await NFE_Autorizacao({
  idLote: '1',
  indSinc: 1,
  NFe: {
    infNFe: { /* dados da nota */ }
  }
});

// resultado é um array — acessar índice 0
const infProt = resultado[0].protNFe.infProt;
console.log(infProt.cStat, infProt.xMotivo); // 100 = autorizado
```

**Armadilhas:**
- `NFE_Autorizacao` recebe `{ idLote, indSinc, NFe: { infNFe: {...} } }` — não envolver em array
- A resposta **é** um array — sempre acessar `resultado[0]`
- `infProt.cStat === 100` = nota autorizada com sucesso

### 🔒 Concorrência — fila simples com `nfe_status`

A emissão SEFAZ leva **2–8 segundos**. Se dois usuários tentarem emitir a mesma OS simultaneamente, ocorre race condition com lock no SQLite (single-writer). **Solução obrigatória antes do go-live:**

```js
// Antes de chamar NFE_Autorizacao:
const bloqueio = db.prepare(
  "UPDATE notas_fiscais SET nfe_status='emitindo' WHERE id=? AND nfe_status NOT IN ('emitindo','autorizada')"
).run(nfeId);

if (bloqueio.changes === 0) {
  return res.status(409).json({ error: 'Nota já está sendo emitida ou já foi autorizada.' });
}

// ... chama NFE_Autorizacao ...

// Ao finalizar (sucesso ou erro), atualizar nfe_status para 'autorizada' ou 'erro'
```

Valores válidos para `nfe_status`: `'pendente'`, `'emitindo'`, `'autorizada'`, `'cancelada'`, `'erro'`.

### 🗄️ Armazenamento de XML — obrigação legal (5 anos)

O XML da NF-e autorizada **deve ser armazenado por 5 anos** (obrigação fiscal). Estratégia dupla:

1. **Banco:** salvar no campo `nfe_xml TEXT` da tabela de notas (garante consulta rápida)
2. **Arquivo:** salvar em `backend/data/nfe_xmls/{chave_nfe}.xml` (garante sobrevivência a futuras migrações de banco)

O backup diário às 2h BRT já cobre `backend/data/` — o diretório `nfe_xmls/` **deve estar incluído** no mesmo backup e **nunca** ser adicionado ao `.gitignore`. Verificar que o `robocopy` do deploy não sobrescreve esse diretório.

### ✏️ Carta de Correção e Cancelamento

| Evento | Prazo | Função nfewizard-io |
|---|---|---|
| Cancelamento | Até 24h após autorização (168h se sem circulação) | `NFeRecepcaoEvento` com `tpEvento: '110111'` |
| Carta de Correção (CC-e) | Até 720h (30 dias) | `NFeRecepcaoEvento` com `tpEvento: '110110'` |

**Implementar `NFeRecepcaoEvento` (cancelamento) antes de ir para produção** — sem isso, qualquer nota emitida incorretamente exige contato manual com a SEFAZ.

### 🔌 Contingência

O `nfewizard-io` suporta emissão em contingência (DPEC/offline) quando o webservice da SEFAZ está indisponível. **Para o MVP atual**, é aceitável retornar erro amigável:

```js
// Em caso de timeout/erro de rede com a SEFAZ:
return res.status(503).json({
  error: 'Serviço da SEFAZ temporariamente indisponível. Aguarde alguns minutos e tente novamente.',
  contingencia: false,
});
```

Implementar contingência real é backlog — documentar para o usuário que a emissão deve ser retentada manualmente.

### 🚀 Checklist de go-live (homologação → produção)

- [ ] Mínimo **10 NF-es bem-sucedidas** em homologação (`NFE_AMBIENTE_NUM=2`)
- [ ] Implementar cancelamento (`NFeRecepcaoEvento`) antes de emitir em produção
- [ ] Verificar que `backend/data/nfe_xmls/` está no backup e fora do `.gitignore`
- [ ] Implementar fila com `nfe_status='emitindo'` para bloquear duplicatas
- [ ] Alterar `NFE_AMBIENTE_NUM=1` no `.env` do servidor
- [ ] Reiniciar PM2: `pm2 restart sistemaarte-backend` (necessário para recarregar vars do `.env`)
- [ ] Emitir primeira nota real de baixo valor para validar

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
| NF-e: `pathCertificado` na raiz | lib ignora o certificado silenciosamente | Colocar dentro de `config.dfe` |
| NF-e: `ambiente` como string | SEFAZ rejeita / lib não conecta | Usar `number`: `1` ou `2` |
| NF-e: `ICMSSN400` | Não existe no XSD da SEFAZ — nota rejeitada | Usar `ICMSSN102` para CSOSN 400 |
| NF-e: `dhEmi` com milissegundos | SEFAZ rejeita o formato | Usar `.replace(/\.\d{3}Z$/, '-03:00')` |
| NF-e: `useOpenSSL: true` no Windows | Crash — `openssl` não está no PATH | Setar `config.lib.useOpenSSL = false` |
| NF-e: `resultado` não é indexado | `resultado.protNFe` undefined | Resposta é array — acessar `resultado[0].protNFe.infProt` |
| NF-e: emissão simultânea | Race condition + SQLite lock (2–8s por emissão) | Coluna `nfe_status='emitindo'` como mutex antes do webservice |
| NF-e: XML não salvo | Obrigação legal 5 anos — multa fiscal | Salvar em `nfe_xml` no banco E em `backend/data/nfe_xmls/` |
| NF-e: path do .pfx com barra | Crash silencioso no Windows | Sempre usar `path.resolve()` — nunca string hardcoded |
| NF-e: go-live sem `pm2 restart` | `.env` não recarrega — continua em homologação | `pm2 restart sistemaarte-backend` após alterar `NFE_AMBIENTE_NUM` |
| PowerShell: `-WebSession` com cookie HttpOnly | Cookie não é reenviado — todas as chamadas retornam 401 | Extrair token do `Set-Cookie` e passar como `Bearer` (ver seção "Testes via PowerShell") |

---

## Roadmap / Backlog técnico

Itens validados mas não implementados ainda (features novas, não bugs):

| # | Item | Impacto |
|---|---|---|
| 10 | `criadopor` + `updatedat` em `ordem_itens` | Rastreabilidade por operador |
| 12 | SSE: limitar por `userId` (máx 3/usuário) | Evitar monopolização de conexões |
| 13 | Paginação no `GET /api/ordens` (`?page=&limit=`) | Escala com volume crescente |
| 9 | Backup: gravar `backup-status.json` + endpoint `/api/backup/status` | Observabilidade de falhas |
| 14 | NF-e: cancelamento via `NFeRecepcaoEvento` | ⚠️ Implementado (commit 2691384) mas NÃO TESTADO — endpoint `POST /api/nfe/:chave/cancelar` criado. Testar antes do go-live. |
| 15 | NF-e: fila com `nfe_status='emitindo'` | Bloquear duplicatas em emissão simultânea |
| 16 | NF-e: contingência DPEC/offline | Disponibilidade quando SEFAZ estiver fora |

---

## Protocolo para novas features

1. Criar branch a partir de `develop`
2. Regras de negócio novas → adicionar em `domain/`
3. Novos campos no banco → `ALTER TABLE ADD COLUMN` no array `migrations[]` em `database.js`
4. Cobrir com testes em `backend/__tests__/`
5. PR de `develop` → `main` (testes obrigatórios)
6. Nunca commitar `.env`, `*.db`, `node_modules`, `data/`

---

## Última sessão

**Data:** 2026-05-15
**Agente:** Perplexity
**Tema:** Migration das colunas de cancelamento + documentação PowerShell

### O que foi feito

**Migration das colunas de cancelamento (✅ concluído)**
- Commit `d66177f` — adicionado bloco `// v6` no array `migrations[]` de `database.js`
- Colunas: `nfe_cancelado_em`, `nfe_cancel_protocolo`, `nfe_cancel_motivo`
- O `try/catch` existente garante que bancos com as colunas já adicionadas manualmente não crasham

**Documentação PowerShell (✅ concluído)**
- Adicionada seção "Testes via PowerShell" com o padrão correto de autenticação
- `-WebSession` não funciona com cookies `HttpOnly` — usar extração de token via `Set-Cookie` + `Bearer`
- Armadilha adicionada na tabela de armadilhas conhecidas

### Próximos passos (Fase 1)

| Item | Status |
|---|---|
| Migration das colunas em `database.js` | ✅ Concluído (commit d66177f) |
| Cancelamento — testar endpoint no servidor | ⬜ Próxima tarefa |
| XML da nota autorizada salvo em disco | ⬜ Pendente |
| Carta de Correção (CC-e) | ⬜ Pendente |
| Fila com mutex no `nfe_status` | ⬜ Pendente |
| 10 notas em homologação | ⬜ Pendente |
