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
│   ├── financeiroRules.js   # getResumoFinanceiroOS — UNICA fonte de verdade para saldo de OS
│   └── nfeRules.js          # montarNFe() — retorna { infNFe: { ide, emit, dest, det[], total, transp, pag } }
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
- **Fluxo:** `develop` → PR → testes (Vitest, 90 testes) → merge → deploy automático
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

### Reset de nfe_status via node (útil em homologação)

> Usar quando uma OS tem `nfe_status='autorizado'` expirado (>24h) e precisa ser reemitida para teste.

```powershell
cd C:\sistemaarte\backend
node -e "const db=require('better-sqlite3')('./data/oficina.db');db.prepare('UPDATE ordens SET nfe_status=NULL,nfe_chave=NULL,nfe_protocolo=NULL,nfe_numero=NULL,nfe_emitida_em=NULL WHERE id=?').run(79);console.log('OK');db.close();"
```

> **Nunca usar em produção.** Apenas em homologação para reaproveitamento de OS de teste.

### Script para emitir múltiplas notas em homologação

> Usar para atingir o mínimo de 10 NF-es homologadas antes do go-live.  
> Ajustar o array `$osIds` com IDs de OS no status `'Pronto'` ou `'Entregue'`.

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"lojanova"}'
$token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""

$osIds = @(79, 80, 81, 82, 83, 84, 85, 86)   # ajustar conforme IDs disponíveis
foreach ($id in $osIds) {
  try {
    # Reset (caso nota anterior ainda esteja no banco)
    node -e "const db=require('better-sqlite3')('./data/oficina.db');db.prepare('UPDATE ordens SET nfe_status=NULL,nfe_chave=NULL,nfe_protocolo=NULL,nfe_numero=NULL,nfe_emitida_em=NULL WHERE id=?').run($id);db.close();"
    $r = Invoke-RestMethod -Uri "http://localhost:3001/api/nfe/emitir/$id" -Method POST -Headers @{ Authorization = "Bearer $token" }
    Write-Host "OS#$id ✅ chave=$($r.chave)" -ForegroundColor Green
    Start-Sleep -Seconds 3
  } catch {
    Write-Host "OS#$id ❌ $_" -ForegroundColor Red
  }
}
```

### Teste completo: emitir e cancelar em sequência

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"lojanova"}'; $token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""; $emissao = Invoke-RestMethod -Uri "http://localhost:3001/api/nfe/emitir/79" -Method POST -Headers @{ Authorization = "Bearer $token" }; Write-Host "Emitida chave=$($emissao.chave)" -ForegroundColor Green; Start-Sleep -Seconds 2; $r = Invoke-RestMethod -Uri "http://localhost:3001/api/nfe/$($emissao.chave)/cancelar" -Method POST -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"motivo":"Nota emitida para teste de cancelamento em homologacao"}'; Write-Host "Cancelada cStat=$($r.cStat) protocolo=$($r.protocolo)" -ForegroundColor Green
```

**Resultado esperado:** `cStat=135` e protocolo numérico preenchido.

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

> ⚠️ **Prazo de cancelamento:** A SEFAZ rejeita com "Prazo de cancelamento superior ao previsto" se a nota tiver mais de 24h. Em homologação, sempre resetar o `nfe_status` e reemitir antes de testar o cancelamento.

---

## NF-e — nfewizard-io (homologado ✅)

> Integração testada e com nota aprovada na SEFAZ. Versão: `nfewizard-io@1.0.4`.

### Estrutura de retorno de `montarNFe()`

```js
// domain/nfeRules.js — retorna SEMPRE com wrapper infNFe
const payload = montarNFe({ ordem, itens, cliente, emitente, numero, serie });
// payload = { infNFe: { ide, emit, dest, det[], total, transp, pag } }

// Acesso correto:
payload.infNFe.ide.mod     // '55'
payload.infNFe.det[0]      // primeiro item
payload.infNFe.total.ICMSTot.vNF

// ❌ ERRADO — não existe payload.ide, payload.dest, etc.
payload.ide.mod
```

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

