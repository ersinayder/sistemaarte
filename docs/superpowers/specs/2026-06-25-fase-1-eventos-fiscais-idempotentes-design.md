# Fase 1 - Eventos Fiscais Idempotentes

## Contexto

A Fase 0 tornou a emissao de NF-e idempotente, auditavel e resistente a
timeouts. CC-e e cancelamento continuam em rotas longas dentro de
`backend/routes/nfe.js`, com `guardTimeout` local, transmissao direta para a
SEFAZ e persistencia direta em `nfe_eventos` e `ordens`.

Esses eventos fiscais nao consomem numeracao de NF-e, mas podem gerar efeito
legal irreversivel na SEFAZ. Por isso, timeout, retorno vazio ou falha de
persistencia nao podem ser tratados como simples erro local que permite repetir
a operacao cegamente.

## Objetivos

1. Bloquear retransmissao de CC-e ou cancelamento enquanto houver tentativa
   `processando` ou `incerto` para a mesma chave, tipo e sequencia.
2. Persistir tentativa e transicoes de evento fiscal antes da transmissao.
3. Classificar timeout, retorno vazio, erro de comunicacao e resposta
   desconhecida como `incerto`.
4. Persistir evento autorizado/rejeitado de forma transacional.
5. Manter cancelamento atomico entre `ordens` e `nfe_eventos`.
6. Nao expor detalhes internos de excecao em respostas HTTP.

## Nao Objetivos

- Criar consulta automatica de reconciliacao com a SEFAZ.
- Alterar UI da tela `/nfe`.
- Refatorar integralmente `backend/routes/nfe.js`.
- Alterar regras legais de prazo, limite de CC-e ou permissao por role.
- Reprocessar historico fiscal antigo.

## Abordagem

Sera criado um fluxo persistente para eventos fiscais, separado de
`nfe_emissao_tentativas`. A emissao possui numero, serie e lote de NF-e; eventos
possuem chave, tipo, sequencia, payload e resposta. Separar as tabelas evita
misturar regras de numeracao com eventos posteriores.

As rotas de CC-e e cancelamento permanecerao como adaptadores HTTP: validam
entrada, carregam OS e configuracao fiscal, montam dependencias e delegam a
servicos testaveis.

## Modelo de tentativa de evento

Nova tabela: `nfe_evento_tentativas`.

Campos principais:

- `id`;
- `ordemid`;
- `chave`;
- `tipo`: `cce` ou `cancelamento`;
- `nseqevento`;
- `idempotency_key`;
- `status`: `processando`, `incerto`, `autorizado`, `rejeitado`, `falha_local`;
- `cstat`, `motivo`, `protocolo`;
- `payload_json`;
- `xml_retorno`;
- `erro_local`;
- `solicitado_por`;
- `createdat`, `updatedat`, `concluido_em`.

Uma unique partial index bloqueara mais de uma tentativa ativa para
`chave + tipo + nseqevento`.

Nova tabela: `nfe_evento_transicoes`.

Ela registra estado anterior, estado novo, `cstat`, motivo e timestamp de cada
mudanca.

## Componentes

### `nfeEventoRules`

Modulo puro para:

- reconhecer estados ativos;
- classificar retorno de evento fiscal;
- identificar sucesso de CC-e e cancelamento (`cStat` 135 e 155, conforme o
  evento);
- tratar retorno desconhecido como `incerto`.

### `nfeEventoAttemptRepository`

Repositorio SQLite para:

- criar tentativa `processando`;
- buscar tentativa ativa;
- transicionar com monotonicidade;
- registrar historico.

### `nfeEventoService`

Servico injetavel para:

- criar tentativa antes da transmissao;
- montar timeout logico que marca `incerto` sem cancelar a promise tardia;
- persistir resultado autorizado/rejeitado;
- manter cancelamento de OS e evento fiscal na mesma transacao;
- gravar XML em disco apenas depois do commit.

## Fluxos

### CC-e

1. Rota valida chave, texto, certificado, OS autorizada, prazo e limite de 20
   cartas.
2. Servico cria tentativa `processando` para a sequencia calculada.
3. SEFAZ autoriza com `cStat=135`: transacao insere `nfe_eventos` tipo `cce` e
   conclui tentativa como `autorizado`.
4. SEFAZ rejeita com `cStat` conhecido: transacao conclui como `rejeitado` e
   registra evento operacional de rejeicao somente se houver utilidade para
   auditoria local.
5. Timeout ou erro de comunicacao: tentativa vira `incerto` e nova CC-e da mesma
   sequencia fica bloqueada ate reconciliacao manual futura.

### Cancelamento

1. Rota valida chave, motivo, certificado, OS autorizada, protocolo e prazo.
2. Servico cria tentativa `processando` para `tipo=cancelamento`, `nseqevento=1`.
3. SEFAZ autoriza com `cStat=135` ou `155`: transacao atualiza `ordens` para
   `nfe_status='cancelado'`, grava dados de cancelamento, insere `nfe_eventos`
   tipo `cancelamento` e conclui tentativa.
4. Rejeicao conhecida conclui tentativa como `rejeitado`.
5. Timeout ou resultado desconhecido vira `incerto` e bloqueia novo
   cancelamento cego.

## Contratos HTTP

- Tentativa ativa: `409`.
- Resultado incerto: `409`, com mensagem para consultar/reconciliar antes de
  repetir.
- Rejeicao fiscal conhecida: `422`.
- Sucesso: `200`, mantendo formato atual com `ok`, `chave`, `protocolo`,
  `dhEvento` e `cStat`.
- Erro interno: mensagem generica, sem `detalhe`, stack, path, SQL ou segredo.

## Testes

- Regras puras de classificacao de evento.
- Repositorio SQLite in-memory para tentativa ativa, transicao monotona e
  historico.
- Servico de CC-e: sucesso, rejeicao, timeout, resposta tardia e bloqueio de
  segunda tentativa.
- Servico de cancelamento: commit atomico de OS/evento/tentativa, rollback e
  bloqueio de tentativa ativa.
- Contratos estruturais das rotas removendo `guardTimeout` e transmissao direta
  do corpo HTTP.

## Criterios de Aceitacao

1. CC-e e cancelamento criam tentativa persistente antes de chamar a SEFAZ.
2. Tentativas `processando` e `incerto` bloqueiam retransmissao.
3. Timeout nao permite repetir evento fiscal cegamente.
4. Cancelamento autorizado nao pode atualizar OS sem registrar evento fiscal.
5. Falha de disco apos commit nao desfaz evento fiscal persistido.
6. Rotas nao expõem `detalhe: e.message`.
7. Suítes backend, frontend, WhatsApp, build e audits continuam passando.
