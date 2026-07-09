# Auditoria Termonuclear - 2026-06-19

## Escopo

Auditoria read-only do Sistema Arte e Molduras, com seis agentes paralelos e
validação direta dos achados mais graves.

Frentes revisadas:

- segurança de backend, autenticação, autorização e dados sensíveis;
- integridade financeira, caixa, OS, clientes, produtos e propostas;
- NF-e, XML, numeração, CC-e, cancelamento e inutilização;
- frontend, permissões, privacidade e fluxos operacionais;
- banco, migrations, backups, CI, deploy e escalabilidade;
- WhatsApp, impressão e integrações locais.

Régua aplicada: revisão termonuclear de qualidade. Achados estruturais foram
tratados como risco operacional quando aumentam a chance de divergência de
dados, regressão fiscal ou falha silenciosa.

## Resumo executivo

O sistema tem controles importantes e a suíte atual passa, mas há invariantes
críticas protegidas apenas por caminhos específicos da aplicação. Os maiores
riscos estão em:

1. estados fiscais incertos tratados como rejeição definitiva;
2. edição de caixa capaz de reabrir saldo de OS entregue;
3. persistência fiscal parcial e não idempotente;
4. regras financeiras duplicadas e já divergentes;
5. migrations e reparos de produção executados em modo best-effort;
6. filas e jobs locais sem lease, lock ou recuperação robusta;
7. módulos gigantes concentrando regras sensíveis.

## Achados críticos

### C1. Timeout de emissão NF-e libera o lock enquanto a SEFAZ ainda pode responder

Evidência:

- `backend/routes/nfe.js:743-751`
- `backend/routes/nfe.js:805-819`

O guard timeout altera `nfe_status` de `emitindo` para `rejeitado`. A chamada
SEFAZ não é cancelada e pode concluir depois. Como o lock local depende do
status `emitindo`, uma nova requisição pode reemitir ou consumir outro número
enquanto a tentativa original ainda existe.

Impacto:

- duplicidade ou incerteza de emissão;
- quebra de sequência fiscal;
- UI informa rejeição sem retorno fiscal definitivo;
- estado local pode divergir da SEFAZ.

Correção estrutural:

- criar tentativa fiscal persistida com estados `processando`, `incerto`,
  `autorizado` e `rejeitado`;
- usar chave idempotente por OS/operação;
- timeout HTTP deve virar `incerto`, nunca `rejeitado`;
- reconciliar tentativa por consulta ou worker antes de permitir reenvio.

### C2. Numeração NF-e pode ser devolvida em retorno vazio ou desconhecido

Evidência:

- `backend/routes/nfe.js:172-195`
- `backend/routes/nfe.js:850-856`
- `backend/routes/nfe.js:896-905`

`rejeicaoPermiteDevolverNumeroNFe()` usa blacklist. Todo `cStat` que não esteja
em uma lista curta, inclusive vazio ou desconhecido, permite reduzir
`nfe_sequencias`.

Impacto:

- reutilização de número que pode ter sido recebido pela SEFAZ;
- sequência fiscal inconsistente;
- risco de duplicidade e necessidade de inutilização/reconciliação manual.

Correção estrutural:

- usar allowlist estrita de falhas comprovadamente anteriores à transmissão ou
  rejeições definitivas que permitam reuso;
- retorno vazio/desconhecido deve virar `incerto`;
- reservar número na tentativa fiscal e nunca reduzi-lo sem prova inequívoca.

### C3. Edição de lançamento pode reabrir saldo de OS entregue

Evidência:

- `backend/routes/caixa.js:131-179`
- proteção existente somente na exclusão em `backend/routes/caixa.js:185-210`

`PUT /api/caixa/:id` permite reduzir o valor de um pagamento pago ou remover seu
`ordemid`. Não há a validação existente no `DELETE` para impedir que uma OS
`Entregue` volte a ter saldo.

Impacto:

- OS permanece `Entregue` com saldo aberto;
- contas a receber, impressão e relatórios ficam inconsistentes;
- a regra "entrega exige saldo zero" é quebrada por uma rota lateral.

