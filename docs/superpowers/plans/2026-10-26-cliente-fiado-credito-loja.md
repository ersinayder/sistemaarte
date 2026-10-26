# Cliente: Fiado e Crédito Loja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar gestão estruturada de Fiado (contas em aberto para clientes autorizados, entrega de OS em débito com limite, cobrança via WhatsApp e acerto agrupado) e Crédito Loja (extrato auditável de haver do cliente, absorção de excedentes de OS alterada/cancelada, uso como pagamento e devolução em dinheiro), preservando a integridade contábil do sistema em produção.

**Architecture:** 
- Adição de schema relacional aditivo (`cliente_credito_movimentos`, `cliente_acertos`, colunas de fiado em `clientes` e `lancamentos`, `chave_pix` em `empresa_config`) e migração de permissões idempotente.
- Regras de domínio isoladas para pagamentos (`CreditoLoja`), cálculo e invariante de crédito (`clienteCreditoRules`), validação de entrega de OS em fiado (`clienteFiadoRules`) e resolução de excedentes.
- Serviços transacionais atômicos (`clienteCreditoService`, `clienteAcertoService`) garantindo que movimentações financeiras reflitam com precisão no caixa/gaveta e no DRE gerencial, sem duplicar receita.
- Telas operacionais densas no frontend React (`Clientes.jsx`, modais de excedente e uso de crédito em `OrdemDetalhe.jsx` e `Ordens.jsx`, chave Pix em `Configuracoes.jsx`).

**Tech Stack:** Node.js 22, Express 4, CommonJS, SQLite 3 (`better-sqlite3`), Vitest 4.1, React 18, Vite 8, Lucide React.

**Spec:** `docs/superpowers/specs/2026-10-26-cliente-fiado-credito-loja-design.md`

## Global Constraints

- Nunca alterar ou reimplementar a fórmula de `getResumoFinanceiroOS()` em `backend/domain/financeiroRules.js`.
- Status de OS devem manter acentuação correta: `'Aguardando'`, `'Em Produção'`, `'Pronto'`, `'Entregue'`, `'Cancelado'`.
- Banco de dados em produção roda SQLite em modo WAL com PM2 em fork (1 instância): toda operação composta deve rodar dentro de `transaction()`.
- Migrações são estritamente aditivas (`ALTER TABLE ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`). Nenhuma tabela ou coluna existente pode ser dropada ou renomeada.
- Emissão de NF-e para OS em fiado não é bloqueada (autonomia operacional da loja mantida).
- Vales de papel antigos (saldo inicial) entram no extrato de crédito sem gerar lançamento financeiro negativo para não distorcer a receita do mês no DRE.
- Documentos de impressão são servidos como HTML operacional pelo backend (`sendPrintHtml`). Nunca gerar PDF binário.
- Envio de WhatsApp utiliza a política de envio manual assistido (`wa.me` / `whatsapp://send`), sem serviço Baileys em segundo plano.

## Review Focus

1. **Tentativa de entrega de OS com saldo por usuário sem permissão ou cliente sem fiado ativo:** deve retornar 400 com código `FIADO_NAO_PERMITIDO` e bloquear a transição de status.
2. **Edição ou cancelamento de OS reduzindo valor abaixo do recebido:** deve interceptar com status HTTP 409 e código `EXCEDENTE_PAGAMENTO`, exigindo destinação explícita (`credito` ou `devolver`).
3. **Uso de crédito superior ao saldo do cliente ou concorrência simultânea:** deve validar saldo dentro da transação atômica e impedir saldo negativo sob qualquer hipótese.
4. **Fechamento de caixa e gaveta de dinheiro:** pagamentos em `CreditoLoja` não podem somar no saldo em espécie/gaveta; devoluções em dinheiro (`credito_devolvido`) devem subtrair da gaveta.
5. **DRE e relatórios gerenciais:** lançamentos de devolução de crédito em dinheiro (`credito_devolvido`) não podem abater a receita bruta nem duplicar deduções, pois o crédito gerado já reduziu a receita na origem.

---

### Task 1: Migrações de Banco de Dados e Backfill de Permissões

