# Fase 0 - Integridade Fiscal e Financeira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir retransmissão de NF-e incerta, reutilização insegura de numeração, autorização sem XML legal e edição de caixa que reabra saldo de OS entregue.

**Architecture:** Regras fiscais puras serão adicionadas ao módulo canônico existente e a emissão ganhará um serviço injetável com repositório SQLite para tentativas e transições. A rota continuará responsável por HTTP, enquanto reserva, transmissão e persistência fiscal ficam testáveis fora do Express; o caixa usará um serviço transacional próprio para validar o saldo projetado das OS afetadas.

**Tech Stack:** Node.js 22, CommonJS, Express 4, better-sqlite3, SQLite WAL, Vitest 4.1, nfewizard-io.

---

## File Map

- Modify: `backend/domain/nfeEmissionRules.js`
  - Classificação conclusiva/incerta, allowlist de devolução, estados ativos e validação de XML.
- Modify: `backend/__tests__/nfeEmissionRules.test.js`
  - Testes unitários das novas regras fiscais.
- Modify: `backend/database.js`
  - Tabelas `nfe_emissao_tentativas` e `nfe_emissao_transicoes`, índices e constraints.
- Create: `backend/repositories/nfeAttemptRepository.js`
  - Reserva atômica de número/tentativa, leitura de tentativa ativa e transições monotônicas.
- Create: `backend/__tests__/nfeAttemptRepository.test.js`
  - Testes SQLite in-memory de concorrência, histórico e numeração.
- Create: `backend/services/nfePersistenceService.js`
  - Commit atômico de OS, tentativa, XML, cliente e evento fiscal.
- Create: `backend/__tests__/nfePersistenceService.test.js`
  - Testes de commit e rollback obrigatórios.
- Create: `backend/services/nfeEmissaoService.js`
  - Orquestra tentativa, SEFAZ, timeout lógico, classificação, persistência e projeção em disco.
- Create: `backend/__tests__/nfeEmissaoService.test.js`
  - Testes de timeout, resposta tardia, XML inválido, rejeição e concorrência.
- Modify: `backend/routes/nfe.js`
  - Adaptador HTTP fino para o serviço e remoção dos fallbacks inseguros.
- Modify: `backend/__tests__/routeContracts.test.js`
  - Contratos estruturais atualizados para o novo serviço.
- Create: `backend/domain/ordemPagamentoRules.js`
  - Cálculo em centavos da contribuição antiga/nova e OS afetadas.
- Create: `backend/services/caixaLancamentoService.js`
  - Edição transacional do lançamento com validação das OS entregues.
- Create: `backend/__tests__/ordemPagamentoRules.test.js`
  - Casos unitários de redução, desvinculação, troca e estorno.
- Create: `backend/__tests__/caixaLancamentoService.test.js`
  - Casos SQLite in-memory da invariável de OS entregue.
- Modify: `backend/routes/caixa.js`
  - Delegação do `PUT /:id` ao serviço transacional.

## Task 1: Regras fiscais conclusivas e XML legal

**Files:**
- Modify: `backend/domain/nfeEmissionRules.js`
- Modify: `backend/__tests__/nfeEmissionRules.test.js`

- [ ] **Step 1: Escrever testes vermelhos para classificação, devolução e XML**

Adicionar ao teste existente:

```js
import {
  classificarResultadoEmissao,
  estadoEmissaoBloqueiaReenvio,
  rejeicaoPermiteDevolverNumero,
  validarXmlAutorizacao,
} from '../domain/nfeEmissionRules.js';

describe('integridade da emissao NF-e', () => {
  it.each([
    [null, 'incerto'],
    [{ cStat: '' }, 'incerto'],
    [{ cStat: '999999' }, 'incerto'],
    [{ timeout: true }, 'incerto'],
    [{ cStat: '100', chave: '351234' }, 'autorizado'],
    [{ cStat: '386', motivo: 'CFOP invalido' }, 'rejeitado'],
  ])('classifica %j como %s', (entrada, status) => {
    expect(classificarResultadoEmissao(entrada).status).toBe(status);
  });

  it('usa allowlist estrita para devolver numero', () => {
    expect(rejeicaoPermiteDevolverNumero('386')).toBe(true);
    expect(rejeicaoPermiteDevolverNumero('')).toBe(false);
    expect(rejeicaoPermiteDevolverNumero('999999')).toBe(false);
    expect(rejeicaoPermiteDevolverNumero('204')).toBe(false);
  });

  it.each(['processando', 'incerto'])('bloqueia reenvio em %s', (status) => {
    expect(estadoEmissaoBloqueiaReenvio(status)).toBe(true);
  });

  it('recusa JSON, XML sem nfeProc e XML de outra chave', () => {
    const chave = '35160607500718000196550010000002811000002810';
    const outra = '35160607500718000196550010000002821000002820';
    expect(validarXmlAutorizacao('{"cStat":"100"}', chave).ok).toBe(false);
    expect(validarXmlAutorizacao('<retEnviNFe />', chave).ok).toBe(false);
    expect(validarXmlAutorizacao(`<nfeProc><protNFe><infProt><chNFe>${outra}</chNFe></infProt></protNFe></nfeProc>`, chave).ok).toBe(false);
  });

  it('aceita nfeProc da chave autorizada', () => {
    const chave = '35160607500718000196550010000002811000002810';
    const xml = `<nfeProc><NFe><infNFe Id="NFe${chave}" /></NFe><protNFe><infProt><chNFe>${chave}</chNFe></infProt></protNFe></nfeProc>`;
    expect(validarXmlAutorizacao(xml, chave)).toEqual({ ok: true, xml });
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar RED**

Run:

```powershell
cd backend
npm.cmd test -- nfeEmissionRules.test.js
```

Expected: FAIL porque as quatro funções novas ainda não são exportadas.

- [ ] **Step 3: Implementar as regras mínimas**

Adicionar a `backend/domain/nfeEmissionRules.js`:

```js
const CSTAT_REJEICAO_COM_REUSO_SEGURO = new Set([
  '225', '234', '245', '246', '247', '248', '249',
  '267', '321', '328', '386', '387', '388', '389',
  '390', '391', '392', '393', '394', '395', '396',
  '397', '398', '399', '402', '403', '404', '405',
  '406', '407', '408', '409', '410', '411',
]);