Correção estrutural:

- centralizar criação, edição e exclusão de pagamentos de OS em um serviço;
- calcular o saldo projetado das OS antiga e nova dentro da mesma transação;
- bloquear redução/desvinculação em OS entregue, salvo fluxo explícito de
  reabertura/estorno.

## Achados altos

### H1. JSON pode ser armazenado como XML fiscal legal

Evidência:

- `backend/routes/nfe.js:155-159`
- `backend/routes/nfe.js:931-956`

`serializarXmlFiscal()` usa `JSON.stringify()` quando não encontra XML. O fluxo
autorizado grava esse resultado em `nfe_xml` e em arquivo `.xml`.

Impacto:

- NF-e marcada como autorizada sem XML legal real;
- quebra de DANFE, download e guarda documental;
- falsa sensação de conformidade fiscal.

Correção:

- exigir conteúdo XML válido, começando por markup XML esperado;
- autorização sem XML deve ficar em estado de recuperação, não sucesso normal;
- implementar recuperação/reconciliação do XML autorizado.

### H2. Persistência pós-SEFAZ é parcial e falhas são engolidas

Evidência:

- `backend/routes/nfe.js:292-330`
- `backend/routes/nfe.js:935-968`
- `backend/routes/nfe.js:1112-1128`

Atualização da OS, cliente, evento fiscal e arquivo em disco são passos soltos.
`salvarXmlDisco()` e `registrarEventoFiscal()` capturam erro e continuam.

Impacto:

- autorização/cancelamento/CC-e sem trilha completa;
- status atualizado sem evento;
- resposta de sucesso com arquivo ausente;
- resposta 500 depois de a SEFAZ já ter aceitado a operação.

Correção:

- transação DB obrigatória para estado fiscal, XML em banco e evento;
- arquivo em disco deve ser projeção recuperável, com retry e alerta;
- falha posterior à SEFAZ deve gerar estado `incerto`/`pendente_auditoria`.

### H3. CC-e e cancelamento não têm idempotência ou lock persistente

Evidência:

- `backend/routes/nfe.js:1029-1046`
- `backend/routes/nfe.js:1153-1205`

A CC-e usa `MAX(nseqevento)+1` sem reserva ou constraint única. Cancelamento e
CC-e respondem timeout sem registrar tentativa incerta.

Impacto:

- duas CC-e com a mesma sequência;
- cancelamento duplicado;
- reenvio cego de evento que pode ter sido aceito;
- divergência entre banco e SEFAZ.

Correção:

- reservar evento antes da transmissão;
- unique index em `(chave, tipo, nseqevento)`;
- estado persistido por tentativa;
- timeout vira `incerto`, com bloqueio de reenvio até reconciliação.

### H4. Saldo de OS está duplicado e já divergiu

Evidência:

- regra canônica: `backend/domain/financeiroRules.js:10-29`
- duplicações: `backend/routes/ordens.js:43-48`
- `backend/routes/financeiro.js:97-109`
- `backend/routes/pdf.js:10-23`

`pdf.js` filtra `l.valor > 0`, enquanto o helper canônico inclui valores
negativos/estornos.

Impacto:

- impressão, listagem, contas a receber e entrega podem discordar;
- regra financeira muda em um lugar e fica antiga nos demais.

Correção:

- criar projeção financeira canônica para uma OS e para consultas em lote;
- remover todo cálculo inline de saldo das rotas e impressões.

### H5. Migrations escondem qualquer erro e não possuem ledger

Evidência:

- `backend/database.js:356-597`

Todas as migrations são executadas em sequência e qualquer exceção é ignorada
por `catch (_) {}`. Não há tabela de versão/checksum.

Impacto:

- aplicação sobe com schema parcial;
- erro real é indistinguível de "coluna já existe";
- ambientes podem ter schemas diferentes sem sinal operacional.

Correção:

- criar `schema_migrations` com id, checksum e data;
- verificar pré-condições com `PRAGMA`;
- ignorar somente erros idempotentes esperados;
- falhar o boot em erro inesperado.

### H6. O boot altera dados de produção repetidamente