### Chamada de cancelamento — `NFeRecepcaoEvento` ✅ Testado

```js
// tpEvento '110111' = cancelamento
const resultado = await NFeRecepcaoEvento({
  idLote: '1',
  evento: [{
    infEvento: {
      cOrgao: uf,
      tpAmb: Number(process.env.NFE_AMBIENTE_NUM),
      CNPJ: process.env.NFE_CNPJ_EMITENTE,
      chNFe: chave,
      dhEvento: dhEvento,       // mesmo formato de dhEmi: UTC-3, sem milissegundos
      tpEvento: '110111',
      nSeqEvento: '1',
      verEvento: '1.00',
      detEvento: {
        descEvento: 'Cancelamento',
        nProt: protocolo,       // protocolo de autorização da nota
        xJust: motivo,          // mínimo 15 caracteres
      },
    },
  }],
});

const retEvento = resultado[0].retEvento.infEvento;
// retEvento.cStat === '135' = evento registrado com sucesso
```

> **Prazo:** até 24h após autorização (ou 168h se sem circulação). SEFAZ retorna rejeição se exceder.

### 🔒 Mutex `nfe_status='emitindo'` ✅ Implementado (commit `a0d0550`)

```js
// UPDATE atômico — só executa se status NÃO for 'emitindo' nem 'autorizado'
const lock = db.prepare(`
  UPDATE ordens
  SET nfe_status = 'emitindo'
  WHERE id = ? AND (nfe_status IS NULL OR nfe_status NOT IN ('emitindo', 'autorizado'))
`).run(osId);

if (lock.changes === 0) {
  return res.status(409).json({ erro: 'NF-e já está sendo emitida ou já foi autorizada.' });
}
// ... chama SEFAZ ...
// Em caso de erro: UPDATE SET nfe_status='rejeitado' WHERE nfe_status='emitindo'
```

O guard timeout de 40s também libera o mutex (`nfe_status='rejeitado'`) se o status ainda for `'emitindo'` ao disparar.

### 🗄️ Armazenamento de XML — obrigação legal (5 anos) ✅ Implementado

```js
// Salvo em duas camadas:
// 1. Banco: campo nfe_xml TEXT na tabela ordens
// 2. Arquivo: backend/data/nfe_xmls/{chave}.xml  (e {chave}-canc.xml para cancelamentos)
salvarXmlDisco(`${chave}.xml`, xmlAutorizacao);
salvarXmlDisco(`${chave}-canc.xml`, xmlEvento);
```

O backup diário às 2h BRT já cobre `backend/data/` — o diretório `nfe_xmls/` **deve estar incluído** no mesmo backup e **nunca** ser adicionado ao `.gitignore`. Verificar que o `robocopy` do deploy não sobrescreve esse diretório.

### ✏️ Carta de Correção e Cancelamento

| Evento | Prazo | Função nfewizard-io |
|---|---|---|
| Cancelamento | Até 24h após autorização (168h se sem circulação) | `NFE_Cancelamento` com `tpEvento: '110111'` |
| Carta de Correção (CC-e) | Até 720h (30 dias) | `NFE_CartaDeCorrecao` com `tpEvento: '110110'` |

**CC-e implementada nesta sessão Codex. Próximo passo: validar em homologação contra a SEFAZ.**

### Tela NF-e — estado atual

`frontend/src/pages/NotasFiscais.jsx` agora:
- Lista notas via `GET /api/nfe` (sem carregar `nfe_xml` pesado na listagem)
- Mostra KPIs: total, autorizadas, rejeitadas, em andamento e canceladas
- Mostra indicador temporario de homologacao: notas autorizadas X/10 e ambiente atual
- Mostra motivo persistido da última rejeição quando `nfe_status='rejeitado'`
- Permite ações por status:
  - `autorizado`: CC-e, baixar XML de autorização, DANFE (roadmap), cancelar, detalhes
  - `rejeitado`: reemitir, detalhes
  - `cancelado`: baixar XML de autorização, reemitir, detalhes
  - `emitindo`: atualizar andamento, detalhes
