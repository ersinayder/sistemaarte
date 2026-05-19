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
| Frontend | React 18 + Vite 8 + TailwindCSS |
| Auth | JWT (`jsonwebtoken`) + cookie HttpOnly |
| Testes | Vitest 4.1 |
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
- **Fluxo:** `develop` → PR → testes (Vitest, 142 testes) → merge → deploy automático
- **Deploy:** `robocopy` sincroniza `backend/` e `frontend/dist/` no servidor, PM2 reinicia via `ecosystem.config.js`
- **O `.env` nunca é copiado pelo deploy** (`/XF .env` no robocopy)

### Estado de producao validado em 2026-05-19

- `main` atualizada no servidor `C:\sistemaarte`.
- `npm audit --omit=dev` no backend: **0 vulnerabilidades**.
- `npm audit --omit=dev` no frontend: **0 vulnerabilidades**.
- Frontend buildado e servido em producao; build esperado usa `vite v8.0.13`.
- Backend reiniciado via PM2 apos pull/install/build.
- O aviso de console do Cloudflare Insights bloqueado por CSP vem do `helmet()` e nao indica falha da aplicacao.

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
> Ajustar o array `$osIds` com IDs de OS no status `'Aguardando'`, `'Pronto'` ou `'Entregue'`.

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

> Integração testada e com nota aprovada na SEFAZ. Versão atual: `nfewizard-io@1.1.0` com overrides `@nfewizard/shared@1.1.0` e `@nfewizard/types@1.0.4`.

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
  - `autorizado`: CC-e, baixar XML de autorização, DANFE real em HTML imprimível, cancelar, detalhes
  - `rejeitado`: reemitir, detalhes
  - `cancelado`: baixar XML de autorização, reemitir, detalhes
  - `emitindo`: atualizar andamento, detalhes
- Modal de detalhes busca eventos fiscais e mostra linha do tempo com XML por evento
- Modal de CC-e mostra aviso do que não pode ser corrigido por Carta de Correção
- Modal de cancelamento mostra resumo da nota, exige motivo mais detalhado e confirmação explícita
- Emissão NF-e permite OS em `Aguardando`, `Pronto` ou `Entregue`, pois alguns clientes PJ exigem nota antes do pagamento e a loja só inicia o serviço mediante pagamento.

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
- [x] DANFE na tela NF-e — endpoint `GET /api/nfe/:chave/danfe` gera HTML imprimível a partir do XML autorizado salvo
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
| 9 | Backup: gravar `backup-status.json` + endpoint `/api/backup/status` | Observabilidade de falhas |
| 17 | NF-e: contingência DPEC/offline | Disponibilidade quando SEFAZ estiver fora |

Itens concluídos em 2026-05-19:

| Item | Estado |
|---|---|
| `nfewizard-io` | Atualizado para `1.1.0`; audit backend/frontend zerado |
| `helmet()` | Ativo em `server.js`; CSP bloqueia Cloudflare Insights por padrão |
| Rate limit global | Reduzido para `60 req/min` |
| Lockout por usuário no login | `5` falhas bloqueiam por `15min` |
| Senha mínima | `8` caracteres em criação/edição de usuário |
| Proteção do próprio admin | Admin não altera o próprio `role` nem desativa o próprio usuário |
| Sessão JWT | Middleware invalida sessão se usuário ficar inativo ou trocar de role |
| SSE KPIs | Limite global `10` e limite por usuário `3` |
| Paginação de Ordens | `GET /api/ordens?page=&limit=` com filtros `status`, `tipo`, `q`, `vencidas` e fallback legado sem paginação |
| Paginação de Clientes | `GET /api/clientes?page=&limit=&q=` com meta de paginação e fallback legado `LIMIT 100/20` |
| `resolveClienteData()` | Lookup por nome preservado, agora com `trim().slice(0, 200)` |
| Rotas sensíveis | Leituras fiscais/financeiras/clientes/produtos restritas a `admin`/`caixa` |

### Roadmap de segurança, estabilidade e SaaS

