# Conta do Cliente: Fiado e Crédito Loja — Design

Data: 2026-10-26
Status: rascunho para aprovação

## 1. Intenção

A loja tem dois fluxos de dinheiro do cliente que hoje vivem fora do sistema:

1. **Fiado (cliente de ficha).** Alguns clientes levam o serviço sem pagar e acertam semanalmente, quinzenalmente ou mensalmente. Hoje o valor de cada serviço é enviado pelo WhatsApp e, no acerto, alguém soma tudo à mão. O cliente **sempre paga tudo** no acerto (nunca parcial).
2. **Crédito Loja (haver).** Cliente paga, altera o pedido para algo mais barato e prefere deixar a diferença como crédito. Antes era um papel assinado ("CRÉDITO NO VALOR X", data, assinatura). O crédito é usado depois em OS nova **ou** venda avulsa, **aos poucos ou de uma vez**, **nunca vence** e **pode ser devolvido em dinheiro**.

Objetivo: trazer os dois fluxos para o sistema com rastreabilidade total, sem quebrar o financeiro que já roda em produção.

## 2. Objetivos

- Permitir **entregar OS com saldo em aberto** somente para clientes autorizados, dentro de um limite.
- Mostrar na ficha do cliente a **conta em aberto**, gerar **cobrança pelo WhatsApp** (envio manual assistido), **extrato imprimível** e **receber o acerto** quitando todas as OS de uma vez.
- Manter um **extrato de Crédito Loja** por cliente (gerado, usado, devolvido, ajustado), com saldo derivado dos movimentos.
- Fechar o buraco atual em que reduzir o valor de uma OS já paga faz o excedente "sumir".
- Manter caixa (gaveta), DRE, resumo financeiro e contas a receber corretos.

## 3. Não-objetivos

- Juros, multa, vencimento de fiado, boletos, Pix dinâmico/QR.
- Acerto parcial (o cliente sempre paga tudo; pode virar fase futura).
- Validade/expiração de crédito (fica valendo para sempre).
- Envio automático de cobrança (segue a política de envio manual assistido).
- Detalhamento de múltiplas formas de pagamento na NF-e.
- Bloquear ou alterar a emissão de NF-e de OS entregue em débito (decisão do usuário: a loja tem autonomia para emitir quando precisar; ver 9.12).

## 4. Anti-objetivos (falhas mesmo que "funcione")

- Receita contada em dobro no DRE/resumo quando o crédito é usado.
- Gaveta do fechamento mostrando dinheiro que não entrou (uso de crédito contado como espécie).
- OS entregue em débito sumindo do contas a receber.
- Saldo de crédito editável como número solto, ou movimento apagado sem rastro.
- Confundir "Crédito Loja" com "Cartão de Crédito" (a chave `Credito` já existe e significa cartão).
- Qualquer alteração em `getResumoFinanceiroOS()` que mude a fórmula de saldo da OS.

## 5. Restrições (do sistema em produção)

- Regras do `AGENTS.md`: saldo de OS vem só de `getResumoFinanceiroOS()`; migrações apenas aditivas (`ALTER TABLE ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`); status com acento; impressão é HTML do backend; WhatsApp manual (`wa.me` / `whatsapp://send`).
- PM2 fork, 1 instância, `better-sqlite3` síncrono: toda operação financeira composta deve rodar dentro de **uma** `transaction()`, revalidando saldos dentro dela.
- O saldo da OS também está duplicado em SQL inline (lista de OS em `routes/ordens.js`, `services/financeiroReceberService.js`, `routes/pdf.js`). **Decisão: o design não muda como "recebido" é calculado**, então essas cópias continuam corretas sem alteração de fórmula.
- Nenhum backfill de dados existentes é necessário; a funcionalidade nasce vazia.