- Modal de detalhes busca eventos fiscais e mostra linha do tempo com XML por evento
- Modal de CC-e mostra aviso do que não pode ser corrigido por Carta de Correção
- Modal de cancelamento mostra resumo da nota, exige motivo mais detalhado e confirmação explícita

### Endpoints fiscais auxiliares

```txt
GET  /api/nfe                         # lista notas sem XML pesado; retorna meta.ambiente e contador homologacao
GET  /api/nfe/:chave/eventos          # eventos por chave NF-e
GET  /api/nfe/ordem/:ordemId/eventos  # eventos por OS (útil para rejeição sem chave)
GET  /api/nfe/:chave/xml/autorizacao  # baixa XML da autorização salvo em ordens.nfe_xml
GET  /api/nfe/eventos/:eventoId/xml   # baixa XML de CC-e/cancelamento/rejeição
POST /api/nfe/:chave/cce              # emite CC-e
POST /api/nfe/:chave/cancelar         # cancela NF-e autorizada
```

Eventos fiscais ficam em `nfe_eventos` com `tipo`: `autorizacao`, `rejeicao`, `cce`, `cancelamento`.
Novas emissões registram autorização/rejeição nessa tabela. Notas antigas podem ter `nfe_xml` e dados de cancelamento em `ordens`, mas não necessariamente eventos retroativos em `nfe_eventos`.

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

- [x] Migration das colunas de cancelamento em `database.js` (commit `d66177f`)
- [x] Endpoint `POST /api/nfe/:chave/cancelar` implementado (commit `2691384`)
- [x] Cancelamento testado em homologação — **cStat=135, protocolo=131260152114451** (2026-05-15)
- [x] XML salvo em `backend/data/nfe_xmls/{chave}.xml` e `{chave}-canc.xml` (commit `a0d0550`)
- [x] Mutex `nfe_status='emitindo'` — bloqueia race condition em emissões simultâneas (commit `a0d0550`)
- [x] Testes `nfe.test.js` corrigidos — 90/90 passando (commit `5a7eabd`)
- [ ] Mínimo **10 NF-es bem-sucedidas** em homologação (`NFE_AMBIENTE_NUM=2`) — contador atual: ~2
- [x] Implementar Carta de Correção (CC-e) — `tpEvento: '110110'` (pendente teste SEFAZ em homologação)
- [x] Tela de NF-e com histórico de eventos, motivo de rejeição, reemissão, download de XML, aviso de CC-e, confirmação forte de cancelamento e contador X/10 homologação
- [ ] DANFE na tela NF-e — hoje aparece como ação/roadmap, mas ainda não gera impressão/visualização
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
| NF-e: `PISAliq` no Simples Nacional | Tag errada — SEFAZ rejeita | Usar `PISNT`/`COFINSNT` com `CST: '07'` |
| NF-e: `dhEmi` com milissegundos | SEFAZ rejeita o formato | Usar `.replace(/\.\d{3}Z$/, '-03:00')` |
| NF-e: `useOpenSSL: true` no Windows | Crash — `openssl` não está no PATH | Setar `config.lib.useOpenSSL = false` |
| NF-e: `resultado` não é indexado | `resultado.protNFe` undefined | Resposta é array — acessar `resultado[0].protNFe.infProt` |
| NF-e: `montarNFe()` sem wrapper | `nfe.ide` undefined | Retorna `{ infNFe: {...} }` — sempre acessar `payload.infNFe.ide` |
| NF-e: emissão simultânea | Race condition + SQLite lock (2–8s por emissão) | Mutex atômico com `UPDATE WHERE NOT IN ('emitindo','autorizado')` — `changes===0` → 409 |
| NF-e: mutex preso em 'emitindo' | Crash antes do finally liberar | Guard timeout de 40s + catch global reseta para `'rejeitado'` |
| NF-e: XML não salvo | Obrigação legal 5 anos — multa fiscal | Salvar em `nfe_xml` no banco E em `backend/data/nfe_xmls/` |
| NF-e: path do .pfx com barra | Crash silencioso no Windows | Sempre usar `path.resolve()` — nunca string hardcoded |
| NF-e: go-live sem `pm2 restart` | `.env` não recarrega — continua em homologação | `pm2 restart sistemaarte-backend` após alterar `NFE_AMBIENTE_NUM` |
| NF-e: cancelar nota >24h | SEFAZ rejeita "Prazo superior ao previsto" | Resetar `nfe_status` no banco e reemitir antes de cancelar |
| NF-e: `wizard.NFeRecepcaoEvento is not a function` | PM2 rodando código antigo em memória | `pm2 restart sistemaarte-backend` após `git pull` |
| PowerShell: aspas mistas em `-e` node | `SyntaxError: Invalid or unexpected token` | Usar apenas aspas simples dentro do `-e`: `node -e "...db.prepare('SQL').run()..."` |
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
| 17 | NF-e: contingência DPEC/offline | Disponibilidade quando SEFAZ estiver fora |

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
**Agente:** Codex  
**Tema:** Implementação de Carta de Correção (CC-e) + ações fiscais na tela