Conferência do estado atual do código:

- `server.js` tem `helmet()` ativo e rate limit global em `/api` de `60 req/min`.
- `routes/auth.js` tem rate limit por IP (`10` tentativas em `15min`) e lockout por usuário (`5` falhas bloqueiam por `15min`).
- `routes/users.js` exige senha mínima de `8` caracteres e impede admin de alterar o próprio `role` ou desativar o próprio usuário.
- `middlewares/auth.js` revalida usuário/role/active a cada request; se o usuário ficar inativo ou mudar de role, a sessão antiga cai.
- `routes/kpis.js` limita SSE a `10` conexões globais e `3` por usuário.
- `GET /api/ordens` e `GET /api/clientes` têm paginação formal com `page`/`limit` e continuam compatíveis com chamadas legadas sem paginação.
- `resolveClienteData()` preserva lookup por `clientenome`, agora normalizado com `trim().slice(0, 200)`.
- `GET /api/caixa` já filtra lançamentos deletados e OS deletadas com `(l.ordemid IS NULL OR o.deletedat IS NULL)`; manter item apenas para teste/regressão.
- A numeração da NF-e (`nfe_sequencias`) é incrementada antes da autorização; rejeições da SEFAZ hoje consomem número. Reversão só deve ser implementada após validar regra fiscal/operacional, pois em NF-e real número inutilizado/rejeitado pode exigir tratamento cuidadoso.
- Cloudflare Free já oferece um conjunto gerenciado básico de WAF, mas plano Pro ou superior libera WAF gerenciado mais completo. Para produção comercial, manter como recomendação avaliar/ativar Pro.

#### Fase 1: Segurança básica — ação imediata

Infraestrutura:

- Desabilitar RDP exposto na internet ou restringir acesso por allowlist de IPs no firewall.
- Garantir que a porta `3001` responda apenas ao Cloudflare, bloqueando requisições diretas ao origin sempre que o DNS estiver proxied.
- Ativar/configurar Cloudflare WAF. Recomendado avaliar plano Pro ou superior para regras gerenciadas mais completas; no mínimo, habilitar e revisar o Free Managed Ruleset disponível.
- Configurar Windows Defender, Windows Firewall e Windows Update automático no servidor.

Código e aplicação:

- [x] Adicionar `helmet()` em `server.js`.
- [x] Reduzir rate limit global em `server.js` de `200 req/min` para `60 req/min`.
- [x] Implementar lockout no login por usuário/conta: `5` falhas bloqueiam por `15min`.
- [x] Exigir senha mínima de `8` caracteres nas rotas `POST /api/users` e `PUT /api/users/:id`.
- [x] Criar guard em `PUT /api/users/:id` para impedir que o admin altere o próprio `role` ou desative o próprio usuário (`active=0`).

Dados:

- Configurar backup offsite diário automático para fora do servidor, por exemplo S3, Google Drive, OneDrive empresarial ou outro storage versionado.
- Manter backup local diário, mas tratar offsite como obrigatório antes de avançar para uso SaaS/comercial.

#### Fase 2: Estabilidade e escala — curto prazo

Performance:

- [x] Implementar paginação em `GET /api/ordens` com `?page=&limit=`.
- [x] Implementar paginação em `GET /api/clientes` com `?page=&limit=`, preservando busca rápida por `q`.
- [x] Limitar SSE de KPIs em `routes/kpis.js` a no máximo `3` conexões simultâneas por usuário, além do limite global.
- [x] Adicionar `trim().slice(0, 200)` antes do lookup de clientes por nome em `resolveClienteData()`, preservando o comportamento intencional de buscar por nome quando `clienteid` não for informado.

Regras de negócio e integrações:

- Avaliar regra fiscal correta para numeração de NF-e rejeitada. Se aplicável ao ambiente atual, implementar transação/reversão de `nfe_sequencias` em rejeições antes de autorização; se não for seguro reverter, registrar explicitamente como número consumido/inutilizável.
- Alinhar variáveis do WhatsApp no `.env` com a integração definitiva escolhida: Evolution API ou Meta Cloud API.
- Cobrir `GET /api/caixa` com teste de regressão para garantir que OS deletadas/lixeira não apareçam no caixa nem nos saldos.