## 6. Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Quem liga o fiado de um cliente | Só admin |
| Limite de fiado | Obrigatório para o fiado estar ativo; definido pelo admin |
| Entrega em débito acima do limite | Bloqueada para caixa; admin pode liberar com confirmação explícita registrada |
| Geração de crédito pelo caixa | Só pelo fluxo automático da OS (valor reduzido após pagamento), sempre vinculado à OS de origem |
| Crédito manual (saldo inicial dos papéis, cortesia, ajuste) | Só admin, motivo obrigatório |
| Uso de crédito | Caixa e admin; em OS ou venda avulsa; parcial permitido |
| Devolução em dinheiro | Permitida; permissão própria, padrão só admin |
| Validade do crédito | Nunca expira |
| Correção de erro | Nunca apagar; estorno gera movimento compensatório visível |
| Acerto do fiado | Sempre quita tudo, uma forma de pagamento |
| Cobrança WhatsApp | Uma linha por OS (número, data, serviço, valor, pago se houver), total, chave Pix |
| UI | Dentro do painel de cliente existente em `Clientes.jsx` |
| NF-e de OS em débito | Não bloquear; emissão continua livre como hoje |
| Saldo inicial (vales de papel) | Não afeta receita/DRE do mês em que é digitado |
| Cancelar OS já paga | Pergunta o destino: gerar crédito ou devolver (mesmo fluxo da redução de valor) |
| Excluir OS com crédito/fiado | Bloqueado; precisa cancelar antes |

## 7. Modelo contábil (núcleo do design)

### 7.1 Nova forma de pagamento não-monetária

- Chave canônica: `CreditoLoja`; label: `Crédito Loja`.
- Adicionar em `PAGAMENTOS_CANONICOS`/`LABELS` e em `normalizarPagamento()` (`creditoloja`, `haver`, `valecredito` → `CreditoLoja`). Garantir por teste que **não** colide com `Credito` (cartão).
- `mapTpPag()` em `domain/nfeRules.js`: `CreditoLoja` → `'05'` (Crédito Loja, tabela SEFAZ).
- Não deve aparecer como opção livre nos selects genéricos de pagamento do caixa/OS; só é criada pelos endpoints de crédito.

### 7.2 Duas visões que precisam fechar

- **Visão caixa/gaveta (dinheiro real):** ignora lançamentos `CreditoLoja`; inclui a saída da devolução de crédito.
- **Visão resultado (DRE, resumo financeiro, relatórios de receita):** inclui lançamentos `CreditoLoja` (são ajustes de receita); **exclui** a saída de devolução de crédito (o passivo já foi baixado da receita quando o crédito foi gerado).

### 7.3 Tabela de lançamentos por evento

Todo evento roda numa única transação e grava **um lançamento** + **um movimento de crédito** (exceto onde indicado).

| Evento | Lançamento (`lancamentos`) | Movimento de crédito |
|---|---|---|
| Crédito gerado por redução de OS | `tipo='Entrada'`, `valor = -X`, `pagamento='CreditoLoja'`, `origem='credito_gerado'`, `ordemid`=OS antiga, `clienteid` | `gerado`, `+X`, `ordemid` |
| Crédito usado em OS | `tipo='Entrada'`, `valor = +Y`, `pagamento='CreditoLoja'`, `origem='credito_usado'`, `ordemid`=OS nova, `clienteid` | `usado`, `-Y`, `ordemid`, `lancamentoid` |
| Crédito usado em venda avulsa | parte da venda paga com `pagamento='CreditoLoja'`, `origem='vendaavulsa'`, `clienteid` (ver 9.4) | `usado`, `-Y`, `lancamentoid` |
| Saldo inicial (admin, vales de papel) | **nenhum lançamento** (decisão do usuário: não distorcer a receita do mês) | `saldo_inicial`, `+S`, motivo |
| Ajuste manual de entrada / cortesia (admin) | `tipo='Entrada'`, `valor = -A`, `pagamento='CreditoLoja'`, `origem='credito_ajuste'`, sem `ordemid` (cortesia = desconto concedido; neutraliza a receita quando o crédito for usado) | `ajuste_entrada`, `+A`, motivo |
| Ajuste manual de saída (admin) | `tipo='Entrada'`, `valor = +B`, `pagamento='CreditoLoja'`, `origem='credito_ajuste'` | `ajuste_saida`, `-B`, motivo |
| Devolução em dinheiro | `tipo='Saída'`, `valor = Z`, `pagamento` real (Dinheiro/Pix/...), `origem='credito_devolvido'`, `categoria='Devolução de crédito'`, `clienteid` | `devolvido`, `-Z`, `lancamentoid` |
| Estorno de um movimento | soft delete (`deletedat`) do lançamento original | `estorno`, valor oposto, `estorna_id` |