Evidência:

- `backend/database.js:688-710`

O startup converte `Recebido -> Aguardando`, `Cancelada -> Cancelado` e corrige
tipos de lançamentos a cada inicialização.

Impacto:

- reparo histórico vira comportamento permanente;
- mudanças não têm auditoria de execução;
- restart do serviço também é uma mutação de dados.

Correção:

- mover reparos para migrations únicas e registradas;
- remover mutações de dados recorrentes do boot.

### H7. Redação de dados da oficina usa blacklist sobre `SELECT o.*`

Evidência:

- `backend/routes/ordens.js:35-52`
- `backend/routes/ordens.js:207-240`
- `backend/routes/ordens.js:287-348`

Novas colunas de `ordens` são expostas por padrão e só ficam protegidas se forem
manualmente adicionadas à lista de remoção.

Impacto:

- nova coluna financeira, fiscal ou pessoal pode vazar para `oficina`;
- segurança depende de memória do desenvolvedor.

Correção:

- DTO allowlist por role;
- read model separado para oficina;
- endpoints especializados em vez de resposta ampla.

### H8. Resolução de cliente pode usar registro excluído ou homônimo errado

Evidência:

- `backend/routes/ordens.js:74-90`
- `backend/routes/ordens.js:377-386`
- `backend/routes/ordens.js:512-521`

As buscas por nome usam `LIMIT 1` e não filtram `deletedat IS NULL`.

Impacto:

- telefone/CPF de cliente excluído pode ser copiado para nova OS;
- dois clientes com o mesmo nome podem ser misturados.

Correção:

- filtrar somente clientes ativos;
- quando houver ambiguidade, exigir `clienteid`;
- mover resolução para serviço/repositório canônico.

### H9. Aviso WhatsApp pode ficar preso para sempre em `enviando`

Evidência:

- `backend/utils/whatsappWorker.js:13-30`
- `backend/utils/whatsappQueue.js:24-49`

Depois do claim, `provider.getStatus()` roda fora do `try`. Se lançar erro, o
item permanece `auto_status='enviando'`, mas a consulta da fila só busca
`pendente`, `erro` e `aguardando_conexao`.

Impacto:

- aviso desaparece da fila sem envio nem retry;
- operador não recebe sinal claro da perda.

Correção:

- outbox com lease e recuperação de claims expirados;
- tratar `getStatus()` e `sendText()` no mesmo bloco pós-claim;
- converter falha em estado recuperável com próxima tentativa.

### H10. Banco não reforça invariantes críticas

Evidência:

- `backend/database.js:35-140`
- `backend/database.js:352-354`

`foreign_keys=ON` está ativo, mas tabelas centrais não declaram FKs. Status,
`pago`, tipos e vários valores não possuem `CHECK`.

Impacto:

- scripts, repairs ou novas rotas podem gravar estados impossíveis;
- itens, logs e lançamentos órfãos dependem apenas da disciplina do código.

Correção:

- plano de rebuild SQLite com FKs e `ON DELETE` explícito;
- `CHECK`/triggers para status, booleanos e valores;
- testes de migração com dados legados.

### H11. `whatsapp-service` possui vulnerabilidades runtime conhecidas

Resultado de `npm audit --omit=dev`:

- alta: `form-data@4.0.5`, GHSA-hmw2-7cc7-3qxx;
- moderada: `protobufjs@7.6.2`, GHSA-f38q-mgvj-vph7.

Cadeia:

- `@whiskeysockets/baileys@6.7.23 -> axios -> form-data`;
- `@whiskeysockets/baileys@6.7.23 -> protobufjs`.

Correção:

- atualizar lock/dependências transitivas com `npm audit fix` validado;
- repetir testes do serviço e pareamento/sessão em ambiente controlado.

### H12. CI e deploy não cobrem o serviço WhatsApp

Evidência:

- `.github/workflows/ci.yml:15-48`
- `.github/workflows/deploy.yml:95-133`

CI testa apenas backend. Deploy sincroniza frontend e backend, mas não
`whatsapp-service`, suas dependências ou restart do processo PM2.

