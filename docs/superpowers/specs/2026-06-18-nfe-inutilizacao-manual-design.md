# Inutilizacao Manual Segura de Numeracao NF-e

## Contexto

Em junho de 2026 ocorreu uma quebra na sequencia da NF-e, serie 1: a NF-e 279
foi autorizada, a tentativa seguinte consumiu localmente o numero 280 e foi
rejeitada por falta de IE do destinatario, e a NF-e 281 foi autorizada depois.
O diagnostico confirmou que a NF-e 280 nao foi autorizada, cancelada nem
denegada.

A inutilizacao existe para comunicar a SEFAZ sobre numeros que nao serao usados
depois de uma quebra tecnica de sequencia. O Portal Nacional da NF-e e a
clausula decima quarta do Ajuste SINIEF 7/05 estabelecem que:

- somente numeros ainda nao utilizados podem ser inutilizados;
- a solicitacao deve ser assinada com certificado digital;
- a SEFAZ devolve um protocolo de cientificacao;
- a solicitacao deve ser feita ate o decimo dia do mes subsequente.

Para a quebra ocorrida em junho de 2026, o prazo ordinario e 10 de julho de
2026.

## Objetivo

Adicionar ao Sistema Arte e Molduras uma operacao administrativa para
inutilizar manualmente:

- um unico numero; ou
- uma faixa continua de numeros.

A operacao deve ser segura, auditavel, testavel e independente de uma OS.

## Fora do Escopo

- Detectar automaticamente lacunas na numeracao.
- Transmitir inutilizacoes automaticamente.
- Corrigir ou cancelar NF-e autorizada.
- Alterar retroativamente a sequencia local `nfe_sequencias`.
- Permitir inutilizacao por usuarios `caixa` ou `oficina`.
- Inutilizar NFC-e modelo 65.
- Executar qualquer evento real durante testes automatizados.

## Abordagem Escolhida

Criar uma entidade propria `nfe_inutilizacoes`. Nao reutilizar
`nfe_eventos`, pois inutilizacao nao pertence a uma NF-e ou OS existente.

A tela de Notas Fiscais tera uma acao administrativa chamada
`Inutilizar numeracao`. O formulario permitira informar ano completo, numero
inicial, numero final e justificativa. Ambiente, CNPJ, modelo e serie serao
obtidos da configuracao fiscal e exibidos como campos somente leitura.

## Regras Fiscais e de Validacao

### Dados fixos

- Modelo: `55`.
- Ambiente: configuracao fiscal atual (`1` producao, `2` homologacao).
- CNPJ: emitente configurado, normalizado para 14 digitos.
- Serie: serie NF-e configurada.
- UF/cUF: derivada da configuracao valida do emitente.

### Dados informados

- Ano: quatro digitos na interface e persistencia; os dois ultimos digitos
  serao enviados no campo `ano` do leiaute.
- O ano deve estar entre 2006 e o ano corrente. O sistema exibira aviso quando
  a data estiver fora do prazo ordinario, mas a SEFAZ sera a autoridade final.
- Numero inicial e final: inteiros entre 1 e 999999999.
- O numero final deve ser maior ou igual ao inicial.
- A faixa pode conter no maximo 10.000 numeros.
- Justificativa: entre 15 e 255 caracteres depois de `trim`.
- A justificativa nao pode ser uma frase generica curta; a interface deve
  orientar a descrever a causa tecnica da quebra.

### Bloqueios locais

Antes da transmissao, o backend deve rejeitar:

- faixa que contenha numero presente em `ordens.nfe_numero` para a mesma serie;
- faixa sobreposta a inutilizacao local com status `processando`,
  `autorizado` ou `incerto`, no mesmo ambiente, ano, modelo e serie;
- intervalo acima do ultimo numero conhecido em `nfe_sequencias` para a serie;
- configuracao fiscal, emitente ou certificado incompletos;
- solicitacao sem confirmacao textual exata;
- usuario sem role `admin`.

O bloqueio por `ordens.nfe_numero` sera conservador e considerara qualquer
registro fiscal existente na mesma serie, independentemente de seu status. A
SEFAZ continua sendo a fonte final para detectar uso externo ou registros que
nao estejam no banco local.

### Confirmacao

O operador devera digitar:

```text
INUTILIZAR 280
```

para um numero, ou:

```text
INUTILIZAR 280-285
```

para uma faixa. O backend recalculara a frase esperada; a verificacao nao
ficara apenas no frontend.

## Persistencia

Nova tabela criada com `CREATE TABLE IF NOT EXISTS`:

```sql
CREATE TABLE IF NOT EXISTS nfe_inutilizacoes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  ambiente           INTEGER NOT NULL,
  ano                INTEGER NOT NULL,
  modelo             TEXT NOT NULL DEFAULT '55',
  serie              TEXT NOT NULL,
  numero_inicial     INTEGER NOT NULL,
  numero_final       INTEGER NOT NULL,
  justificativa      TEXT NOT NULL,
  status             TEXT NOT NULL,
  protocolo          TEXT,
  cstat              TEXT,
  motivo             TEXT,
  xml_envio          TEXT,
  xml_retorno        TEXT,
  idempotency_key    TEXT NOT NULL UNIQUE,
  solicitado_por     INTEGER,
  solicitado_em      TEXT NOT NULL,
  concluido_em       TEXT,
  createdat          TEXT DEFAULT (datetime('now','localtime'))
);
```

Indices:

- ambiente, ano, modelo e serie;
- status;
- numero inicial e numero final.

Estados locais:

- `processando`: reserva local criada antes da chamada;
- `autorizado`: SEFAZ retornou `cStat=102`;
- `rejeitado`: houve resposta fiscal definitiva sem autorizacao;
- `incerto`: timeout, falha de rede ou resposta que nao permite afirmar se a
  SEFAZ recebeu o pedido.
- `falha_local`: falha comprovadamente anterior a qualquer transmissao.

Registros nao serao apagados nem editados pela interface.

## Concorrencia e Idempotencia

Uma transacao SQLite curta deve:

1. repetir todas as verificacoes de sobreposicao;
2. inserir o registro `processando`;
3. concluir antes da chamada externa.

A chamada SEFAZ nao deve ocorrer dentro de uma transacao SQLite.

Um mutex em memoria exclusivo para inutilizacao impedira dois pedidos
simultaneos na unica instancia PM2 atual. A verificacao transacional e o
registro `processando` continuarao protegendo contra repeticao depois de
restart.

Se houver timeout ou erro de comunicacao, o registro vira `incerto`, nunca
`rejeitado`. O sistema nao oferecera reenvio cego de uma solicitacao incerta.
O operador devera consultar a SEFAZ ou usar uma futura rotina de consulta antes
de qualquer nova tentativa.

O endpoint deve aceitar uma chave idempotente gerada pelo frontend. Uma
repeticao HTTP com a mesma chave devolvera o registro existente, sem nova
transmissao.

## Integracao com nfewizard-io

A versao instalada, `nfewizard-io@1.1.0`, expoe:

```js
wizard.NFE_Inutilizacao({
  cUF,
  CNPJ,
  ano,
  mod: '55',
  serie,
  nNFIni,
  nNFFin,
  xJust,
});
```

Para preservar os documentos fiscais corretamente, a inutilizacao usara uma
instancia isolada do wizard. O adaptador de salvamento da biblioteca sera
instrumentado nessa instancia para capturar:

- XML assinado sem envelope SOAP enviado;
- XML bruto retornado pela SEFAZ.

Os XMLs tambem serao gravados em:

```text
backend/data/nfe_xmls/inut-{ambiente}-{ano}-{serie}-{inicio}-{fim}-envio.xml
backend/data/nfe_xmls/inut-{ambiente}-{ano}-{serie}-{inicio}-{fim}-retorno.xml
```

Falha ao persistir os XMLs depois de autorizacao nao deve esconder o sucesso
fiscal. Ela deve ser registrada em log de alta severidade e a resposta deve
avisar que o protocolo foi salvo, mas o arquivo em disco precisa de reparo. A
copia no banco e a copia em disco sao camadas independentes.

## API

### Previa

```text
GET /api/nfe/inutilizacoes/contexto
```

Role: `admin`.

Retorna ambiente, CNPJ mascarado, modelo, serie, ano sugerido, ultimo numero da
sequencia e frase sobre o prazo legal.

### Listagem

```text
GET /api/nfe/inutilizacoes
```

Role: `admin`.

Retorna historico sem carregar XMLs pesados.

### Transmissao

```text
POST /api/nfe/inutilizacoes
```

Role: `admin`.

Body:

```json
{
  "ano": 2026,
  "numeroInicial": 280,
  "numeroFinal": 280,
  "justificativa": "Quebra de sequencia por rejeicao fiscal durante emissao da OS-0259",
  "confirmacao": "INUTILIZAR 280",
  "idempotencyKey": "uuid"
}
```

Respostas:

- `201`: inutilizacao autorizada (`cStat=102`);
- `200`: repeticao idempotente de operacao ja conhecida;
- `400`: formato ou confirmacao invalida;
- `401/403`: autenticacao ou role invalida;
- `409`: numero usado, faixa sobreposta ou pedido em processamento;
- `422`: rejeicao fiscal definitiva da SEFAZ;
- `504`: comunicacao incerta; registro permanece para auditoria.

### XML

```text
GET /api/nfe/inutilizacoes/:id/xml/:tipo
```

Role: `admin`.

`tipo` sera `envio` ou `retorno`. O endpoint devolvera `application/xml` e
nome de arquivo seguro.

## Interface

Na pagina `/nfe`, somente para admin:

- botao `Inutilizar numeracao` no cabecalho;
- modal operacional, sem navegacao para outra pagina;
- campos somente leitura para ambiente, CNPJ, modelo e serie;
- ano, inicio, fim e justificativa editaveis;
- aviso destacado de que a operacao nao cancela NF-e e nao pode ser desfeita;
- resumo da faixa e quantidade de numeros;
- campo de confirmacao textual;
- botao final destrutivo desabilitado ate todos os requisitos serem atendidos;
- estado de envio que bloqueia duplo clique e fechamento acidental;
- sucesso mostrando protocolo, `cStat`, data e links para XML;
- rejeicao mostrando mensagem fiscal sem apagar os dados digitados.

O historico aparecera em uma secao ou modal acessivel pelo mesmo fluxo,
mostrando faixa, ano/serie, ambiente, status, protocolo, justificativa, usuario
e data. XMLs serao baixados sob demanda.

## Tratamento de Erros

- `cStat=102`: autorizado.
- Rejeicao fiscal com resposta: `rejeitado`, mensagem normalizada e HTTP 422.
- Timeout/rede/TLS/resposta incompleta: `incerto`, HTTP 504.
- Erro local antes de transmitir: nenhuma chamada SEFAZ e registro marcado
  como `falha_local`, preservando a auditoria.
- Nunca transformar timeout em rejeicao.
- Nunca permitir reenvio automatico.
- Logs nao devem conter senha do certificado, token ou XML completo.

## Testes

### Backend

Desenvolvimento em TDD, com SEFAZ e wizard sempre simulados:

- validacao de ano, faixa, limite de 10.000 e justificativa;
- confirmacao textual para numero unico e intervalo;
- derivacao segura de CNPJ, cUF, serie e ambiente;
- role admin obrigatoria;
- bloqueio de numero existente em `ordens`;
- bloqueio de sobreposicao autorizada e em processamento;
- permissao para intervalos adjacentes sem sobreposicao;
- insercao `processando` antes da chamada;
- sucesso somente com `cStat=102`;
- persistencia de protocolo e dos dois XMLs;
- rejeicao fiscal vira `rejeitado`;
- timeout vira `incerto`;
- idempotencia sem segunda chamada ao wizard;
- falha de escrita em disco nao altera autorizacao fiscal;
- contratos das rotas e ausencia de XML pesado nas listagens.

### Frontend

O frontend atualmente nao possui runner de testes. A implementacao adicionara
Vitest, Testing Library, `jsdom` e scripts de teste, sem alterar o build Vite.

Cobertura minima:

- botao visivel somente para admin;
- carregamento do contexto fiscal;
- validacoes e frase de confirmacao;
- numero unico e intervalo;
- botao final bloqueado durante envio;
- payload correto e chave idempotente estavel durante a tentativa;
- exibicao de sucesso, protocolo e links XML;
- exibicao de rejeicao e comunicacao incerta;
- historico sem carregar XML antecipadamente.

### Verificacao

```powershell
cd backend
npm.cmd test

cd ..\frontend
npm.cmd test
npm.cmd run build
```

Depois dos testes automatizados, executar uma inutilizacao controlada em
homologacao e confirmar `cStat=102`, protocolo e XMLs. Nenhum teste automatizado
ou manual deve usar producao sem uma acao separada e explicita do usuario.

## Implantacao e Operacao

1. Fazer backup do banco antes do deploy.
2. Publicar tabela, backend e frontend.
3. Reiniciar PM2.
4. Validar contexto fiscal e historico sem transmitir.
5. Testar em homologacao com faixa reservada para teste.
6. Conferir protocolo e XML no sistema.
7. Trocar para producao apenas pelo fluxo normal de configuracao.
8. Inutilizar a faixa real somente com confirmacao explicita do administrador.

Para o incidente atual, a operacao pretendida sera:

- ambiente: producao;
- ano: 2026;
- modelo: 55;
- serie: 1;
- inicio: 280;
- fim: 280;
- justificativa: `Quebra de sequencia por rejeicao fiscal durante emissao da OS-0259`.

Antes da transmissao real, o sistema repetira as verificacoes locais e exibira
todos esses dados para confirmacao.

## Documentacao

A implementacao deve atualizar:

- `AGENTS.md`, resumindo endpoints, tabela, statuses e procedimento seguro;
- documentacao operacional da NF-e, incluindo diferenca entre inutilizacao,
  cancelamento e rejeicao;
- exemplos PowerShell somente para diagnostico e consulta, nunca com
  transmissao de producao embutida.

## Referencias

- Portal Nacional da NF-e, Perguntas Frequentes:
  https://www.nfe.fazenda.gov.br/PORTal/perguntasFrequentes.aspx?tipoConteudo=auR4yGlWmRY%3D
- Ajuste SINIEF 7/05, clausula decima quarta:
  https://www.confaz.fazenda.gov.br/legislacao/ajustes/2005/AJ007_05
- Manual de Orientacao do Contribuinte 7.0:
  https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=LrBx7WT9PuA%3D