Consequências verificadas:

- `getResumoFinanceiroOS()` (soma `pago=1` sem filtro de sinal) já reflete crédito gerado (reduz recebido da OS antiga) e crédito usado (abate saldo da OS nova). Fórmula intocada.
- Exemplo: OS de 100 paga em Pix, reduzida para 70 → crédito 30. Caixa: +100. Resultado: 100 − 30 = 70. Crédito usado depois numa OS de 30: caixa continua 100; resultado 70 + 30 = 100. Se em vez disso devolvido: caixa 100 − 30 = 70; resultado 70.
- **Invariante auditável:** `SUM(movimentos não-saldo_inicial) = −SUM(lançamentos CreditoLoja ativos) − SUM(saídas credito_devolvido ativas)`, considerando os estornos de cada lado. Movimentos `saldo_inicial` (e seus estornos) ficam fora da conta por não terem lançamento. Entra na auditoria de integridade financeira.
- Consequência aceita do saldo inicial: quando esse crédito for usado, o lançamento `credito_usado` soma receita no mês do uso (o dinheiro real entrou antes do sistema). Decisão consciente para não gerar receita negativa no mês da digitação.

### 7.4 Saldo de crédito nunca negativo

Antes de qualquer movimento negativo, dentro da transação: `saldo_atual − valor ≥ 0` (comparação em centavos). Caso contrário, 400.

## 8. Dados (migrações aditivas)

`clientes`:
- `fiado_ativo INTEGER DEFAULT 0`
- `fiado_limite REAL DEFAULT NULL`

`lancamentos`:
- `clienteid INTEGER DEFAULT NULL` (preenchido nos lançamentos novos de crédito, acerto e venda avulsa com crédito)
- `acerto_id INTEGER DEFAULT NULL`

`empresa_config`:
- `chave_pix TEXT DEFAULT NULL` (editável em `/configuracoes`; usada na cobrança e no extrato; se vazia, a linha é omitida)

Nova tabela `cliente_credito_movimentos` (`CREATE TABLE IF NOT EXISTS`):
- `id`, `clienteid NOT NULL`, `tipo NOT NULL` (`gerado|usado|devolvido|saldo_inicial|ajuste_entrada|ajuste_saida|estorno`), `valor REAL NOT NULL` (com sinal; positivo aumenta saldo), `ordemid`, `lancamentoid`, `estorna_id`, `motivo`, `criadopor NOT NULL`, `createdat`.
- Sem `deletedat`: movimentos são imutáveis. Índices em `clienteid` e `lancamentoid`.

Nova tabela `cliente_acertos`:
- `id`, `clienteid NOT NULL`, `valor_total REAL NOT NULL`, `pagamento NOT NULL`, `observacao`, `criadopor`, `createdat`, `estornado_em`, `estornado_por`.

`statuslog.obs` passa a registrar entregas em débito: `"Entregue em débito (fiado): saldo R$ X"` e, quando admin libera acima do limite, `"... acima do limite R$ L"`.

## 9. Comportamentos

### 9.1 Configurar fiado (admin)

- No formulário do cliente (somente admin vê/edita): "Permite fiado" + "Limite (R$)". Fiado só ativa com limite > 0.
- Desligar o fiado não afeta dívidas existentes; apenas bloqueia novas entregas em débito.

### 9.2 Entregar OS com saldo