**Files:**
- Modify: `backend/database.js:764-1145`
- Modify: `backend/domain/permissionRules.js:15-120`
- Test: `backend/__tests__/databaseMigrationsFiadoCredito.test.js`

**Interfaces:**
- Produces: colunas `fiado_ativo`, `fiado_limite` em `clientes`; `clienteid`, `acerto_id` em `lancamentos`; `chave_pix` em `empresa_config`.
- Produces: tabelas `cliente_credito_movimentos` e `cliente_acertos`.
- Produces: permissões `clientes.fiado.gerenciar`, `clientes.credito.ver`, `clientes.credito.usar`, `clientes.credito.ajustar`, `clientes.credito.devolver`, `clientes.acerto.receber`, `ordens.entregar_fiado`, `ordens.entregar_acima_limite`.

- [ ] **Step 1: Escrever teste de migrações e permissões**

Criar arquivo `backend/__tests__/databaseMigrationsFiadoCredito.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyMigrations, seedPermissionProfiles } from '../database.js';
import { ALL_PERMISSIONS, DEFAULT_PROFILE_PERMISSIONS } from '../domain/permissionRules.js';

describe('Migrações de Fiado e Crédito Loja', () => {
  it('aplica novas colunas e tabelas sem erro e garante idempotência', () => {
    const db = new Database(':memory:');
    // setup base schema
    // apply migrations
    // assert tables and columns exist
  });

  it('faz backfill das permissões novas para admin e caixa sem duplicar', () => {
    // assert profile_permissions contains new keys for admin and caixa
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/databaseMigrationsFiadoCredito.test.js`
Expected: FAIL (novas colunas e tabelas não existem na lista de migrations).

- [ ] **Step 3: Implementar definições de schema e permissões**

1. Em `backend/domain/permissionRules.js`:
   Adicionar novas permissões a `ALL_PERMISSIONS` e mapear para perfis padrão em `DEFAULT_PROFILE_PERMISSIONS`:
   - `admin`: todas as 8 novas permissões.
   - `caixa`: `clientes.credito.ver`, `clientes.credito.usar`, `clientes.acerto.receber`, `ordens.entregar_fiado`.
2. Em `backend/database.js`:
   - Adicionar migrações aditivas no array `migrations`:
     - `"ALTER TABLE clientes ADD COLUMN fiado_ativo INTEGER DEFAULT 0"`
     - `"ALTER TABLE clientes ADD COLUMN fiado_limite REAL DEFAULT NULL"`
     - `"ALTER TABLE lancamentos ADD COLUMN clienteid INTEGER DEFAULT NULL"`
     - `"ALTER TABLE lancamentos ADD COLUMN acerto_id INTEGER DEFAULT NULL"`
     - `"ALTER TABLE empresa_config ADD COLUMN chave_pix TEXT DEFAULT NULL"`
     - `CREATE TABLE IF NOT EXISTS cliente_credito_movimentos (...)`
     - `CREATE TABLE IF NOT EXISTS cliente_acertos (...)`
     - Índices em `cliente_credito_movimentos(clienteid)` e `lancamentos(acerto_id)`.
   - Adicionar rotina de backfill idempotente em `seedPermissionProfiles()` para inserir novas permissões em `profile_permissions` para perfis `admin` e `caixa`.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/databaseMigrationsFiadoCredito.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/database.js backend/domain/permissionRules.js backend/__tests__/databaseMigrationsFiadoCredito.test.js
git commit -m "feat(db): adicionar schema e permissoes de fiado e credito loja"
```

---

### Task 2: Domínio de Pagamento e Mapeamento Fiscal NF-e

**Files:**
- Modify: `backend/domain/pagamentosRules.js:1-84`
- Modify: `backend/domain/nfeRules.js:15-35`
- Test: `backend/__tests__/pagamentosCreditoLoja.test.js`

**Interfaces:**
- Consumes: `PAGAMENTOS_CANONICOS`, `normalizarPagamento`, `labelPagamento`
- Produces: suporte a `CreditoLoja`, label `'Crédito Loja'`, sem colisão com `'Credito'` (cartão).
- Produces: `mapTpPag('CreditoLoja') === '05'`, suporte a chaves canônicas no mapeamento fiscal da NF-e.

- [ ] **Step 1: Escrever teste de normalização de pagamentos e mapeamento fiscal**

Criar arquivo `backend/__tests__/pagamentosCreditoLoja.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { normalizarPagamento, labelPagamento } from '../domain/pagamentosRules.js';
import { mapTpPag } from '../domain/nfeRules.js';