### O que foi feito

**Carta de Correção (CC-e)**
- Endpoint `POST /api/nfe/:chave/cce` implementado usando `NFE_CartaDeCorrecao`, `tpEvento='110110'`, sequência incremental e prazo de 720h
- Eventos fiscais agora são persistidos em `nfe_eventos`, com protocolo, cStat, texto, XML e sequência
- XML da CC-e salvo em `backend/data/nfe_xmls/{chave}-cce-XX.xml`
- Tela `NotasFiscais.jsx` ganhou ações para CC-e e cancelamento, além de listagem via `GET /api/nfe`
- Timeout das chamadas fiscais no frontend ajustado para 45s
- Verificação local: **90/90 testes backend passando** e **build frontend OK**

**Complemento da tela fiscal**
- `GET /api/nfe` foi otimizado para não retornar `nfe_xml` na listagem
- Implementados endpoints de eventos e download XML:
  - `GET /api/nfe/:chave/eventos`
  - `GET /api/nfe/ordem/:ordemId/eventos`
  - `GET /api/nfe/:chave/xml/autorizacao`
  - `GET /api/nfe/eventos/:eventoId/xml`
- Emissão autorizada e rejeição agora registram evento em `nfe_eventos`
- Detalhe da NF-e mostra linha do tempo fiscal e permite baixar XML da autorização, CC-e e cancelamento
- Rejeições exibem motivo persistido e notas rejeitadas/canceladas podem ser reemitidas pela tela
- Reemissão de nota cancelada limpa `nfe_cancelado_em`, `nfe_cancel_protocolo` e `nfe_cancel_motivo` quando a nova autorização entra
- Tela recebeu contador temporário de homologação X/10, ação DANFE marcada como roadmap, botão de atualizar para notas em `emitindo`
- Modal de CC-e recebeu aviso operacional sobre restrições legais; modal de cancelamento recebeu resumo da nota, motivo mínimo mais contextualizado e confirmação explícita
- `GET /api/nfe` passou a retornar `meta` com ambiente atual e alvo/contador de homologação; `tpAmbAtual()` aceita `NFE_AMBIENTE_NUM` ou `NFE_AMBIENTE`
- Verificação repetida: **90/90 testes backend passando**, `node --check backend/routes/nfe.js` OK e **build frontend OK**

### Próximos passos

| Item | Status |
|---|---|
| Testes `nfe.test.js` | ✅ 90/90 passando (commit `5a7eabd`) |
| XML salvo em `nfe_xmls/{chave}.xml` | ✅ Já implementado (commit anterior) |
| Mutex `nfe_status='emitindo'` | ✅ Concluído (commit `a0d0550`) |
| **Carta de Correção (CC-e)** | ✅ Implementada; falta teste SEFAZ em homologação |
| Histórico/XML/avisos/contador na tela NF-e | ✅ Implementado localmente; falta validar no servidor |
| DANFE | ⬜ Roadmap visível na tela; geração/visualização ainda pendente |
| 10 notas em homologação | ⬜ ~2 feitas, faltam ~8 |
| Go-live (NFE_AMBIENTE_NUM=1) | ⬜ Aguarda 10 notas homologadas |