- Criar uma única regra de domínio (ex.: `validarEntregaComSaldo()` em `domain/`) usada nas **três** rotas que alteram status para `Entregue` (`PUT /ordens/:id` caminho só-status, `PUT /ordens/:id` caminho de edição com saldo projetado, `PATCH /ordens/:id/status`). Hoje as três bloqueiam `saldo > 0.01`.
- Regra: se saldo projetado ≤ 0.01 → como hoje. Se > 0.01, só permite quando:
  - a OS tem `clienteid` (não basta nome);
  - o cliente tem `fiado_ativo=1` e `fiado_limite > 0`;
  - o usuário tem `ordens.entregar_fiado`;
  - `dívida entregue atual do cliente + saldo desta OS ≤ fiado_limite`, **ou** usuário tem `ordens.entregar_acima_limite` e enviou confirmação explícita (`confirmar_acima_limite: true`).
- "Dívida entregue do cliente" = soma de `getResumoFinanceiroOS(id).saldo` das OS do cliente com `status='Entregue'` e não excluídas. Uma implementação em lote é aceitável se coberta por teste comparando com `getResumoFinanceiroOS()`.
- Respostas de erro com `code` distinto (`FIADO_NAO_PERMITIDO`, `FIADO_LIMITE_EXCEDIDO`) para o frontend oferecer a ação certa.
- A regra de exclusão de pagamento de OS entregue em `DELETE /api/caixa/:id` (bloqueia se saldo projetado > 0.01) continua valendo; para OS entregue em débito ela já está "aberta", então excluir pagamento só aumenta a dívida — **permitir somente se o resultado ainda couber na regra de fiado**; senão manter o bloqueio. A mesma lógica vale para edição em `caixaLancamentoService`.
- `oficina` não entrega em débito (não recebe `ordens.entregar_fiado`).

### 9.3 Redução de valor de OS já paga (fecha o buraco atual)

- No `PUT /ordens/:id` (edição), calcular `recebido` projetado (mesma lógica de entrada já usada no caminho `Entregue`) e o novo total. Se `recebido − total > 0.01`, responder **409** `code='EXCEDENTE_PAGAMENTO'` com o valor do excedente, sem salvar.
- Frontend abre modal: **Gerar Crédito Loja** (exige `clienteid`) ou **Devolver** (exige `clientes.credito.devolver`; escolhe forma de pagamento). O cliente reenvia com `destino_excedente: 'credito' | 'devolver'` (+ `pagamento_devolucao`).
- Tudo na mesma transação do update da OS:
  - `credito`: lançamento `credito_gerado` (−X) na OS + movimento `gerado`.
  - `devolver`: lançamento na OS `tipo='Entrada'`, `valor=−X`, pagamento real, `origem='estorno_os'`, `categoria='Estorno OS'` (reduz caixa e receita, coerente nas duas visões). Sem movimento de crédito.
- Após a operação, `getResumoFinanceiroOS()` da OS deve ter `recebido == total` (teste).

### 9.4 Usar crédito

- **Em OS:** ação "Usar Crédito Loja" na OS (detalhe da OS e atendimento), valor ≤ min(saldo de crédito do cliente, saldo da OS). Cria lançamento `credito_usado` + movimento `usado`. Crédito **nunca** é gravado como `origem='entradaos'` (o fluxo de edição de OS reescreve valor/pagamento da entrada e dessincronizaria o extrato). Se a UI permitir usar crédito no momento de criar a OS, o backend cria a OS e o lançamento `credito_usado` separado, na mesma transação.
- **Em venda avulsa:** `POST /api/caixa` com itens passa a aceitar `clienteid` e `credito_valor`. Se `credito_valor` < total, o restante vai na forma de pagamento informada. Implementação deixada ao builder com estas regras: itens gravados uma única vez; soma dos lançamentos = total dos itens; parte em crédito com `pagamento='CreditoLoja'`; tudo numa transação; movimento `usado` aponta para o lançamento de crédito.