#### Fase 3: Multi-tenancy inicial — médio prazo

- Mapear processo de criação de subdomínios independentes, por exemplo `cliente.sistema.com.br`.
- Estruturar VPS/Windows Server com PM2 para rodar instâncias isoladas do sistema.
- Separar bancos de dados por cliente, com um `oficina.db` por instância, garantindo isolamento total de dados.
- Definir padrão de pastas por cliente: aplicação, `.env`, banco, backups, XMLs fiscais e logs.

#### Fase 4: Produto comercial — longo prazo

Segurança e auditoria:

- Implementar autenticação 2FA/TOTP para administradores.
- Criar visualização de sessões ativas/dispositivos conectados, com opção de revogação.
- Criar tabela de log de auditoria detalhada para ações sensíveis: login, troca de senha, exclusão, restauração, emissão/cancelamento NF-e, alterações de usuário e alterações financeiras.

Operações SaaS e LGPD:

- Automatizar onboarding de clientes com script para provisionar pasta, `.env`, banco, build/deploy e processo PM2.
- Desenvolver Painel Administrativo Matriz (`Master Admin`) para monitorar instâncias ativas, saúde, versão, backups e uso.
- Redigir Termos de Uso e Política de Privacidade da plataforma.
- Criar endpoints/processos de portabilidade, exportação, anonimização e exclusão de dados conforme LGPD.

### Roadmap estratégico por fases

Ordem recomendada para evolução do sistema:

1. **DANFE real** — concluído e validado em produção após deploy. Usa o XML autorizado salvo em `ordens.nfe_xml` / `backend/data/nfe_xmls`, gera DANFE em HTML imprimível e troca o botão da tela de Notas Fiscais por uma ação real de imprimir/visualizar. Também há botão de DANFE dentro da OS que já tem NF-e emitida.
2. **Propostas + funil básico** — criar um módulo comercial separado das OS. A OS não deve nascer no orçamento; ela deve nascer somente quando a venda virar serviço aprovado.
3. **Link público de proposta + WhatsApp** — cada proposta deve ter link público com token, por exemplo `https://arteemolduras.com.br/proposta/abc123`, enviado ao cliente pelo WhatsApp.
4. **Aprovar proposta e gerar OS** — quando a proposta for aprovada, o sistema deve reaproveitar cliente, itens, total, observações e prazo para criar a OS com numeração `OS-XXXX`.
5. **Contas a pagar/receber separado do caixa** — separar caixa diário, contas a receber e contas a pagar para dar visão de dinheiro realizado e previsto.
6. **DRE simples** — criar visão de resultado por período, sem complexidade contábil excessiva.

### Fase 1: Comercial — Propostas/Funil

Criar um módulo de Propostas/Funil separado das Ordens de Serviço.

Status do funil:

```txt
Novo lead -> Orçamento enviado -> Negociação -> Aprovado -> Perdido
```

Fluxo ideal:

```txt
Cliente pede orçamento
-> cadastra proposta
-> monta itens/valores
-> envia link pelo WhatsApp
-> cliente abre proposta
-> cliente aprova
-> sistema transforma em OS com um clique
```

Objetivo: proposta é venda; OS é produção. Isso evita que uma OS nasça cedo demais, antes de o cliente realmente aprovar o serviço.

### Fase 2: Link público de proposta

Cada proposta deve ter um link público com token, por exemplo:

```txt
https://arteemolduras.com.br/proposta/abc123
```

Nesse link o cliente deve ver:

- Dados da loja
- Descrição dos produtos/serviços
- Valor total
- Prazo estimado
- Observações
- Botão de aprovar
- Botão de solicitar ajuste/negociar

No sistema deve ficar registrado:

- Enviado em
- Visualizado em
- Aprovado em
- Perdido/cancelado em
- Origem da proposta

