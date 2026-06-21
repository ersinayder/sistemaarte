# Fase 0 - Integridade Fiscal e Financeira

## Contexto

A auditoria termonuclear de 2026-06-19 identificou riscos capazes de produzir
divergência entre o Sistema Arte e a SEFAZ ou quebrar a regra financeira de uma
OS entregue:

- timeout de emissão tratado como rejeição definitiva;
- devolução de numeração fiscal para retornos vazios ou desconhecidos;
- autorização local sem XML fiscal real;
- persistência parcial depois de uma resposta da SEFAZ;
- ausência de idempotência persistente para uma emissão em andamento ou
  incerta;
- edição de lançamento capaz de deixar uma OS `Entregue` com saldo positivo.

Esta fase corrige somente esses riscos críticos. Migrações versionadas gerais,
consolidação de todos os cálculos financeiros, CC-e, cancelamento, WhatsApp,
impressão, backup, CI e decomposição completa dos módulos pertencem às fases
seguintes.

## Objetivos

1. Nunca classificar como rejeitada uma emissão cujo resultado fiscal seja
   desconhecido.
2. Nunca permitir nova emissão enquanto existir tentativa `processando` ou
   `incerto` para a mesma OS.
3. Nunca devolver um número de NF-e sem prova explícita de que ele pode ser
   reutilizado.
4. Nunca concluir uma autorização local sem XML fiscal real persistido no
   banco.
5. Manter estado fiscal, XML e evento obrigatório atomicamente consistentes no
   SQLite.
6. Nunca permitir que uma edição de lançamento deixe uma OS `Entregue` com
   saldo positivo.

## Não objetivos

- Criar reconciliação automática completa com a SEFAZ.
- Criar fluxo de reabertura ou estorno de OS entregue.
- Refatorar integralmente `backend/routes/nfe.js`.
- Resolver nesta fase idempotência de CC-e e cancelamento.
- Tornar arquivos XML em disco parte da transação do SQLite.
- Ativar múltiplas instâncias PM2 ou cluster.

## Abordagem

Será usado endurecimento incremental, com pequenos módulos canônicos e
alterações localizadas nas rotas atuais. A solução evita uma refatoração fiscal
completa durante a correção emergencial, mas cria limites claros para que a
extração futura de serviços não replique regras sensíveis.

O SQLite continua como fonte de verdade. O arquivo XML em disco é uma projeção
recuperável. O estado persistido no banco sempre prevalece sobre respostas HTTP
interrompidas ou arquivos ausentes.

## Modelo de tentativa fiscal

Uma nova tabela persistirá tentativas de emissão. Cada registro deverá conter,
no mínimo:

- identificador;
- `ordemid`;
- operação, inicialmente `emissao`;
- chave idempotente;
- número e série reservados;
- lote, quando disponível;
- estado;
- código e motivo da SEFAZ, quando disponíveis;
- XML de envio e XML de retorno/autorização, quando disponíveis;
- descrição sanitizada do erro local;
- timestamps de criação e atualização.

Estados permitidos nesta fase:

- `processando`: transmissão iniciada e ainda sem resultado conclusivo;
- `incerto`: não existe prova suficiente para classificar o resultado;
- `autorizado`: autorização confirmada e XML fiscal real persistido;
- `rejeitado`: rejeição fiscal definitiva e conhecida;
- `falha_local`: falha comprovadamente anterior à transmissão.

Uma constraint ou índice único impedirá mais de uma tentativa ativa de emissão
por OS. Para essa regra, `processando` e `incerto` são estados ativos.

Tentativas antigas não serão inferidas retroativamente a partir de texto de
erro. A migração cria a estrutura sem reclassificar histórico fiscal.

## Componentes

### `nfeEmissionRules`

Módulo puro responsável por:

- classificar resposta fiscal como conclusiva ou incerta;
- decidir se uma numeração pode ser devolvida;
- reconhecer estados que bloqueiam nova emissão;
- impedir que retorno vazio, código desconhecido ou timeout seja interpretado
  como rejeição definitiva.

A devolução de número usa allowlist estrita. Ausência de código ou código não
catalogado sempre resulta em retenção da numeração e estado `incerto`.

Falhas locais comprovadamente anteriores à chamada da SEFAZ podem liberar a
numeração sem depender de `cStat`.

### `nfeXmlRules`

Módulo puro responsável por validar o conteúdo fiscal persistido. Para uma
autorização normal, o conteúdo deverá:

- ser string não vazia;
- ser XML, e não JSON serializado;
- conter a estrutura fiscal esperada de autorização;
- corresponder à chave fiscal autorizada quando a chave estiver disponível.