Impacto:

- serviço local pode ficar em versão antiga;
- contrato backend/WhatsApp pode divergir;
- vulnerabilidades e regressões não bloqueiam merge/deploy.

Correção:

- job de teste/audit do frontend e WhatsApp no CI;
- sincronização, instalação e restart controlado do WhatsApp no deploy;
- preservar `.env`, `sessions` e `node_modules` conforme runbook.

### H13. Impressão direta altera estado global do Windows sem lock/finally

Evidência:

- `backend/utils/print/serverPrinter.js:128-143`
- restauração somente no caminho feliz em `backend/utils/print/serverPrinter.js:248-253`

Impacto:

- falha pode deixar impressora padrão errada;
- duas impressões concorrentes disputam estado global;
- job de outro processo pode sair na impressora incorreta.

Correção:

- fila serial de impressão;
- `try/finally` no PowerShell para restauração e limpeza;
- preferir impressão para destino explícito sem alterar default global.

### H14. Backup/offsite não tem timeout nem exclusão mútua

Evidência:

- `backend/utils/oracleObjectStorage.js:137-153`
- `backend/database.js:757-796`

`https.request()` não define timeout. Backups agendado e manual podem executar
simultaneamente e o nome do arquivo tem precisão de segundo.

Impacto:

- request/rotina pode ficar pendurado;
- duas execuções disputam arquivo, rotação e status;
- backup local fica acoplado à latência do offsite.

Correção:

- timeout e cancelamento de request;
- mutex/fila de backup;
- nome com UUID/milissegundos;
- backup local deve concluir independentemente do retry offsite.

## Regressões estruturais e hotspots

Arquivos acima de 1.000 linhas:

| Linhas | Arquivo |
|---:|---|
| 2.570 | `frontend/src/styles/global.css` |
| 1.676 | `frontend/src/pages/Configuracoes.jsx` |
| 1.419 | `frontend/src/pages/Atendimento.jsx` |
| 1.322 | `backend/routes/nfe.js` |
| 1.288 | `frontend/src/pages/NotasFiscais.jsx` |
| 1.092 | `frontend/src/pages/Orcamento.jsx` |

Outros módulos de alto acoplamento:

- `backend/database.js`: 812 linhas;
- `backend/routes/ordens.js`: 724 linhas;
- `backend/routes/configuracoes.js`: 740 linhas;
- `frontend/src/pages/Oficina.jsx`: 739 linhas;
- `frontend/src/pages/OrdemDetalhe.jsx`: 715 linhas.

O problema não é apenas a contagem. Esses arquivos misturam state machines,
persistência, regra financeira/fiscal, autorização, I/O externo e renderização.
As extrações prioritárias são:

- `NfeEmissionService`, `NfeEventService`, `NfeSequenceService`,
  `NfeXmlRepository`;
- `OrdemService`, `OrdemStatusService`, `OrdemFinanceiroService`,
  `OrdemReadModel`, `ClienteResolver`;
- routers separados de configuração fiscal, WhatsApp, impressão e backup;
- hooks/componentes por painel nas telas gigantes;
- módulo frontend canônico de status e permissões.

## Achados médios relevantes

1. `frontend/src/context/AuthContext.jsx:36-38` define `isOficina` como oficina
   ou admin, e `OrdemDetalhe.jsx:101` usa isso como contexto de tela. Admin em
   `/ordens/:id` é tratado como oficina.
2. `backend/routes/produtos.js:35-90` aceita preço e estoque negativos.
3. `backend/routes/propostas.js:176-238` duplica criação de OS em vez de usar
   um caso de uso único.
4. Validação de saldo antes de entregar ocorre fora da transação em caminhos de
   `backend/routes/ordens.js`.
5. `backend/__tests__/financeiroRules.test.js` copia o helper e usa schema
   diferente do módulo real, criando falsa confiança.