### Fase 3: Transformar proposta em OS

Quando a proposta for aprovada, disponibilizar a ação:

```txt
Gerar Ordem de Serviço
```

Essa ação deve reaproveitar cliente, itens, total, observações e prazo. A numeração `OS-XXXX` só deve ser gerada nesse momento.

### Fase 4: Financeiro melhor

Separar claramente:

- Caixa diário: dinheiro que entrou/saiu no dia
- Contas a receber: valores futuros ou pendentes de clientes
- Contas a pagar: despesas, fornecedores, boletos, aluguel, materiais etc.

Com isso, o sistema deve permitir acompanhar:

- Quanto há para receber
- Quanto há para pagar
- Saldo previsto
- Pagamentos atrasados
- Despesas por categoria
- Lucro aproximado

### Fase 5: DRE simples

Criar uma visão inicial de DRE:

```txt
Receita bruta
- descontos/cancelamentos
= receita líquida

- custos variáveis
- despesas fixas
- despesas operacionais
= resultado do período
```

Filtros desejados:

- Mês
- Período personalizado
- Categoria
- Forma de pagamento
- Pago/pendente

Objetivo: dar visão de lucro, não apenas movimento de caixa.

### Fase 6: DANFE real

Concluído e validado em produção após deploy de 2026-05-19.

Caminho esperado:

- Usar o XML autorizado salvo em `ordens.nfe_xml` / `backend/data/nfe_xmls`
- Gerar DANFE em HTML imprimível pelo endpoint `GET /api/nfe/:chave/danfe`
- Adicionar botão real na tela de Notas Fiscais
- Adicionar botão dentro da OS emitida
- Ao clicar, o usuário consegue visualizar/imprimir e salvar como PDF pelo navegador

---

## Protocolo para novas features

1. Criar branch a partir de `develop`
2. Regras de negócio novas → adicionar em `domain/`
3. Novos campos no banco → `ALTER TABLE ADD COLUMN` no array `migrations[]` em `database.js`
4. Cobrir com testes em `backend/__tests__/`
5. PR de `develop` → `main` (testes obrigatórios)
6. Nunca commitar `.env`, `*.db`, `node_modules`, `data/`

---

## Sessão Codex — 2026-05-19

**Tema:** atualização pós-`npm audit`, `nfewizard-io`, hardening básico e validação em produção.

### Estado confirmado

- Branch publicada: `codex/kanban-drag-feel`.
- Commit relevante: `4f1106f chore: harden app and update dependencies`.
- `main` foi atualizada no servidor `C:\sistemaarte`.
- `npm audit --omit=dev` no backend e frontend retornou **0 vulnerabilidades**.
- Frontend buildado e servido corretamente em produção.
- `nfewizard-io` atualizado para `1.1.0`.
- Overrides fiscais fixados:
  - `@nfewizard/shared@1.1.0`
  - `@nfewizard/types@1.0.4`
- `frontend/dist/` e `frontend/node_modules/` foram removidos do versionamento; ambos são gerados/instalados no deploy.
- `backend/package-lock.json` e `frontend/package-lock.json` são a fonte versionada correta para reproduzir dependências.

### Hardening aplicado

- `helmet()` ativo no Express.
- Rate limit global em `/api`: `60 req/min`.
- Login:
  - rate limit por IP: `10` tentativas em `15min`
  - lockout por usuário: `5` falhas bloqueiam por `15min`
- Usuários:
  - senha mínima de `8` caracteres em criação e edição
  - admin não pode alterar o próprio `role`
  - admin não pode desativar o próprio usuário
- Sessões:
  - `auth()` revalida `users.active` e `users.role` a cada request
  - sessão antiga cai se usuário ficar inativo ou mudar de role
- SSE KPIs:
  - limite global continua `10`
  - limite por usuário agora é `3`
- Rotas sensíveis de leitura fiscal/financeira/cadastro foram restringidas para `admin`/`caixa`, mantendo `oficina` focada em status de OS.

### Observação Cloudflare/Helmet