### 9.5 Devolver crédito em dinheiro

- Ação no extrato do cliente, permissão `clientes.credito.devolver`. Valor ≤ saldo; forma de pagamento real obrigatória. Gera `Saída` `credito_devolvido` + movimento `devolvido`.

### 9.6 Ajuste manual (admin)

- "Lançar saldo inicial" (`saldo_inicial`, para os vales de papel; sem lançamento financeiro), "Lançar crédito manual / cortesia" (`ajuste_entrada`) e "Baixar crédito" (`ajuste_saida`), motivo obrigatório (ex.: "Saldo inicial — vale em papel de 12/08/2026"). Ajustes geram lançamento `credito_ajuste` conforme 7.3; saldo inicial não gera.

### 9.7 Estorno

- Admin (`clientes.credito.ajustar`) pode estornar um movimento: soft delete do lançamento vinculado + movimento `estorno` com `estorna_id`. Validar que o estorno não deixa saldo de crédito negativo nem viola a regra de fiado da OS afetada. Um movimento só pode ser estornado uma vez.
- Lançamentos com `origem` de crédito (`credito_*`) e os do acerto **não podem** ser editados/excluídos pelos endpoints genéricos `PUT/DELETE /api/caixa/:id` (retornar 400 com orientação). Correção só por estorno.

### 9.8 Conta em aberto, cobrança e acerto

- **Conta em aberto** = OS do cliente com `status='Entregue'` e saldo > 0.01 (via `getResumoFinanceiroOS`). OS ainda não entregues aparecem só na lista normal de OS, não na cobrança.
- **Cobrança WhatsApp:** texto gerado no backend (para ser testável), aberto pelo fluxo manual existente (`wa.me` / `whatsapp://send` conforme preferência em `/configuracoes`). Formato:

  ```
  Olá, {primeiro nome}! Segue o resumo da sua conta na {nome fantasia}:

  OS {numero} – {data entrega dd/mm} – {servico} – R$ {total}[ (pago R$ {recebido})]
  ...

  Total em aberto: R$ {soma}
  Pix: {chave_pix}
  ```

  Registrar a geração no histórico de avisos de WhatsApp se o schema de `whatsapp_avisos` comportar aviso por cliente; senão, deixar ao builder um registro equivalente.
- **Extrato imprimível:** HTML via `sendPrintHtml()`, mesmo padrão das outras impressões (OS, itens/serviço, valores, total, chave Pix).
- **Receber acerto:** `POST /api/clientes/:id/acerto` com `{ pagamento, ordem_ids, valor_total_esperado }`. Dentro da transação: recalcula saldos via `getResumoFinanceiroOS`; se o conjunto ou o total divergir do esperado → 409 (tela desatualizada). Cria `cliente_acertos` e um lançamento `saldoos` por OS (`valor` = saldo da OS, `acerto_id`, `clienteid`). Forma de pagamento real (não aceita `CreditoLoja`; para usar crédito, aplicar antes na OS).
- **Recibo do acerto** imprimível (HTML), listando OS quitadas.
- Estorno de acerto (admin): soft delete de todos os lançamentos do acerto na mesma transação, marca `estornado_em`.

### 9.9 Contas a receber e auditoria

- `getContasReceberPayload()` passa a incluir OS `Entregue` com saldo > 0.009, com indicação "Entregue (fiado)" e `clienteid`. Ajustar o PDF de contas a receber e a auditoria de integridade (`auditarIntegridadeFinanceiraOS`) para não acusar divergência nesses casos.
- Auditoria ganha a verificação da invariante 7.3 e de saldo de crédito ≥ 0 por cliente.

### 9.10 Caixa, fechamento e relatórios