6. Telas especializadas consomem `/ordens` amplo e filtram no cliente.
7. `Clientes.jsx` e `Dashboard.jsx` ainda conhecem o status legado `Recebido`.
8. `frontend/src/services/api.js:34-40` ignora `skipGlobalErrorToast` em 403.
9. `NotasFiscais.jsx:1259-1263` mostra ação admin-only para usuário caixa.
10. URL do WhatsApp local é validada apenas como não vazia, permitindo SSRF
    persistente por configuração administrativa.
11. Algumas rotas devolvem `e.message` diretamente e contornam o
    `errorHandler`.
12. NF-e possui `cUF='31'` hardcoded e builder com CPF fictício como fallback.
13. Alterar configuração WhatsApp não recarrega o worker até restart.
14. Mudança de status e intenção de aviso WhatsApp não são atômicas.
15. Backup offsite monta banco, ZIP e criptografia inteiros em memória.
16. `backend/package.json` aponta `migrate` para arquivo inexistente.
17. `ORDEM_PRINTER_NAME` funciona como fallback, não override real.
18. Fluxos de WhatsApp e impressão são duplicados entre páginas frontend.

## Verificações executadas

Em 2026-06-19:

- backend: 56 arquivos, 398 testes passando;
- frontend: 2 arquivos, 13 testes passando;
- WhatsApp service: 5 arquivos, 19 testes passando;
- frontend: build Vite concluído;
- `npm audit --omit=dev`:
  - raiz: 0 vulnerabilidades;
  - backend: 0 vulnerabilidades;
  - frontend: 0 vulnerabilidades;
  - WhatsApp service: 2 vulnerabilidades runtime.

As suítes atuais não cobrem os cenários críticos listados acima. Em especial,
não há teste de:

- `PUT /api/caixa/:id` reduzindo/desvinculando pagamento de OS entregue;
- timeout SEFAZ seguido de resposta tardia;
- concorrência de emissão, CC-e ou cancelamento;
- retorno autorizado sem XML real;
- `provider.getStatus()` falhando depois do claim da fila;
- duas impressões ou dois backups simultâneos;
- migration inesperada falhando no boot.

## Controles positivos observados

- cookie HttpOnly e `withCredentials`;
- auth revalida usuário ativo/role;
- CORS, CSRF e rate limits estão montados;
- não foi encontrado JWT em `localStorage`;
- SQL revisado usa parâmetros;
- lixeira fiscal bloqueia autorizadas/canceladas;
- inutilização tem confirmação backend e estado `incerto`;
- senha do certificado pode ser criptografada com AES-GCM;
- deploy exclui `data`, `certs`, `.env` e bancos;
- PM2 está em fork com uma instância;
- upload do certificado é admin-only, limitado e usa filename fixo.

## Ordem de correção recomendada

### Fase 0 - impedir corrupção/estado fiscal incerto

1. Corrigir C1, C2 e C3.
2. Corrigir H1, H2 e H3.
3. Adicionar testes de regressão antes de refatorar os arquivos gigantes.

### Fase 1 - consolidar invariantes

1. Unificar saldo de OS.
2. Criar serviço transacional de pagamentos e status.
3. Substituir blacklist da oficina por allowlist.
4. Corrigir resolução de cliente e guardrails do schema.
5. Corrigir fila WhatsApp com lease/reclaim.

### Fase 2 - operação e supply chain

1. Atualizar dependências vulneráveis do WhatsApp.
2. Incluir frontend e WhatsApp no CI/deploy.
3. Implementar locks/timeouts de impressão e backup.
4. Versionar migrations e remover reparos do boot.

### Fase 3 - decomposição termonuclear

1. Extrair serviços fiscais e de OS.
2. Dividir telas acima de 1.000 linhas.
3. Centralizar status, permissões, impressão e WhatsApp no frontend.
4. Criar read models estreitos por fluxo operacional.

## Lacunas externas ao repositório

Não foram validados:

- ACLs NTFS de banco, certificados, XMLs e sessões;
- `.env` e segredos reais de produção;
- restore real de backup local/offsite;
- bucket Oracle;
- tarefa Windows `PM2-DeployRestart`;
- concorrência no Windows Server;
- homologação SEFAZ com timeout/retry;
- sessão WhatsApp e falhas reais de rede.