Após ativar `helmet()`, o console do navegador pode mostrar bloqueio do script:

```txt
https://static.cloudflareinsights.com/beacon.min.js
violates Content Security Policy: "script-src 'self'"
```

Isso é esperado com a CSP padrão do Helmet e não indica falha da aplicação. Se o Cloudflare Insights for necessário, liberar explicitamente `static.cloudflareinsights.com` em `script-src` numa mudança pequena e testada.

### Validação local antes do push

- `npm.cmd test` no backend: **18 arquivos, 146 testes passando**.
- `npm.cmd run build` no frontend: OK com `vite v8.0.13`.
- `npm audit --omit=dev` no backend: **0 vulnerabilidades**.
- `npm audit --omit=dev` no frontend: **0 vulnerabilidades**.

### Próximo foco recomendado do roadmap

1. Criar `backup-status.json` e endpoint/status de backup para observabilidade.
2. Depois disso, iniciar o módulo comercial: **Propostas/Funil**, separado das OS.
3. Manter contingência NF-e DPEC/offline como backlog fiscal posterior ao MVP.

---

## Sessão Codex — 2026-05-15 noite

**Tema:** NF-e/CC-e em homologação, XML fiscal, impressão da OS, status inválido e preparação para continuar de outro local.

### Estado Git/PR

- PR #51 `feat: completa tela e eventos de NF-e` foi mergeado na `main`.
- PR #52 `fix: corrige cStat no evento de autorização NF-e` foi mergeado na `main`.
- Branch publicada e ainda pendente de merge/deploy: `codex/fix-nfe-xml-download`.
  - Link: `https://github.com/ersinayder/sistemaarte/pull/new/codex/fix-nfe-xml-download`
  - Inclui correção de XML real, impressão da OS e remoção do status `Recebido`.

### Deploy e validação no servidor

No servidor `C:\sistemaarte`, foi executado:

```powershell
git pull origin main
cd C:\sistemaarte\backend
npm install --omit=dev
pm2 restart sistemaarte-backend
```

Resultado:
- PM2 ficou `online`.
- Migration validada em `C:\sistemaarte\backend`.
- `PRAGMA table_info(nfe_eventos)` retornou:

```txt
id,ordemid,chave,tipo,nseqevento,protocolo,cstat,motivo,texto,xml,createdat
```

### NF-e e CC-e homologadas

- NF-e homologação autorizada:
  - número: `000000029`
  - chave: `31260507500718000196550010000000291000000291`
  - `cStat=100`
  - XML salvo em `backend/data/nfe_xmls/31260507500718000196550010000000291000000291.xml`
- A autorização foi aprovada pela SEFAZ, mas a rota retornou erro depois:
  - erro: `ReferenceError: cstat is not defined`
  - causa: evento de autorização usava `cstat` em vez de `cStat`
  - corrigido no PR #52
- CC-e homologada com sucesso para a NF-e `000000029`:
  - `cStat=135`
  - protocolo: `131260152119363`
  - XML salvo em `backend/data/nfe_xmls/31260507500718000196550010000000291000000291-cce-01.xml`

### XML fiscal quebrado

Problema encontrado:

```txt
Start tag expected, '<' not found
```

Causa:
- Alguns downloads `.xml` continham JSON da resposta da `nfewizard-io`, não XML puro.
- O XML real vem dentro do campo `xml` retornado pela lib.

Correção na branch `codex/fix-nfe-xml-download`:
- `backend/routes/nfe.js`
  - adicionados `extrairXmlFiscal()` e `serializarXmlFiscal()`
  - novas emissões/eventos salvam XML puro quando houver campo `xml`
  - downloads antigos tentam desembrulhar JSON salvo e retornar XML real
- Endpoints afetados:
  - `GET /api/nfe/:chave/xml/autorizacao`
  - `GET /api/nfe/eventos/:eventoId/xml`

### Impressão da OS

Bug encontrado:
- Na impressão da OS, `Entrada recebida` aparecia `R$ 0,00`, mesmo com pagamento já lançado no caixa.
- Exemplo visto: OS `OS-0092`, total `R$ 164,00`, recebido `R$ 82,00`, saldo `R$ 82,00`.