describe('Forma de Pagamento CreditoLoja', () => {
  it('diferencia Credito (cartao) de CreditoLoja (haver)', () => {
    expect(normalizarPagamento('credito')).toBe('Credito');
    expect(normalizarPagamento('cartao de credito')).toBe('Credito');
    expect(normalizarPagamento('creditoloja')).toBe('CreditoLoja');
    expect(normalizarPagamento('crédito loja')).toBe('CreditoLoja');
    expect(normalizarPagamento('haver')).toBe('CreditoLoja');
    expect(normalizarPagamento('valecredito')).toBe('CreditoLoja');
  });

  it('mapeia tPag da NF-e corretamente', () => {
    expect(mapTpPag('CreditoLoja')).toBe('05');
    expect(mapTpPag('Crédito Loja')).toBe('05');
    expect(mapTpPag('Credito')).toBe('03');
    expect(mapTpPag('Pix')).toBe('17');
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/pagamentosCreditoLoja.test.js`
Expected: FAIL (`CreditoLoja` não reconhecido ou mapeando para `Outros`/`01`).

- [ ] **Step 3: Implementar normalização e mapeamento**

1. Em `backend/domain/pagamentosRules.js`:
   - Adicionar `'CreditoLoja'` em `PAGAMENTOS_CANONICOS`.
   - Adicionar `CreditoLoja: 'Crédito Loja'` em `LABELS`.
   - Em `normalizarPagamento()`:
     - Tratar strings `creditoloja`, `haver`, `valecredito` retornando `'CreditoLoja'` antes da checagem genérica de crédito.
2. Em `backend/domain/nfeRules.js`:
   - Em `mapTpPag()`: reconhecer chaves canônicas (`Pix` -> `17`, `Dinheiro` -> `01`, `Credito` -> `03`, `Debito` -> `04`, `Boleto` -> `15`, `CreditoLoja` -> `05`) além dos labels antigos em português.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/pagamentosCreditoLoja.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/domain/pagamentosRules.js backend/domain/nfeRules.js backend/__tests__/pagamentosCreditoLoja.test.js
git commit -m "feat(domain): adicionar forma de pagamento CreditoLoja e mapeamento fiscal"
```

---

### Task 3: Regras de Domínio de Crédito Loja e Validação de Invariante

**Files:**
- Create: `backend/domain/clienteCreditoRules.js`
- Test: `backend/__tests__/clienteCreditoRules.test.js`

**Interfaces:**
- Produces: `calcularSaldoCredito(movimentos)` -> `number` (arredondado a 2 casas decimais)
- Produces: `validarUsoCredito({ saldoDisponivel, valorDesejado })` -> `{ valido: boolean, erro?: string }`
- Produces: `validarInvarianteCredito({ movimentos, lancamentosCreditoLoja, saidasDevolvido })` -> `{ valido: boolean, diferenca: number }`

- [ ] **Step 1: Escrever testes unitários de regras de crédito**

Criar `backend/__tests__/clienteCreditoRules.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { calcularSaldoCredito, validarUsoCredito, validarInvarianteCredito } from '../domain/clienteCreditoRules.js';

describe('clienteCreditoRules', () => {
  it('calcula saldo somando entradas e subtraindo usos e devoluções', () => {
    const movimentos = [
      { tipo: 'gerado', valor: 100 },
      { tipo: 'usado', valor: -30 },
      { tipo: 'devolvido', valor: -20 },
    ];
    expect(calcularSaldoCredito(movimentos)).toBe(50);
  });

  it('bloqueia uso de crédito se valor for maior que saldo disponível', () => {
    expect(validarUsoCredito({ saldoDisponivel: 50, valorDesejado: 60 }).valido).toBe(false);
    expect(validarUsoCredito({ saldoDisponivel: 50, valorDesejado: 50 }).valido).toBe(true);
    expect(validarUsoCredito({ saldoDisponivel: 50, valorDesejado: -10 }).valido).toBe(false);
  });

  it('valida invariante contábil excluindo saldo inicial', () => {
    // soma(movimentos nao-saldo_inicial) == -soma(lancamentos CreditoLoja) - soma(saidas credito_devolvido)
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/clienteCreditoRules.test.js`
Expected: FAIL (`clienteCreditoRules.js` não existe).

- [ ] **Step 3: Implementar `backend/domain/clienteCreditoRules.js`**

Implementar as funções com aritmética precisa de centavos (`Math.round(val * 100)`), garantindo:
- `saldo_inicial` soma no saldo do cliente, mas é ignorado no cálculo da invariante contábil com lançamentos.
- Movimentos com `estorna_id` cancelam mutuamente o movimento referenciado.
- Validação estrita para nunca permitir saldo negativo.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/clienteCreditoRules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/domain/clienteCreditoRules.js backend/__tests__/clienteCreditoRules.test.js
git commit -m "feat(domain): regras de calculo e invariante de credito de cliente"
```

---

### Task 4: Serviço de Crédito e Endpoints de Extrato de Clientes

**Files:**
- Create: `backend/services/clienteCreditoService.js`
- Modify: `backend/routes/clientes.js:1-180`
- Test: `backend/__tests__/clienteCreditoService.test.js`

**Interfaces:**
- Produces: `createClienteCreditoService({ db })`:
  - `getExtratoCredito(clienteId)`
  - `gerarCreditoPorExcedente({ ordemId, clienteId, valor, criadopor })`
  - `devolverExcedente({ ordemId, clienteId, valor, pagamento, criadopor })`
  - `usarCreditoOS({ ordemId, clienteId, valor, criadopor })`
  - `devolverCredito({ clienteId, valor, pagamento, criadopor })`
  - `lancarSaldoInicial({ clienteId, valor, motivo, criadopor })`
  - `lancarAjusteManual({ clienteId, tipo, valor, motivo, criadopor })`
  - `estornarMovimento({ movimentoId, usuarioId })`
- Produces: rotas Express em `routes/clientes.js`:
  - `GET /api/clientes/:id/credito`
  - `POST /api/clientes/:id/credito/saldo-inicial`
  - `POST /api/clientes/:id/credito/ajuste`
  - `POST /api/clientes/:id/credito/devolver`
  - `POST /api/clientes/:id/credito/estornar/:movimentoId`

- [ ] **Step 1: Escrever testes de integração para o serviço de crédito**

Criar `backend/__tests__/clienteCreditoService.test.js`:
```javascript
import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createClienteCreditoService } from '../services/clienteCreditoService.js';

describe('clienteCreditoService', () => {
  let db, service;
  beforeEach(() => {
    // montar sqlite em memória com tabelas de clientes, ordens, lancamentos e cliente_credito_movimentos
  });

  it('gera crédito a partir de excedente e grava lançamento CreditoLoja negativo', () => {
    // gerarCreditoPorExcedente
    // verificar extrato e verificar lancamentos
  });

  it('bloqueia estorno se deixar o saldo do cliente negativo', () => {
    // lança saldo inicial 100, gasta 80, tenta estornar saldo inicial -> throw ErroSaldoInsuficiente
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/clienteCreditoService.test.js`
Expected: FAIL (`createClienteCreditoService` não implementado).

- [ ] **Step 3: Implementar `clienteCreditoService.js` e rotas em `clientes.js`**

1. Em `backend/services/clienteCreditoService.js`:
   Implementar métodos executando dentro de `transaction()`, aplicando locks e revalidações de saldo.
2. Em `backend/routes/clientes.js`:
   - Conectar endpoints protegidos por permissões adequadas (`clientes.credito.ver`, `clientes.credito.ajustar`, `clientes.credito.devolver`).
   - Bloquear atualização de `fiado_ativo` e `fiado_limite` no `PUT /:id` caso o usuário não tenha a permissão `clientes.fiado.gerenciar`.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/clienteCreditoService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/clienteCreditoService.js backend/routes/clientes.js backend/__tests__/clienteCreditoService.test.js
git commit -m "feat(services): servico e rotas de extrato e movimentacao de credito"
```

---

### Task 5: Domínio de Fiado e Guarda de Entrega de OS em Débito

**Files:**
- Create: `backend/domain/clienteFiadoRules.js`
- Modify: `backend/routes/ordens.js:500-650`
- Test: `backend/__tests__/clienteFiadoRules.test.js`

**Interfaces:**
- Produces: `validarEntregaComSaldo({ ordem, saldoOrdem, cliente, dividaAtualCliente, usuario, confirmarAcimaLimite })` -> `{ ok: boolean, code?: string, error?: string, acimaLimite?: boolean }`
- Modifies: `PUT /api/ordens/:id` e `PATCH /api/ordens/:id/status` para usar a validação centralizada.

- [ ] **Step 1: Escrever teste de validação de entrega de OS em débito**

Criar `backend/__tests__/clienteFiadoRules.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { validarEntregaComSaldo } from '../domain/clienteFiadoRules.js';

describe('clienteFiadoRules - validarEntregaComSaldo', () => {
  it('permite entrega normal quando saldo é zero', () => {
    const res = validarEntregaComSaldo({ saldoOrdem: 0 });
    expect(res.ok).toBe(true);
  });

  it('rejeita entrega com saldo para cliente sem fiado ativo', () => {
    const res = validarEntregaComSaldo({
      saldoOrdem: 50,
      cliente: { id: 1, fiado_ativo: 0 },
      usuario: { permissions: ['ordens.entregar_fiado'] }
    });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('FIADO_NAO_PERMITIDO');
  });

  it('bloqueia se exceder limite, a menos que admin confirme', () => {
    // teste com dividaAtual + saldo > limite
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/clienteFiadoRules.test.js`
Expected: FAIL (`clienteFiadoRules.js` não existe).

- [ ] **Step 3: Implementar `clienteFiadoRules.js` e integrar em `routes/ordens.js`**

1. Criar `backend/domain/clienteFiadoRules.js` com a lógica estrita de limite e permissões.
2. Em `backend/routes/ordens.js`:
   - Substituir os bloqueios estáticos `if (resumo && resumo.saldo > 0.01)` nas 3 rotas (`PUT /:id` só status, `PUT /:id` completo, `PATCH /:id/status`) pela chamada a `validarEntregaComSaldo`.
   - Se for entrega em fiado, registrar em `statuslog.obs` com valor da dívida e anotação se foi liberado acima do limite.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/clienteFiadoRules.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/domain/clienteFiadoRules.js backend/routes/ordens.js backend/__tests__/clienteFiadoRules.test.js
git commit -m "feat(ordens): regra unificada de entrega no fiado com controle de limite"
```

---

### Task 6: Ciclo de Vida da OS, Interceptação de Excedente e Blindagem do Caixa

**Files:**
- Modify: `backend/routes/ordens.js:480-780`
- Modify: `backend/routes/caixa.js:200-250`
- Modify: `backend/services/caixaLancamentoService.js:80-160`
- Test: `backend/__tests__/ordemExcedenteCicloVida.test.js`

**Interfaces:**
- Produces: resposta HTTP 409 `EXCEDENTE_PAGAMENTO` em `PUT /api/ordens/:id` e `PATCH /api/ordens/:id/status` (cancelamento) quando `recebido > total`.
- Produces: suporte a `destino_excedente: 'credito' | 'devolver'`.
- Produces: bloqueio de exclusão em `DELETE /api/ordens/:id` e `DELETE /api/ordens/:id/permanente` se houver movimentos de crédito ou saldo devedor de fiado.
- Produces: bloqueio de edição/exclusão manual em `caixa.js` para lançamentos `credito_*` e `acerto_id`.

- [ ] **Step 1: Escrever testes para fluxo de excedente e blindagem de exclusão**

Criar `backend/__tests__/ordemExcedenteCicloVida.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
// testar retorno 409 em redução de valor de OS paga
// testar resolução informando destino_excedente: 'credito'
// testar bloqueio de DELETE /caixa/:id em lancamento com origem credito_gerado
// testar bloqueio de exclusão permanente de OS com haver gerado
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/ordemExcedenteCicloVida.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar proteções e resolução de excedente**

1. Em `backend/routes/ordens.js`:
   - No cálculo do saldo projetado em `PUT /:id`: se `recebido > total + 0.01`, checar `req.body.destino_excedente`. Se ausente, responder 409. Se informado, chamar o serviço de crédito ou devolução na mesma transação.
   - No cancelamento de OS paga (`status === 'Cancelado'`): se `recebido > 0.01`, exigir `destino_excedente` com 409 caso não enviado.
   - Bloquear exclusão de OS que possua lançamentos `credito_*`, `acerto_id`, débitos em aberto ou referências em `cliente_credito_movimentos`.
2. Em `backend/routes/caixa.js` e `backend/services/caixaLancamentoService.js`:
   - Bloquear `PUT` e `DELETE` em lançamentos onde `origem` comece com `credito_` ou `acerto_id IS NOT NULL`.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/ordemExcedenteCicloVida.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/ordens.js backend/routes/caixa.js backend/services/caixaLancamentoService.js backend/__tests__/ordemExcedenteCicloVida.test.js
git commit -m "feat(ordens): interceptacao de excedente e protecao contra exclusao acidental"
```

---

### Task 7: Serviço de Acerto de Fiado, Cobrança WhatsApp e Impressão de Extrato

**Files:**
- Create: `backend/services/clienteAcertoService.js`
- Create: `backend/utils/print/clienteExtrato.js`
- Modify: `backend/routes/clientes.js:100-185`
- Test: `backend/__tests__/clienteAcertoService.test.js`

**Interfaces:**
- Produces: `createClienteAcertoService({ db })`:
  - `getContaEmAberto(clienteId)`
  - `receberAcerto({ clienteId, pagamento, ordem_ids, valor_total_esperado, usuarioId })`
  - `estornarAcerto({ acertoId, usuarioId })`
  - `gerarMensagemCobranca({ clienteId })` -> `{ texto, urlWhatsAppWeb, urlWhatsAppApp }`
- Produces: `renderExtratoContaHtml({ cliente, ordens, totalEmAberto, chavePix })`
- Produces: `renderReciboAcertoHtml({ cliente, acerto, ordensQuitadas })`
- Produces: rotas:
  - `GET /api/clientes/:id/conta-aberto`
  - `POST /api/clientes/:id/acerto`
  - `POST /api/clientes/acertos/:acertoId/estornar`
  - `GET /api/clientes/:id/cobranca/whatsapp`
  - `GET /api/clientes/:id/conta-aberto/extrato`
  - `GET /api/clientes/acertos/:acertoId/recibo`

- [ ] **Step 1: Escrever teste de acerto e geração de mensagem**

Criar `backend/__tests__/clienteAcertoService.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { createClienteAcertoService } from '../services/clienteAcertoService.js';

describe('clienteAcertoService', () => {
  it('quita todas as OS em débito e cria lançamentos vinculados ao acerto_id', () => {
    // criar cliente com 2 OS entregues em débito
    // chamar receberAcerto
    // verificar que o saldo de ambas vai a zero via getResumoFinanceiroOS
  });

  it('rejeita acerto se valor_total_esperado divergir do saldo em aberto real', () => {
    // retorno 409 ACERTO_DESATUALIZADO
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/clienteAcertoService.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar serviço de acerto, templates HTML e rotas**

1. Em `backend/services/clienteAcertoService.js`:
   Implementar quitação atômica de OS, estorno completo de acerto e formatação da mensagem para WhatsApp conforme spec.
2. Em `backend/utils/print/clienteExtrato.js`:
   Implementar renderizadores HTML operacionais para extrato de conta em aberto e recibo de acerto.
3. Em `backend/routes/clientes.js`:
   Conectar rotas e garantir envio com `sendPrintHtml` para os documentos impressos.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/clienteAcertoService.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/clienteAcertoService.js backend/utils/print/clienteExtrato.js backend/routes/clientes.js backend/__tests__/clienteAcertoService.test.js
git commit -m "feat(clientes): acerto agrupado de fiado, cobranca whatsapp e extrato impresso"
```

---

### Task 8: Visões Financeiras (Fechamento de Caixa, DRE, Contas a Receber e Auditoria)

**Files:**
- Modify: `backend/utils/print/caixaFechamento.js:1-120`
- Modify: `backend/routes/financeiro.js:60-310`
- Modify: `backend/services/financeiroReceberService.js:1-25`
- Modify: `backend/routes/relatorios.js:20-95`
- Test: `backend/__tests__/financeiroCreditoFiadoIntegracao.test.js`

**Interfaces:**
- Modifies: `montarFechamentoCaixa` para isolar `CreditoLoja` fora da gaveta e contabilizar saída `credito_devolvido` na gaveta.
- Modifies: DRE e Resumo Financeiro para incluir receita com `CreditoLoja` e excluir saídas de `credito_devolvido` de despesas/devoluções.
- Modifies: `getContasReceberPayload` para listar OS `Entregue` com saldo > 0.009 (fiado).
- Modifies: `/api/financeiro/integridade-os` para auditar a invariante contábil de crédito.

- [ ] **Step 1: Escrever teste de integridade contábil e visões financeiras**

Criar `backend/__tests__/financeiroCreditoFiadoIntegracao.test.js`:
```javascript
import { describe, expect, it } from 'vitest';
import { montarFechamentoCaixa } from '../utils/print/caixaFechamento.js';
import { getContasReceberPayload } from '../services/financeiroReceberService.js';

describe('Integração Financeira - Duas Visões', () => {
  it('exclui CreditoLoja da soma de gaveta em dinheiro', () => {
    // fechamento com Pix, Dinheiro e CreditoLoja
  });

  it('inclui OS entregue em débito no contas a receber gerencial', () => {
    // getContasReceberPayload
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npx.cmd vitest run __tests__/financeiroCreditoFiadoIntegracao.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar ajustes nas visões financeiras**

1. Em `caixaFechamento.js`:
   Criar seção específica para "Crédito Loja (não entra na gaveta)", separando do dinheiro líquido.
2. Em `financeiro.js` e `relatorios.js`:
   Ajustar queries SQL para filtrar saídas com `origem != 'credito_devolvido'` nos relatórios de despesas e DRE.
3. Em `financeiroReceberService.js`:
   Ajustar cláusula WHERE para incluir OS entregues com saldo.
4. Na rota de auditoria de integridade (`financeiro.js`):
   Adicionar checagem da invariante de crédito e saldo de crédito negativo.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npx.cmd vitest run __tests__/financeiroCreditoFiadoIntegracao.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/print/caixaFechamento.js backend/routes/financeiro.js backend/services/financeiroReceberService.js backend/routes/relatorios.js backend/__tests__/financeiroCreditoFiadoIntegracao.test.js
git commit -m "feat(financeiro): visao contabil e fechamento de caixa para fiado e credito loja"
```

---

### Task 9: Interface de Clientes - Ficha com Conta em Aberto e Extrato de Crédito

**Files:**
- Modify: `frontend/src/pages/Clientes.jsx:1-800`
- Test: `frontend/src/pages/ClientesFiadoCredito.test.jsx`

**Interfaces:**
- Produces: cards de destaque no topo da ficha do cliente: "Em aberto: R$ X" (com limite) e "Crédito Loja: R$ Z".
- Produces: seção "Conta em aberto" com listagem de OS em débito, botões "Enviar cobrança", "Imprimir extrato" e modal "Receber acerto".
- Produces: seção "Crédito Loja" com extrato completo e ações de admin (Lançar saldo inicial, Ajuste/Cortesia, Devolver em dinheiro, Estornar).
- Produces: campos "Permite fiado" e "Limite de fiado" no modal de edição de cliente (apenas para admin).

- [ ] **Step 1: Escrever teste de renderização dos componentes de fiado e crédito**

Criar `frontend/src/pages/ClientesFiadoCredito.test.jsx`:
```javascript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
// mock API calls e testar renderização do saldo em aberto e extrato de crédito na aba de detalhe do cliente
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `cd frontend && npx.cmd vitest run src/pages/ClientesFiadoCredito.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implementar componentes visuais em `Clientes.jsx`**

Reutilizar classes e tokens globais operacionais (`btn`, `card`, `table-wrap`, `badge`, `form-input`):
- Adicionar abas/seções operacionais no painel lateral de detalhes do cliente.
- Implementar modais de Acerto, Saldo Inicial, Ajuste e Devolução.
- Chamar endpoints criados nas Tasks anteriores.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `cd frontend && npx.cmd vitest run src/pages/ClientesFiadoCredito.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Clientes.jsx frontend/src/pages/ClientesFiadoCredito.test.jsx
git commit -m "feat(ui): interface de conta em aberto e extrato de credito na ficha do cliente"
```

---

### Task 10: Interface de OS e Caixa - Modal de Excedente, Uso de Crédito e Chave Pix

**Files:**
- Modify: `frontend/src/pages/OrdemDetalhe.jsx`
- Modify: `frontend/src/pages/Ordens.jsx`
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Test: `frontend/src/pages/OrdemExcedenteModal.test.jsx`

**Interfaces:**
- Produces: modal para capturar 409 `EXCEDENTE_PAGAMENTO` na alteração ou cancelamento de OS paga, permitindo escolher "Gerar Crédito Loja" ou "Devolver".
- Produces: botão/ação "Usar Crédito Loja" na OS para abater saldo em aberto.
- Produces: campo "Chave Pix da Loja" na tela de configurações da empresa.

- [ ] **Step 1: Escrever teste de UI para o modal de excedente**

Criar `frontend/src/pages/OrdemExcedenteModal.test.jsx`:
```javascript
import { describe, expect, it } from 'vitest';
// testar abertura do modal de escolha entre Gerar Crédito e Devolver ao receber erro 409 EXCEDENTE_PAGAMENTO
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `cd frontend && npx.cmd vitest run src/pages/OrdemExcedenteModal.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implementar modais e integrações no frontend**

1. Em `frontend/src/pages/OrdemDetalhe.jsx` e `frontend/src/pages/Ordens.jsx`:
   - Interceptar respostas 409 com código `EXCEDENTE_PAGAMENTO`.
   - Exibir modal operacional para escolha de destino do excedente (`credito` vs `devolver`).
   - Adicionar botão de aplicação de crédito do cliente no saldo da OS.
2. Em `frontend/src/pages/Configuracoes.jsx`:
   - Adicionar campo `chave_pix` nos dados cadastrais da empresa.

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `cd frontend && npx.cmd vitest run src/pages/OrdemExcedenteModal.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OrdemDetalhe.jsx frontend/src/pages/Ordens.jsx frontend/src/pages/Configuracoes.jsx frontend/src/pages/OrdemExcedenteModal.test.jsx
git commit -m "feat(ui): modal de resolucao de excedente de OS e configuracao de chave Pix"
```

---

### Task 11: Validação End-to-End, Auditoria de Integridade e Build Completo

**Files:**
- Test: `backend/__tests__/e2eFiadoCreditoFlow.test.js`

**Interfaces:**
- Valida o fluxo ponta a ponta:
  1. Criação de cliente com fiado ativo e limite.
  2. Criação de OS e entrega em débito (fiado).
  3. Geração de cobrança formatada para WhatsApp.
  4. Quitação via Acerto agrupado.
  5. OS alterada gerando Crédito Loja.
  6. Uso de Crédito Loja em nova OS.
  7. Devolução de crédito em dinheiro.
  8. Execução de auditoria financeira sem discrepâncias.

- [ ] **Step 1: Escrever teste End-to-End abrangente**

Criar `backend/__tests__/e2eFiadoCreditoFlow.test.js` cobrindo o ciclo completo dos dois fluxos.

- [ ] **Step 2: Executar o teste E2E**

Run: `npx.cmd vitest run __tests__/e2eFiadoCreditoFlow.test.js`
Expected: PASS.

- [ ] **Step 3: Executar suítes completas de testes de regressão no backend e frontend**

Run:
```powershell
cd backend
npm.cmd test
cd ..\frontend
npm.cmd test
npm.cmd run build
```
Expected: Todos os testes passando sem erros e build do Vite concluído com sucesso.

- [ ] **Step 4: Commit final da funcionalidade**

```bash
git add backend/__tests__/e2eFiadoCreditoFlow.test.js
git commit -m "test: validar fluxo end-to-end de fiado e credito loja"
```