Não haverá fallback para `JSON.stringify()`. Autorização sem XML legal passa
para `incerto` e exige recuperação operacional.

### `nfeAttemptRepository`

Responsável exclusivamente por criar, consultar e atualizar tentativas fiscais.
As rotas não deverão montar SQL de tentativa diretamente.

Operações mínimas:

- criar tentativa `processando`;
- consultar tentativa ativa por OS e operação;
- concluir como `autorizado`, `rejeitado`, `incerto` ou `falha_local`;
- armazenar dados de auditoria sem expor segredos ou stack traces.

### `nfePersistenceService`

Responsável pela transação SQLite depois de uma resposta conclusiva. Em uma
autorização, a mesma transação deverá:

- atualizar a OS com estado, chave, protocolo, número, série e XML;
- persistir o estado final da tentativa;
- registrar o evento fiscal obrigatório;
- aplicar atualizações auxiliares obrigatórias que hoje fazem parte da
  conclusão da emissão.

Se qualquer gravação obrigatória falhar, a transação inteira será revertida. A
tentativa deverá permanecer ou ser marcada como `incerto`, pois a resposta da
SEFAZ pode já ter sido conclusiva mesmo que o banco local tenha falhado.

A gravação do arquivo `.xml` ocorre somente depois do commit. Falha nessa
projeção não desfaz a autorização persistida; deve ser registrada e permitir
recuperação posterior.

### `ordemPagamentoRules`

Módulo puro responsável por determinar quais OS são afetadas por uma edição de
lançamento e se o saldo projetado viola o estado `Entregue`.

Deverá considerar:

- OS anteriormente vinculada;
- nova OS vinculada;
- alteração de valor;
- alteração de `pago`;
- desvinculação;
- soft delete;
- lançamentos negativos e estornos;
- arredondamento monetário em centavos.

O cálculo final continuará compatível com
`getResumoFinanceiroOS()`: somente lançamentos `pago=1` e não excluídos entram
no recebido, e o saldo nunca é menor que zero.

## Fluxo de emissão

1. A rota valida OS, configuração, itens e dados fiscais antes da transmissão.
2. O número é reservado.
3. Uma tentativa `processando` é criada antes de chamar a SEFAZ.
4. Se já existir tentativa ativa, a API responde `409` sem transmitir.
5. A chamada externa é executada.
6. Autorização com XML válido é persistida atomicamente como `autorizado`.
7. Rejeição definitiva conhecida é persistida como `rejeitado`.
8. Timeout, retorno vazio, código desconhecido, resposta inconsistente ou
   autorização sem XML válido resultam em `incerto`.
9. Falha comprovadamente anterior à transmissão resulta em `falha_local`.
10. A numeração só é devolvida em `falha_local` ou em rejeição incluída
    explicitamente na allowlist segura.
11. A projeção do XML em disco ocorre depois da persistência obrigatória.

Uma resposta tardia não poderá reabrir automaticamente uma requisição HTTP já
encerrada. Ela também não poderá mudar um estado final mais recente sem conferir
a identidade da tentativa. O resultado tardio deverá ser persistido apenas pela
mesma tentativa e de forma monotônica: `autorizado` nunca volta para
`rejeitado`, e `incerto` somente muda mediante evidência fiscal conclusiva.

## Fluxo de edição do caixa

`PUT /api/caixa/:id` executará leitura, projeção, validação e atualização na
mesma transação SQLite.

1. Carregar o lançamento atual.
2. Identificar a OS anterior e a nova OS.
3. Calcular o recebido projetado de cada OS afetada como se a edição já tivesse
   ocorrido.
4. Consultar o estado atual dessas OS.
5. Se alguma OS `Entregue` terminar com saldo positivo, abortar com `409`.
6. Caso todas as invariantes sejam preservadas, atualizar o lançamento e
   concluir a transação.

São bloqueados, quando reabrem saldo:

- redução do valor pago;
- mudança de `pago=1` para `pago=0`;
- desvinculação da OS;
- troca do vínculo para outra OS;
- alteração que remova o efeito de um estorno compensatório.

Uma edição continua permitida quando todas as OS `Entregue` afetadas permanecem
com saldo zero. Não será criado bypass administrativo nesta fase.

## Contratos HTTP

- Segunda emissão bloqueada por tentativa ativa: `409`.
- Emissão com resultado incerto: resposta não conclusiva, com `409` e mensagem
  operacional para consultar/reconciliar antes de reenviar.