function rejeicaoPermiteDevolverNumero(cStat) {
  return CSTAT_REJEICAO_COM_REUSO_SEGURO.has(String(cStat || '').trim());
}

function estadoEmissaoBloqueiaReenvio(status) {
  return status === 'processando' || status === 'incerto';
}

function classificarResultadoEmissao(resultado) {
  if (resultado?.timeout) return { status: 'incerto', cStat: null };
  const cStat = String(resultado?.cStat || '').trim();
  if (cStat === '100') return { status: 'autorizado', cStat };
  if (rejeicaoPermiteDevolverNumero(cStat) || ['204', '205', '206', '302', '303'].includes(cStat)) {
    return { status: 'rejeitado', cStat };
  }
  return { status: 'incerto', cStat: cStat || null };
}

function validarXmlAutorizacao(value, chaveEsperada) {
  const xml = typeof value === 'string' ? value.trim() : '';
  if (!xml.startsWith('<') || !/<nfeProc(?:\s|>)/i.test(xml)) {
    return { ok: false, erro: 'XML autorizado ausente ou invalido.' };
  }
  const match = xml.match(/<chNFe>(\d{44})<\/chNFe>/i)
    || xml.match(/Id=["']NFe(\d{44})["']/i);
  if (chaveEsperada && (!match || match[1] !== String(chaveEsperada))) {
    return { ok: false, erro: 'XML autorizado nao corresponde a chave retornada.' };
  }
  return { ok: true, xml };
}
```

Exportar as quatro funções. Durante a implementação real, manter a allowlist apenas com códigos cuja semântica já esteja coberta por teste e documentação do retorno existente; se a lista acima contiver código sem evidência local, removê-lo e manter o comportamento conservador `incerto`.

- [ ] **Step 4: Executar o teste e confirmar GREEN**

Run:

```powershell
npm.cmd test -- nfeEmissionRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/nfeEmissionRules.js backend/__tests__/nfeEmissionRules.test.js
git commit -m "test: define regras seguras de resultado fiscal"
```

## Task 2: Persistir tentativas e transições de emissão

**Files:**
- Modify: `backend/database.js`
- Create: `backend/repositories/nfeAttemptRepository.js`
- Create: `backend/__tests__/nfeAttemptRepository.test.js`

- [ ] **Step 1: Escrever teste vermelho do repositório**

Criar banco in-memory com `ordens`, `nfe_sequencias`,
`nfe_emissao_tentativas` e `nfe_emissao_transicoes`. Testar:

```js
it('reserva numero e tentativa ativa na mesma transacao', () => {
  const repo = createNfeAttemptRepository(db, { agora: () => NOW });
  const tentativa = repo.reservar({ ordemId: 7, serie: '1', usuarioId: 3 });

  expect(tentativa).toMatchObject({
    ordemid: 7,
    operacao: 'emissao',
    numero: 281,
    serie: '1',
    status: 'processando',
  });
  expect(db.prepare("SELECT ultimo_numero FROM nfe_sequencias WHERE serie='1'").get().ultimo_numero).toBe(281);
  expect(db.prepare('SELECT status FROM nfe_emissao_transicoes WHERE tentativaid=?').get(tentativa.id).status).toBe('processando');
});

it('impede segunda tentativa ativa sem consumir numero', () => {
  const repo = createNfeAttemptRepository(db, { agora: () => NOW });
  repo.reservar({ ordemId: 7, serie: '1', usuarioId: 3 });

  expect(() => repo.reservar({ ordemId: 7, serie: '1', usuarioId: 3 }))
    .toThrowError(expect.objectContaining({ status: 409, code: 'nfe_tentativa_ativa' }));
  expect(db.prepare("SELECT ultimo_numero FROM nfe_sequencias WHERE serie='1'").get().ultimo_numero).toBe(281);
});

it('nao permite regressao de autorizado para rejeitado', () => {
  const repo = createNfeAttemptRepository(db, { agora: () => NOW });
  const tentativa = repo.reservar({ ordemId: 7, serie: '1', usuarioId: 3 });
  repo.transicionar(tentativa.id, 'autorizado', { cStat: '100' });

  expect(() => repo.transicionar(tentativa.id, 'rejeitado', { cStat: '386' }))
    .toThrowError(expect.objectContaining({ code: 'nfe_transicao_invalida' }));
});

it('devolve apenas o ultimo numero reservado sem apagar a rejeicao fiscal', () => {
  const repo = createNfeAttemptRepository(db, { agora: () => NOW });
  const tentativa = repo.reservar({ ordemId: 7, serie: '1', usuarioId: 3 });
  repo.transicionar(tentativa.id, 'rejeitado', { cStat: '386', motivo: 'CFOP invalido' });

  expect(repo.devolverNumero(tentativa.id)).toBe(true);
  expect(repo.buscarPorId(tentativa.id).status).toBe('rejeitado');
  expect(db.prepare("SELECT ultimo_numero FROM nfe_sequencias WHERE serie='1'").get().ultimo_numero).toBe(280);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
npm.cmd test -- nfeAttemptRepository.test.js
```

Expected: FAIL porque o repositório ainda não existe.

- [ ] **Step 3: Adicionar schema e índices**

Adicionar ao `SCHEMA` e ao final de `migrations[]`:

```sql
CREATE TABLE IF NOT EXISTS nfe_emissao_tentativas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ordemid         INTEGER NOT NULL,
  operacao        TEXT NOT NULL DEFAULT 'emissao',
  idempotency_key TEXT NOT NULL UNIQUE,
  numero          INTEGER NOT NULL,
  serie           TEXT NOT NULL,
  lote            TEXT,
  status          TEXT NOT NULL CHECK (status IN ('processando','incerto','autorizado','rejeitado','falha_local')),
  cstat           TEXT,
  motivo          TEXT,
  chave           TEXT,
  protocolo       TEXT,
  xml_envio       TEXT,
  xml_retorno     TEXT,
  erro_local      TEXT,
  solicitado_por INTEGER,
  createdat       TEXT NOT NULL,
  updatedat       TEXT NOT NULL,
  concluido_em    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfe_emissao_tentativa_ativa
  ON nfe_emissao_tentativas(ordemid, operacao)
  WHERE status IN ('processando','incerto');
CREATE INDEX IF NOT EXISTS idx_nfe_emissao_tentativas_ordem
  ON nfe_emissao_tentativas(ordemid, createdat DESC);

CREATE TABLE IF NOT EXISTS nfe_emissao_transicoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tentativaid INTEGER NOT NULL,
  ordemid     INTEGER NOT NULL,
  status      TEXT NOT NULL,
  cstat       TEXT,
  motivo      TEXT,
  createdat   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nfe_emissao_transicoes_tentativa
  ON nfe_emissao_transicoes(tentativaid, id);
```

- [ ] **Step 4: Implementar o repositório**

Criar `createNfeAttemptRepository(db, deps)` com:

```js
function createNfeAttemptRepository(db, deps = {}) {
  const agora = deps.agora || (() => new Date().toISOString());

  function serviceError(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
  }

  function buscarPorId(id) {
    return db.prepare('SELECT * FROM nfe_emissao_tentativas WHERE id=?').get(id) || null;
  }

  function registrarTransicao(row, status, dados = {}) {
    db.prepare(`
      INSERT INTO nfe_emissao_transicoes (tentativaid, ordemid, status, cstat, motivo, createdat)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.id, row.ordemid, status, dados.cStat || null, dados.motivo || null, agora());
  }

  const reservarTx = db.transaction(({ ordemId, serie, usuarioId }) => {
    const ativa = db.prepare(`
      SELECT * FROM nfe_emissao_tentativas
      WHERE ordemid=? AND operacao='emissao' AND status IN ('processando','incerto')
      LIMIT 1
    `).get(ordemId);
    if (ativa) throw serviceError(409, 'nfe_tentativa_ativa', 'Existe uma emissao em processamento ou incerta para esta OS.');

    const seq = db.prepare('SELECT ultimo_numero FROM nfe_sequencias WHERE serie=?').get(String(serie));
    const numero = Number(seq?.ultimo_numero || 0) + 1;
    db.prepare(`
      INSERT INTO nfe_sequencias (serie, ultimo_numero) VALUES (?, ?)
      ON CONFLICT(serie) DO UPDATE SET ultimo_numero=excluded.ultimo_numero
    `).run(String(serie), numero);

    const createdat = agora();
    const key = `emissao:${ordemId}:${serie}:${numero}`;
    const result = db.prepare(`
      INSERT INTO nfe_emissao_tentativas
        (ordemid, operacao, idempotency_key, numero, serie, lote, status,
         solicitado_por, createdat, updatedat)
      VALUES (?, 'emissao', ?, ?, ?, ?, 'processando', ?, ?, ?)
    `).run(ordemId, key, numero, String(serie), String(numero).padStart(9, '0'), usuarioId || null, createdat, createdat);
    const row = buscarPorId(result.lastInsertRowid);
    registrarTransicao(row, 'processando');
    return row;
  });

  function reservar(input) {
    return reservarTx(input);
  }

  const transicionarTx = db.transaction((id, status, dados = {}) => {
    const atual = buscarPorId(id);
    if (!atual) throw serviceError(404, 'nfe_tentativa_nao_encontrada', 'Tentativa fiscal nao encontrada.');
    if (atual.status === 'autorizado' && status !== 'autorizado') {
      throw serviceError(409, 'nfe_transicao_invalida', 'Autorizacao fiscal nao pode regredir.');
    }
    if (['rejeitado', 'falha_local'].includes(atual.status) && atual.status !== status) {
      throw serviceError(409, 'nfe_transicao_invalida', 'Tentativa fiscal ja concluida.');
    }
    const concluido = ['autorizado', 'rejeitado', 'falha_local'].includes(status) ? agora() : null;
    db.prepare(`
      UPDATE nfe_emissao_tentativas
      SET status=?, cstat=?, motivo=?, chave=?, protocolo=?, xml_envio=?, xml_retorno=?,
          erro_local=?, updatedat=?, concluido_em=COALESCE(?, concluido_em)
      WHERE id=?
    `).run(
      status, dados.cStat || null, dados.motivo || null, dados.chave || null,
      dados.protocolo || null, dados.xmlEnvio || null, dados.xmlRetorno || null,
      dados.erroLocal || null, agora(), concluido, id
    );
    const row = buscarPorId(id);
    registrarTransicao(row, status, dados);
    return row;
  });

  function transicionar(id, status, dados) {
    return transicionarTx(id, status, dados);
  }

  const devolverTx = db.transaction((id) => {
    const row = buscarPorId(id);
    if (!row || !['rejeitado', 'falha_local'].includes(row.status)) return false;
    const result = db.prepare(`
      UPDATE nfe_sequencias SET ultimo_numero=?
      WHERE serie=? AND ultimo_numero=?
    `).run(row.numero - 1, row.serie, row.numero);
    return result.changes > 0;
  });

  return { reservar, buscarPorId, transicionar, devolverNumero: devolverTx };
}
```

Uma falha local pré-transmissão deve ser transicionada para `falha_local` antes
de chamar `devolverNumero`. Uma rejeição da allowlist permanece `rejeitado`;
devolver a sequência não reclassifica o fato fiscal.

- [ ] **Step 5: Executar testes do repositório**

Run:

```powershell
npm.cmd test -- nfeAttemptRepository.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/database.js backend/repositories/nfeAttemptRepository.js backend/__tests__/nfeAttemptRepository.test.js
git commit -m "feat: persistir tentativas de emissao nfe"
```

## Task 3: Persistência fiscal obrigatória e atômica

**Files:**
- Create: `backend/services/nfePersistenceService.js`
- Create: `backend/__tests__/nfePersistenceService.test.js`

- [ ] **Step 1: Escrever testes vermelhos de commit e rollback**

Testar banco in-memory real:

```js
it('persiste OS, tentativa, cliente e evento na mesma transacao', () => {
  const service = createNfePersistenceService({ db, attemptRepository: repo, agora: () => NOW });
  const result = service.autorizar({
    tentativaId,
    ordemId: 7,
    numero: 281,
    serie: '1',
    chave: CHAVE,
    protocolo: '135260000000001',
    recebidoEm: NOW,
    cStat: '100',
    xml: XML_VALIDO,
    cliente: { clienteid: 4, cpf: '07500718000196', logradouro: 'Rua A' },
  });

  expect(result.status).toBe('autorizado');
  expect(db.prepare('SELECT nfe_status,nfe_xml FROM ordens WHERE id=7').get())
    .toMatchObject({ nfe_status: 'autorizado', nfe_xml: XML_VALIDO });
  expect(db.prepare("SELECT tipo FROM nfe_eventos WHERE ordemid=7").get().tipo).toBe('autorizacao');
  expect(repo.buscarPorId(tentativaId).status).toBe('autorizado');
});

it('reverte tudo quando o evento obrigatorio falha', () => {
  db.exec('DROP TABLE nfe_eventos');
  const service = createNfePersistenceService({ db, attemptRepository: repo, agora: () => NOW });

  expect(() => service.autorizar(PAYLOAD)).toThrow();
  expect(db.prepare('SELECT nfe_status FROM ordens WHERE id=7').get().nfe_status).not.toBe('autorizado');
  expect(repo.buscarPorId(tentativaId).status).toBe('processando');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
npm.cmd test -- nfePersistenceService.test.js
```

Expected: FAIL porque o serviço ainda não existe.

- [ ] **Step 3: Implementar o serviço transacional**

Criar:

```js
function createNfePersistenceService({ db, attemptRepository, agora = () => new Date().toISOString() }) {
  const autorizarTx = db.transaction((input) => {
    const tentativa = attemptRepository.buscarPorId(input.tentativaId);
    if (!tentativa || tentativa.ordemid !== Number(input.ordemId)) {
      const error = new Error('Tentativa fiscal nao corresponde a OS.');
      error.code = 'nfe_tentativa_invalida';
      throw error;
    }

    db.prepare(`
      UPDATE ordens SET
        nfe_status='autorizado', nfe_numero=?, nfe_serie=?, nfe_chave=?,
        nfe_protocolo=?, nfe_emitida_em=?, nfe_xml=?,
        nfe_cancelado_em=NULL, nfe_cancel_protocolo=NULL, nfe_cancel_motivo=NULL,
        nfe_deletedat=NULL, nfe_deletedpor=NULL, nfe_deletedreason=NULL
      WHERE id=?
    `).run(
      String(input.numero).padStart(9, '0'), input.serie, input.chave,
      input.protocolo, input.recebidoEm, input.xml, input.ordemId
    );

    if (input.cliente?.clienteid) {
      db.prepare(`
        UPDATE clientes SET cpf=?, ie=?, logradouro=?, numero=?, bairro=?, cidade=?, uf=?, cep=?
        WHERE id=? AND deletedat IS NULL
      `).run(
        input.cliente.cpf || null, input.cliente.ie || null,
        input.cliente.logradouro || null, input.cliente.c_numero || null,
        input.cliente.bairro || null, input.cliente.cidade || null,
        input.cliente.uf || null, input.cliente.cep || null,
        input.cliente.clienteid
      );
    }

    db.prepare(`
      INSERT INTO nfe_eventos
        (ordemid, chave, tipo, nseqevento, protocolo, cstat, motivo, xml, createdat)
      VALUES (?, ?, 'autorizacao', 1, ?, ?, 'NF-e autorizada', ?, ?)
    `).run(input.ordemId, input.chave, input.protocolo, input.cStat, input.xml, input.recebidoEm || agora());

    return attemptRepository.transicionar(input.tentativaId, 'autorizado', {
      cStat: input.cStat,
      motivo: 'NF-e autorizada',
      chave: input.chave,
      protocolo: input.protocolo,
      xmlRetorno: input.xml,
    });
  });

  function autorizar(input) {
    return autorizarTx(input);
  }

  return { autorizar };
}
```

O repositório deverá expor uma variante interna de `transicionar` que participe
da transação já aberta, evitando commits parciais ou transações aninhadas.

- [ ] **Step 4: Executar testes e confirmar GREEN**

Run:

```powershell
npm.cmd test -- nfePersistenceService.test.js nfeAttemptRepository.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/services/nfePersistenceService.js backend/repositories/nfeAttemptRepository.js backend/__tests__/nfePersistenceService.test.js backend/__tests__/nfeAttemptRepository.test.js
git commit -m "feat: tornar persistencia de autorizacao nfe atomica"
```

## Task 4: Orquestrar emissão segura e integrar a rota

**Files:**
- Create: `backend/services/nfeEmissaoService.js`
- Create: `backend/__tests__/nfeEmissaoService.test.js`
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Escrever testes vermelhos do serviço**

Criar dependências falsas para `transmitir`, `extrairResposta`, `salvarXmlDisco`
e um banco real. Cobrir:

```js
it('marca timeout como incerto e bloqueia segunda emissao', async () => {
  let resolver;
  transmitir.mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
  const primeira = service.emitir(INPUT);

  await vi.advanceTimersByTimeAsync(30_001);
  await expect(primeira).resolves.toMatchObject({ httpStatus: 409, status: 'incerto' });
  await expect(service.emitir(INPUT)).rejects.toMatchObject({ status: 409, code: 'nfe_tentativa_ativa' });

  resolver(RESP_AUTORIZADA);
  await vi.runAllTimersAsync();
  expect(db.prepare('SELECT status FROM nfe_emissao_tentativas ORDER BY id DESC LIMIT 1').get().status)
    .toBe('autorizado');
});

it('nao autoriza quando o retorno nao contem XML legal', async () => {
  transmitir.mockResolvedValue({ ...RESP_AUTORIZADA, xml: { cStat: '100' } });
  const result = await service.emitir(INPUT);
  expect(result).toMatchObject({ httpStatus: 409, status: 'incerto' });
  expect(db.prepare('SELECT nfe_status FROM ordens WHERE id=7').get().nfe_status).not.toBe('autorizado');
});

it('devolve numero apenas para rejeicao da allowlist', async () => {
  transmitir.mockResolvedValue({ cStat: '386', motivo: 'CFOP invalido' });
  const result = await service.emitir(INPUT);
  expect(result.status).toBe('rejeitado');
  expect(db.prepare("SELECT ultimo_numero FROM nfe_sequencias WHERE serie='1'").get().ultimo_numero).toBe(280);
});

it('preserva autorizacao no banco quando arquivo em disco falha', async () => {
  salvarXmlDisco.mockRejectedValue(new Error('Disco indisponivel'));
  const result = await service.emitir(INPUT);
  expect(result.status).toBe('autorizado');
  expect(result.alertas).toContain('XML autorizado salvo no banco, mas houve falha ao gravar arquivo em disco.');
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
npm.cmd test -- nfeEmissaoService.test.js
```

Expected: FAIL porque o serviço ainda não existe.

- [ ] **Step 3: Implementar orquestrador com timeout que não cancela a persistência tardia**

Estrutura:

```js
function createNfeEmissaoService(deps) {
  const {
    attemptRepository,
    persistenceService,
    transmitir,
    montarPayload,
    extrairResposta,
    salvarXmlDisco,
    timeoutMs = 180000,
  } = deps;

  function timeoutResult() {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
    });
  }

  async function concluirRespostaTardia(tentativa, promiseSefaz, contexto) {
    try {
      const raw = await promiseSefaz;
      return await processarResposta(tentativa, raw, contexto);
    } catch (error) {
      return processarErro(tentativa, error);
    }
  }

  async function emitir(input) {
    const tentativa = attemptRepository.reservar({
      ordemId: input.ordem.id,
      serie: input.serie,
      usuarioId: input.usuarioId,
    });
    const payload = montarPayload({ ...input, numero: tentativa.numero });
    const promiseSefaz = Promise.resolve().then(() => transmitir(payload, tentativa));
    const latePromise = concluirRespostaTardia(tentativa, promiseSefaz, { ...input, payload });
    const primeiro = await Promise.race([
      latePromise.then((value) => ({ kind: 'result', value })),
      timeoutResult(),
    ]);

    if (primeiro.kind === 'timeout') {
      attemptRepository.transicionar(tentativa.id, 'incerto', {
        motivo: 'Tempo limite local aguardando resposta da SEFAZ.',
      });
      latePromise.catch((error) => console.error('[NF-e] Falha ao concluir resposta tardia:', error.message));
      return {
        httpStatus: 409,
        status: 'incerto',
        erro: 'A resposta da SEFAZ ficou incerta. Consulte a nota antes de reenviar.',
      };
    }
    return primeiro.value;
  }

  async function processarResposta(tentativa, raw, contexto) {
    const resposta = extrairResposta(raw);
    const classificacao = classificarResultadoEmissao(resposta);
    if (classificacao.status === 'autorizado') {
      const xml = validarXmlAutorizacao(resposta.xml, resposta.chave);
      if (!xml.ok) {
        attemptRepository.transicionar(tentativa.id, 'incerto', {
          cStat: resposta.cStat,
          motivo: xml.erro,
          chave: resposta.chave,
          protocolo: resposta.protocolo,
        });
        return { httpStatus: 409, status: 'incerto', erro: xml.erro };
      }
      const final = persistenceService.autorizar({
        tentativaId: tentativa.id,
        ordemId: contexto.ordem.id,
        numero: tentativa.numero,
        serie: tentativa.serie,
        chave: resposta.chave,
        protocolo: resposta.protocolo,
        recebidoEm: resposta.recebidoEm,
        cStat: resposta.cStat,
        xml: xml.xml,
        cliente: contexto.cliente,
      });
      const alertas = [];
      try {
        await salvarXmlDisco(`${resposta.chave}.xml`, xml.xml);
      } catch (error) {
        alertas.push('XML autorizado salvo no banco, mas houve falha ao gravar arquivo em disco.');
      }
      return { httpStatus: 200, status: final.status, alertas, chave: resposta.chave };
    }
    if (classificacao.status === 'rejeitado') {
      attemptRepository.transicionar(tentativa.id, 'rejeitado', {
        cStat: resposta.cStat,
        motivo: resposta.motivo,
        xmlRetorno: resposta.xml || null,
      });
      if (rejeicaoPermiteDevolverNumero(resposta.cStat)) {
        attemptRepository.devolverNumero(tentativa.id);
      }
      return { httpStatus: 422, status: 'rejeitado', erro: resposta.motivo };
    }
    attemptRepository.transicionar(tentativa.id, 'incerto', {
      cStat: resposta.cStat,
      motivo: resposta.motivo || 'Resposta fiscal inconclusiva.',
      xmlRetorno: typeof resposta.xml === 'string' ? resposta.xml : null,
    });
    return { httpStatus: 409, status: 'incerto', erro: 'Resposta fiscal inconclusiva. Consulte antes de reenviar.' };
  }

  return { emitir };
}
```

`processarErro` deverá classificar apenas validação local comprovadamente
pré-transmissão como `falha_local`; erros de comunicação, endpoint, timeout,
retorno vazio ou exceção após a chamada tornam a tentativa `incerto`.

- [ ] **Step 4: Executar testes do serviço**

Run:

```powershell
npm.cmd test -- nfeEmissaoService.test.js nfePersistenceService.test.js nfeAttemptRepository.test.js
```

Expected: PASS.

- [ ] **Step 5: Integrar `POST /emitir/:id`**

Em `backend/routes/nfe.js`:

- manter validações de certificado, OS, itens, cliente e emitente antes da
  criação da tentativa;
- remover o `guardTimeout` da rota; o serviço é o único dono do timeout;
- remover `serializarXmlFiscal()` com fallback JSON;
- remover o mutex baseado exclusivamente em `ordens.nfe_status='emitindo'`;
- criar as dependências do serviço a partir de `getDB()`, `getNFEWizard()`,
  `callSEFAZ()`, `montarNFe()`, `extrairXmlFiscal()` e `salvarXmlDisco()`;
- responder com `res.status(result.httpStatus).json(result)`;
- não retornar `detalhe: e.message`;
- manter `nfe_status='incerto'` na OS somente como projeção visível quando a
  tentativa ficar incerta, sem usá-lo como lock principal.

Adaptador esperado:

```js
const result = await service.emitir({
  ordem: os,
  itens: itensComOverrides.itens,
  cliente: clienteComOverrides.cliente,
  emitente,
  serie: getSerieNFe(),
  ambiente: tpAmbAtual(),
  usuarioId: req.user.id,
});
return res.status(result.httpStatus).json(result);
```

O timeout lógico pertence ao serviço, registra a tentativa antes de responder
e mantém a continuação da mesma Promise para processar eventual resposta tardia.

- [ ] **Step 6: Atualizar contratos estruturais**

Substituir assertions que exigem as funções inseguras locais por:

```js
expect(source).toMatch(/createNfeEmissaoService/);
expect(source).not.toMatch(/JSON\.stringify\(resultado,\s*null,\s*2\)/);
expect(source).not.toMatch(/nfe_status='rejeitado'.+nfe_status='emitindo'/s);
expect(source).not.toMatch(/detalhe:\s*e\.message/);
```

- [ ] **Step 7: Rodar testes focados**

Run:

```powershell
npm.cmd test -- nfeEmissaoService.test.js nfePersistenceService.test.js nfeAttemptRepository.test.js nfeEmissionRules.test.js routeContracts.test.js nfeCommunication.test.js nfe.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add backend/services/nfeEmissaoService.js backend/__tests__/nfeEmissaoService.test.js backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "fix: tornar emissao nfe idempotente e auditavel"
```

## Task 5: Proteger edição de caixa com saldo projetado

**Files:**
- Create: `backend/domain/ordemPagamentoRules.js`
- Create: `backend/services/caixaLancamentoService.js`
- Create: `backend/__tests__/ordemPagamentoRules.test.js`
- Create: `backend/__tests__/caixaLancamentoService.test.js`
- Modify: `backend/routes/caixa.js`

- [ ] **Step 1: Escrever testes vermelhos das regras puras**

```js
it('identifica as duas OS afetadas quando o vinculo muda', () => {
  expect(ordensAfetadas({ ordemid: 1 }, { ordemid: 2 })).toEqual([1, 2]);
});

it('calcula contribuicao somente para pago e nao excluido', () => {
  expect(contribuicaoRecebida({ valor: 50, pago: 1, deletedat: null })).toBe(5000);
  expect(contribuicaoRecebida({ valor: 50, pago: 0, deletedat: null })).toBe(0);
  expect(contribuicaoRecebida({ valor: -10.125, pago: 1, deletedat: null })).toBe(-1013);
});

it('projeta saldo em centavos removendo antigo e adicionando novo', () => {
  expect(projetarSaldoCentavos({
    total: 10000,
    recebidoAtual: 10000,
    antigo: { valor: 100, pago: 1, ordemid: 1 },
    novo: { valor: 60, pago: 1, ordemid: 1 },
    ordemId: 1,
  })).toBe(4000);
});
```

- [ ] **Step 2: Executar e confirmar RED**

Run:

```powershell
npm.cmd test -- ordemPagamentoRules.test.js
```

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar regras em centavos**

```js
function centavos(value) {
  return Math.round((Number(value) || 0) * 100);
}

function contribuicaoRecebida(lancamento) {
  if (!lancamento || !lancamento.ordemid || Number(lancamento.pago) !== 1 || lancamento.deletedat) return 0;
  return centavos(lancamento.valor);
}

function ordensAfetadas(antigo, novo) {
  return [...new Set([antigo?.ordemid, novo?.ordemid].filter(Boolean).map(Number))].sort((a, b) => a - b);
}

function projetarSaldoCentavos({ total, recebidoAtual, antigo, novo, ordemId }) {
  let recebido = centavos(recebidoAtual);
  if (Number(antigo?.ordemid) === Number(ordemId)) recebido -= contribuicaoRecebida(antigo);
  if (Number(novo?.ordemid) === Number(ordemId)) recebido += contribuicaoRecebida(novo);
  return Math.max(0, centavos(total) - recebido);
}
```

- [ ] **Step 4: Confirmar GREEN unitário**

Run:

```powershell
npm.cmd test -- ordemPagamentoRules.test.js
```

Expected: PASS.

- [ ] **Step 5: Escrever testes vermelhos do serviço transacional**

Testar:

```js
it.each([
  [{ valor: 60, pago: 1, ordemid: 1 }, 'reduzir'],
  [{ valor: 100, pago: 0, ordemid: 1 }, 'marcar nao pago'],
  [{ valor: 100, pago: 1, ordemid: null }, 'desvincular'],
  [{ valor: 100, pago: 1, ordemid: 2 }, 'trocar OS'],
])('bloqueia %s quando reabre saldo da OS entregue', (patch) => {
  expect(() => service.editar(10, patch, { id: 3, role: 'admin' }))
    .toThrowError(expect.objectContaining({ status: 409, code: 'os_entregue_saldo_aberto' }));
  expect(db.prepare('SELECT valor,pago,ordemid FROM lancamentos WHERE id=10').get())
    .toMatchObject({ valor: 100, pago: 1, ordemid: 1 });
});

it('permite ajuste que mantem OS entregue quitada', () => {
  db.prepare("INSERT INTO lancamentos (id,data,tipo,descricao,pagamento,valor,pago,ordemid) VALUES (11,'2026-06-20','Entrada','extra','Pix',40,1,1)").run();
  expect(service.editar(10, { valor: 60, pago: 1, ordemid: 1 }, USER)).toMatchObject({ ok: true });
});

it('permite alterar saldo de OS nao entregue', () => {
  db.prepare("UPDATE ordens SET status='Pronto' WHERE id=1").run();
  expect(service.editar(10, { valor: 60, pago: 1, ordemid: 1 }, USER)).toMatchObject({ ok: true });
});
```

- [ ] **Step 6: Implementar `caixaLancamentoService`**

Criar serviço com `db.transaction()`:

```js
function createCaixaLancamentoService({ db }) {
  const editarTx = db.transaction((id, patch, user) => {
    const antigo = db.prepare('SELECT * FROM lancamentos WHERE id=? AND deletedat IS NULL').get(id);
    if (!antigo) throw serviceError(404, 'lancamento_nao_encontrado', 'Lancamento nao encontrado.');
    if (antigo.origem === 'entradaos' && user.role !== 'admin') {
      throw serviceError(400, 'entrada_os_protegida', 'A entrada vinculada a OS deve ser alterada pela propria OS.');
    }
    if (antigo.origem === 'entradaos') {
      db.prepare('UPDATE lancamentos SET data=COALESCE(?,data), pagamento=COALESCE(?,pagamento) WHERE id=?')
        .run(patch.data || null, patch.pagamento || null, id);
      return { ok: true };
    }

    const novo = {
      ...antigo,
      data: patch.data,
      tipo: patch.ordemid ? 'Entrada' : (patch.tipo || 'Diversos'),
      categoria: patch.categoria || null,
      descricao: patch.descricao,
      pagamento: patch.pagamento,
      valor: Number(patch.valor) || 0,
      pago: patch.ordemid ? 1 : (patch.pago ? 1 : 0),
      ordemid: patch.ordemid || null,
      origem: patch.ordemid ? 'saldoos' : 'manual',
    };

    for (const ordemId of ordensAfetadas(antigo, novo)) {
      const ordem = db.prepare('SELECT id,status,valortotal FROM ordens WHERE id=? AND deletedat IS NULL').get(ordemId);
      if (!ordem) throw serviceError(404, 'os_nao_encontrada', 'OS vinculada nao encontrada.');
      const recebido = db.prepare(`
        SELECT COALESCE(SUM(valor),0) total
        FROM lancamentos WHERE ordemid=? AND pago=1 AND deletedat IS NULL
      `).get(ordemId).total;
      const saldo = projetarSaldoCentavos({
        total: ordem.valortotal,
        recebidoAtual: recebido,
        antigo,
        novo,
        ordemId,
      });
      if (ordem.status === 'Entregue' && saldo > 0) {
        throw serviceError(409, 'os_entregue_saldo_aberto', 'Nao e possivel deixar uma OS entregue com saldo em aberto.');
      }
    }

    db.prepare(`
      UPDATE lancamentos
      SET data=?,tipo=?,categoria=?,descricao=?,pagamento=?,valor=?,pago=?,ordemid=?,origem=?
      WHERE id=?
    `).run(
      novo.data, novo.tipo, novo.categoria, novo.descricao, novo.pagamento,
      novo.valor, novo.pago, novo.ordemid, novo.origem, id
    );
    return { ok: true };
  });

  return { editar: editarTx };
}
```

Antes do update, preservar as validações existentes de valor máximo e descrição
de pagamento da OS usando o mesmo snapshot transacional.

- [ ] **Step 7: Executar testes de regras e serviço**

Run:

```powershell
npm.cmd test -- ordemPagamentoRules.test.js caixaLancamentoService.test.js
```

Expected: PASS.

- [ ] **Step 8: Integrar `PUT /api/caixa/:id`**

Substituir a lógica inline por:

```js
router.put('/:id', auth(['admin', 'caixa']), (req, res, next) => {
  try {
    const service = createCaixaLancamentoService({ db: getDB() });
    res.json(service.editar(req.params.id, req.body ?? {}, req.user));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, code: error.code });
    next(error);
  }
});
```

Importar `getDB` e `createCaixaLancamentoService`. Não alterar POST, DELETE ou
o fluxo intencional de resolução de cliente.

- [ ] **Step 9: Rodar testes focados**

Run:

```powershell
npm.cmd test -- ordemPagamentoRules.test.js caixaLancamentoService.test.js caixaRules.test.js financeiroRules.test.js routeContracts.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add backend/domain/ordemPagamentoRules.js backend/services/caixaLancamentoService.js backend/routes/caixa.js backend/__tests__/ordemPagamentoRules.test.js backend/__tests__/caixaLancamentoService.test.js backend/__tests__/routeContracts.test.js
git commit -m "fix: preservar quitacao de os entregue ao editar caixa"
```

## Task 6: Verificação termonuclear e documentação operacional

**Files:**
- Modify if needed: `backend/ARCHITECTURE.md`
- Modify if needed: `docs/auditoria-termonuclear-2026-06-19.md`

- [ ] **Step 1: Rodar suíte completa do backend**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: todos os arquivos e testes passam, incluindo os novos cenários.

- [ ] **Step 2: Rodar frontend**

Run:

```powershell
cd ..\frontend
npm.cmd test
npm.cmd run build
```

Expected: testes e build passam.

- [ ] **Step 3: Rodar WhatsApp**

Run:

```powershell
cd ..\whatsapp-service
npm.cmd test
```

Expected: testes passam.

- [ ] **Step 4: Auditar dependências de runtime**

Run em raiz, backend, frontend e `whatsapp-service`:

```powershell
npm.cmd audit --omit=dev
```

Expected: raiz/backend/frontend sem vulnerabilidades; registrar separadamente
qualquer vulnerabilidade transitiva ainda existente no WhatsApp, sem misturá-la
ao resultado funcional da Fase 0.

- [ ] **Step 5: Revisar invariantes diretamente**

Run:

```powershell
rg -n "nfe_status='rejeitado'.*emitindo|JSON\.stringify\(resultado|rejeicaoPermiteDevolverNumeroNFe|detalhe:\s*e\.message" backend/routes/nfe.js
rg -n "nfe_emissao_tentativas|nfe_emissao_transicoes|idx_nfe_emissao_tentativa_ativa" backend/database.js
rg -n "os_entregue_saldo_aberto|createCaixaLancamentoService" backend/routes/caixa.js backend/services/caixaLancamentoService.js
```

Expected: nenhuma ocorrência dos padrões fiscais inseguros; schema e proteção
financeira presentes.

- [ ] **Step 6: Atualizar documentação somente se o contrato mudou**

Documentar:

- `incerto` bloqueia reemissão;
- consulta/reconciliação é obrigatória antes de nova tentativa;
- `PUT /api/caixa/:id` retorna `409` quando abriria saldo de OS entregue;
- XML em banco é fonte de verdade e arquivo é projeção recuperável.

Não editar documentação sem mudança concreta de contrato.

- [ ] **Step 7: Revisão final de diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: sem erros de whitespace, sem banco/XML/certificado/sessão adicionados
e sem alterações fora do escopo.

- [ ] **Step 8: Commit final de documentação, se houver**

```powershell
git add backend/ARCHITECTURE.md docs/auditoria-termonuclear-2026-06-19.md
git commit -m "docs: registrar protecoes fiscais e financeiras da fase 0"
```

Pular este commit se nenhum arquivo documental precisar mudar.