- Fechamento de caixa (`montarFechamentoCaixa` / HTML): `CreditoLoja` em linha separada "Crédito Loja (não entra na gaveta)", fora do total em espécie/gaveta. Saída `credito_devolvido` entra normalmente na gaveta.
- DRE e resumo financeiro admin (`routes/financeiro.js`) e resumo de relatórios (`routes/relatorios.js`): incluir `CreditoLoja` nas entradas (ajuste de receita) e **excluir** `origem='credito_devolvido'` de saídas/despesas/devoluções. O filtro de devolução por `categoria LIKE '%devol%'` no DRE **não** pode capturar "Devolução de crédito" — filtrar por `origem`.
- Agrupamentos por forma de pagamento mostram "Crédito Loja" como grupo próprio.
- **Decisão (builder check):** Crédito Loja aparece **sempre como linha própria** em fechamento e relatórios (ex.: "Crédito Loja — gerado: −R$ X / usado: +R$ Y"), nunca somado dentro de outra forma de pagamento. Valores negativos só existem nessa linha e na linha "Estorno OS". As validações de valor > 0 dos endpoints genéricos (`routes/caixa.js`, `caixaLancamentoService.js`) continuam valendo; lançamentos negativos só são criados pelos serviços internos de crédito/estorno.
- Builder deve revisar `routes/kpis.js` e dashboards com a mesma regra das duas visões.

### 9.11 Tela de clientes (`Clientes.jsx`)

No painel do cliente:
- Destaques: **Em aberto R$ X** (vermelho, só se > 0) com "Limite R$ Y" quando fiado ativo; **Crédito Loja R$ Z** (verde, só se > 0).
- Seção **Conta em aberto**: tabela (data, OS, serviço, status, total, pago, saldo) + botões **Enviar cobrança**, **Imprimir extrato**, **Receber acerto**.
- Seção **Crédito Loja**: extrato (data, tipo, valor, OS/venda, usuário, saldo após) + botões admin **Lançar crédito manual**, **Devolver crédito**, **Estornar**.
- Lista de clientes: indicador discreto de quem tem débito/crédito.
- Usuários sem `clientes.credito.ver` não veem valores; `oficina` não vê nada disso.
- Estilo operacional existente (`btn`, `card`, `table-wrap`, `badge`, `mobile-record-*`), sem CSS novo isolado quando houver equivalente.

### 9.12 Ciclo de vida da OS (cancelar, lixeira, exclusão permanente)

- **Cancelar OS com recebido > 0.01** (decisão do usuário): nas três rotas que alteram status para `Cancelado`, responder 409 `EXCEDENTE_PAGAMENTO` com o valor recebido, e o frontend pergunta o destino (**gerar crédito** / **devolver**), exatamente como 9.3, na mesma transação da troca de status. Se a OS tinha usado crédito, o recebido inclui esse valor e ele volta como crédito (ou é devolvido) por esse mesmo fluxo. Depois do cancelamento, `recebido == 0` na OS.
- **Lixeira (`DELETE /api/ordens/:id`) e exclusão permanente (`/:id/permanente`)** ficam bloqueadas (400 com orientação) quando a OS tem qualquer lançamento ativo `credito_*`, `estorno_os`, lançamento com `acerto_id`, ou é `Entregue` com saldo > 0.01. Orientação: cancelar primeiro (o que resolve o dinheiro pelo fluxo acima). Exclusão permanente também bloqueada se existir movimento de crédito com `ordemid` desta OS, para nunca apagar lançamentos referenciados pelo extrato.
- Restaurar da lixeira não muda nada financeiro (OS bloqueadas nunca chegam à lixeira).

### 9.13 NF-e

- **Decisão do usuário:** emissão de NF-e de OS entregue em débito **não é bloqueada**; segue como hoje.
- Decisão do agente: o preview fiscal (`GET /api/nfe/emitir/:id/preview`) mostra um aviso não bloqueante quando a OS tem saldo em aberto ("OS com saldo em aberto R$ X — conferir forma de pagamento"), para o operador ajustar no preview editável se quiser.
- Em escopo: corrigir `mapTpPag()` para reconhecer as chaves canônicas de `normalizarPagamento()` (incluindo `Credito` → cartão de crédito e `CreditoLoja` → `'05'`), mantendo compatibilidade com os labels antigos. Cobrir com teste.