Causa:
- `backend/routes/pdf.js` mostrava `ordens.valorentrada` diretamente.
- Quando a OS era criada sem entrada e recebia pagamento depois pelo Caixa, `valorentrada` continuava zero.

Correção na branch `codex/fix-nfe-xml-download`:
- `pdf.js` passou a usar `getResumoFinanceiroOS()`.
- `Total recebido` e `Saldo em aberto` usam a regra financeira oficial.
- `Entrada recebida` mostra `valorentrada` se houver; se estiver zerado, mostra o valor já recebido.

Resultado esperado para `OS-0092`:

```txt
Total: R$ 164,00
Entrada recebida: R$ 82,00
Total recebido: R$ 82,00
Saldo em aberto: R$ 82,00
```

### Status `Recebido` removido da tela da OS

Bug encontrado:
- A tela de detalhe/oficina mostrava botão `Recebido`.
- Backend rejeitava com `Status inválido. Permitidos: Aguardando, Em Produção, Pronto, Entregue, Cancelado`.

Correção na branch `codex/fix-nfe-xml-download`:
- `frontend/src/pages/OrdemDetalhe.jsx`
  - `STATUS_FLOW` virou `['Aguardando','Em Produção','Pronto','Entregue']`
  - removido o botão `Recebido`
  - passo 1 do progresso agora é `Aguardando`

### Limpeza de OS de teste em produção

Como o sistema está em produção com caixa real:
- OS criadas apenas para homologação/teste podem ser excluídas antes do fechamento de caixa.
- Caminho seguro:
  1. Excluir/mover para lixeira pelo sistema.
  2. Ir na lixeira.
  3. Fazer exclusão permanente.
  4. Conferir se saiu do Caixa e da tela de Notas Fiscais.
- Usuário confirmou que ao deletar OS de teste, saiu do caixa e da tela de NF-e.
- Não deletar OS real.

### Validações locais após hotfixes

- `node --check backend/routes/nfe.js`: OK
- `node --check backend/routes/pdf.js`: OK
- `npm.cmd test` no backend: 90/90 passando
- `npm.cmd run build` no frontend: OK

### Próximos passos imediatos

| Item | Status |
|---|---|
| Mergear `codex/fix-nfe-xml-download` | Concluído |
| `git pull origin main` no servidor após merge | Concluído |
| `pm2 restart sistemaarte-backend` após pull | Concluído |
| Rebaixar XML autorização e XML CC-e e conferir que abrem como XML | Validado em fluxo fiscal anterior; manter como regressão quando emitir novas NF-es |
| Validar impressão da OS `OS-0092` | Concluído pelo DANFE/OS pós-deploy |
| Confirmar que `Recebido` sumiu da tela da OS | Concluído |
| Continuar NF-es homologadas até 10/10 | Pendente |
| Implementar DANFE real | Concluído e validado em produção |
| Go-live `NFE_AMBIENTE_NUM=1` | Aguardar homologação |

### Acesso remoto ao servidor

- Na mesma rede, `mstsc` funciona porque o cliente alcança o IP interno do servidor.
- De outra rede, RDP só funciona se houver rota externa para o servidor.
- Não recomendado expor RDP direto na internet via porta 3389.
- Caminhos recomendados, em ordem:
  1. VPN privada tipo Tailscale/ZeroTier entre seu PC de casa e o servidor.
  2. VPN no roteador/firewall da empresa.
  3. Cloudflare Tunnel/Access para acesso autenticado.
  4. Port forwarding de RDP somente como último caso, com IP restrito, senha forte, NLA e firewall.

---

## Última sessão anterior

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
| DANFE | ✅ Implementado localmente; falta validar no servidor com XML autorizado real |
| 10 notas em homologação | ⬜ ~2 feitas, faltam ~8 |
| Go-live (NFE_AMBIENTE_NUM=1) | ⬜ Aguarda 10 notas homologadas |