- Edição de caixa que viola OS entregue: `409`.
- Erros internos continuam passando pelo `errorHandler`, sem retornar SQL,
  paths, stack traces ou segredos.

As mensagens devem explicar o próximo passo sem afirmar rejeição fiscal quando
o estado for desconhecido.

## Concorrência e idempotência

A garantia principal será persistente no SQLite, não apenas baseada em
`nfe_status` da OS ou variável em memória.

- A criação da tentativa e a reserva do número devem ocorrer em transação.
- A unicidade da tentativa ativa resolve concorrência entre duas requisições no
  processo atual e prepara o sistema para workers futuros.
- A chave idempotente identifica a combinação de OS, operação e tentativa.
- Atualizações finais devem conferir o identificador da tentativa.
- PM2 permanece em modo `fork` com uma instância nesta fase.

## Migração

A nova estrutura entra no array `migrations[]` de `backend/database.js`,
seguindo o padrão atual e sem recriar tabelas existentes. A migração deverá usar
`CREATE TABLE IF NOT EXISTS` e índices compatíveis com SQLite.

Esta fase não implementa ainda o ledger geral `schema_migrations`; esse trabalho
fica separado para evitar misturar a correção fiscal emergencial com a reforma
de todas as migrations.

## Observabilidade e recuperação

Cada transição de tentativa deverá registrar:

- tentativa e OS;
- estado anterior e novo;
- código fiscal conhecido;
- motivo sanitizado;
- instante da transição.

Não registrar senha de certificado, conteúdo de certificado, token, cookie ou
chave de API.

Estados `incerto` deverão ficar visíveis na consulta fiscal existente ou em
resposta compatível com a tela atual. A Fase 0 não exige uma nova tela completa,
mas não poderá esconder a incerteza como `rejeitado`.

## Testes

O desenvolvimento será feito por TDD. Cada comportamento deverá ter teste que
falha antes da implementação.

### Regras fiscais

- timeout resulta em `incerto`;
- retorno vazio resulta em `incerto`;
- código desconhecido resulta em `incerto`;
- somente códigos da allowlist devolvem numeração;
- falha local pré-transmissão pode devolver numeração;
- autorização sem XML real não conclui como autorizada;
- JSON não é aceito como XML;
- XML de outra chave não é aceito;
- estados ativos bloqueiam nova emissão;
- estado final não sofre regressão.

### Integração de emissão

- duas emissões concorrentes produzem uma transmissão e um `409`;
- timeout seguido de resposta tardia não permite segunda emissão;
- falha obrigatória de persistência reverte a transação;
- autorização persiste OS, tentativa, XML e evento atomicamente;
- falha ao gravar arquivo em disco preserva a autorização no banco;
- erro incerto não devolve número.

### Caixa e OS

- reduzir pagamento de OS entregue é bloqueado;
- mudar `pago` para falso é bloqueado;
- desvincular pagamento é bloqueado;
- trocar pagamento de OS é bloqueado quando reabre saldo da OS anterior;
- edição é permitida quando a OS entregue continua quitada;
- OS não entregue pode ter saldo alterado;
- as duas OS são validadas quando o vínculo muda;
- lançamento negativo e arredondamento em centavos mantêm compatibilidade com a
  regra canônica.

### Regressão

- suíte completa do backend;
- testes do frontend;
- build do frontend;
- testes do `whatsapp-service`;
- `npm audit --omit=dev` em cada pacote relevante, registrando separadamente
  vulnerabilidades já conhecidas do serviço WhatsApp.

## Critérios de aceitação

A Fase 0 está concluída quando:

1. nenhuma emissão incerta é marcada como rejeitada;
2. uma tentativa ativa impede retransmissão concorrente ou manual;
3. número fiscal só retorna por allowlist ou falha local pré-transmissão;
4. autorização sem XML real não é apresentada como sucesso normal;
5. estado fiscal obrigatório é transacional no SQLite;
6. falha de arquivo em disco não perde autorização persistida;
7. nenhuma edição do caixa deixa OS `Entregue` com saldo positivo;
8. todos os testes novos e as suítes de regressão passam;
9. as alterações não modificam o fluxo deliberado de resolução de cliente por
   nome nem as transições canônicas de status de OS.

## Sequência de implementação

1. Regras puras de classificação fiscal, XML e devolução de número.
2. Persistência de tentativa fiscal e proteção concorrente.
3. Integração segura do fluxo de emissão e persistência atômica.
4. Regra projetada de pagamento e transação do caixa.
5. Testes de integração, regressão e revisão termonuclear final.