## 10. Permissões novas

| Permissão | admin | caixa | oficina |
|---|---|---|---|
| `clientes.fiado.gerenciar` | ✓ | | |
| `clientes.credito.ver` | ✓ | ✓ | |
| `clientes.credito.usar` | ✓ | ✓ | |
| `clientes.credito.ajustar` (manual + estornos) | ✓ | | |
| `clientes.credito.devolver` | ✓ | | |
| `clientes.acerto.receber` | ✓ | ✓ | |
| `ordens.entregar_fiado` | ✓ | ✓ | |
| `ordens.entregar_acima_limite` | ✓ | | |

Registrar em `domain/permissionRules.js` e nos perfis padrão, seguindo o mecanismo de perfis customizados existente.

**Backfill em produção (decisão do agente):** `seedDefaultPermissionProfiles` só popula perfis vazios, então incluir as chaves em `DEFAULT_PROFILE_PERMISSIONS` não basta. Criar migração aditiva idempotente (`INSERT OR IGNORE` em `profile_permissions`) que concede **somente as chaves novas** aos perfis de sistema `admin` e `caixa` existentes, conforme a tabela acima, mesmo que tenham sido customizados. Perfis customizados criados pelo usuário não recebem nada (o admin libera pela tela de perfis). Nenhuma permissão existente é removida ou alterada.

## 11. Testes obrigatórios (mínimo)

- `normalizarPagamento`: `CreditoLoja` não colide com `Credito`.
- Entrega em débito: bloqueio sem cliente/sem fiado/sem permissão/acima do limite; liberação admin com confirmação; nas três rotas de status.
- Redução de OS paga: 409 sem destino; destino crédito e destino devolução; `recebido == total` depois.
- Uso parcial de crédito em OS e venda avulsa; saldo nunca negativo; concorrência simulada (dois usos seguidos excedendo saldo).
- Devolução: caixa reduz; DRE/resumo não reduzem.
- Exemplo 7.3 completo nas duas visões (fechamento de caixa e DRE).
- Acerto: quita todas; 409 se a lista mudou; lançamentos com `acerto_id`; estorno de acerto.
- Contas a receber inclui entregue em débito; auditoria sem falso positivo; invariante de crédito.
- Endpoints genéricos do caixa recusam editar/excluir lançamentos `credito_*` e de acerto.
- `oficina` não acessa endpoints de crédito/acerto e não vê valores.
- Cancelamento de OS paga: 409 sem destino; crédito/devolução; crédito usado volta ao cliente.
- Lixeira/exclusão permanente bloqueadas nos casos de 9.12; `DELETE FROM lancamentos` nunca roda para OS com movimentos de crédito.
- Saldo inicial não altera DRE/resumo/relatórios; invariante continua fechando.
- Backfill de permissões idempotente (rodar duas vezes não duplica) e não toca perfis customizados.
- `mapTpPag` com chaves canônicas e labels antigos.
- Suíte completa backend e frontend passando; `npm run build` do frontend.

## 12. Implantação

- Backup manual do banco antes do deploy (além do diário).
- Migrações apenas aditivas; nenhum dado existente alterado.
- Funcionalidade inerte até o admin ativar fiado em algum cliente ou ocorrer o primeiro crédito.
- Após o deploy: rodar a auditoria de integridade financeira e conferir que nada mudou nas OS existentes.

## 13. Deixado ao builder

- Nomes exatos de rotas/serviços e divisão em arquivos (seguir padrão `domain/` + `services/` + `routes/`).
- Forma do split de pagamento da venda avulsa (9.4), respeitando as regras listadas.
- Layout fino dos modais e do extrato impresso.
- Ordem das fases de entrega (sugestão: 1) forma de pagamento + relatórios/fechamento; 2) Crédito Loja + redução de OS; 3) fiado + contas a receber; 4) cobrança, extrato, acerto).
