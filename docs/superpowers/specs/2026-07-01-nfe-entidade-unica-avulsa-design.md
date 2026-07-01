# NF-e com Entidade Unica e Emissao Avulsa

## Contexto

Hoje a NF-e do Sistema Arte e Molduras e armazenada diretamente em colunas
`nfe_*` da tabela `ordens`. Esse desenho funcionou enquanto toda NF-e nascia de
uma OS, mas limita a evolucao fiscal:

- nota avulsa exigiria uma OS falsa ou outro caminho paralelo;
- listagem, XML, DANFE, CC-e, cancelamento e lixeira dependem da tabela
  `ordens`;
- eventos fiscais tem `ordemid`, mas uma nota avulsa nao pertence a OS;
- a inutilizacao consulta numeracao usada em `ordens.nfe_numero`;
- itens fiscais emitidos dependem de uma juncao com itens da OS e produtos.

O objetivo agora e permitir emissao de NF-e avulsa sem OS e sem mexer no caixa,
ao mesmo tempo deixando NF-e como uma entidade fiscal propria do sistema.

## Decisoes Aprovadas

- Implementar a opcao 3: uma entidade unica para NF-e.
- A nota avulsa nao cria OS.
- A nota avulsa nao cria lancamento no caixa nem `lancamento_itens`.
- A nota avulsa pode selecionar um cliente cadastrado para preencher dados, mas
  isso nao e obrigatorio.
- A tela de revisao fiscal existente sera reaproveitada.
- A entrada de produtos da avulsa deve seguir o conceito da nova OS: produto
  cadastrado ou item avulso digitado.
- A remocao das colunas legadas `ordens.nfe_*` entra como Fase 2 explicita.

## Objetivos

- Criar `nfe_notas` como origem canonica de status, numero, serie, chave, XML,
  cancelamento, lixeira e dados fiscais da NF-e.
- Criar `nfe_itens` como snapshot dos itens fiscais da nota.
- Migrar notas ja existentes em `ordens.nfe_*` para a entidade nova por backfill
  idempotente.
- Manter os fluxos atuais de OS funcionando: preview, emissao, listagem, XML,
  DANFE, CC-e, cancelamento e lixeira.
- Adicionar fluxo avulso completo pela tela `/nfe`.
- Garantir que a avulsa nao afeta caixa, financeiro, OS ou estoque alem do uso
  de cadastro de produtos como fonte de dados.
- Cobrir bem o comportamento atual e o novo com testes automatizados.

## Fora do Escopo

- Criar NF-e a partir do caixa.
- Criar NF-e a partir de proposta.
- Fazer emissao NFC-e.
- Criar PDF binario no frontend.
- Automatizar eventos fiscais reais em testes.
- Remover `ordens.nfe_*` na primeira fase.
- Alterar regras de status de OS, saldo financeiro ou permissoes existentes.

## Modelo De Dados

### `nfe_notas`

Tabela canonica de documentos fiscais.

```txt
id                  INTEGER PRIMARY KEY AUTOINCREMENT
origem              TEXT NOT NULL              -- ordem | avulsa
ordemid             INTEGER DEFAULT NULL
clienteid           INTEGER DEFAULT NULL
cliente_snapshot    TEXT NOT NULL              -- JSON fiscal usado na emissao
emitente_snapshot   TEXT NOT NULL              -- JSON do emitente usado
valortotal          REAL NOT NULL DEFAULT 0
descontovalor       REAL NOT NULL DEFAULT 0
pagamento           TEXT DEFAULT 'Pix'
ambiente            INTEGER NOT NULL
numero              TEXT
serie               TEXT NOT NULL DEFAULT '1'
chave               TEXT
protocolo           TEXT
status              TEXT NOT NULL              -- emitindo | autorizado | rejeitado | cancelado
xml                 TEXT
rejeicao_cstat      TEXT
rejeicao_motivo     TEXT
cancelado_em        TEXT
cancel_protocolo    TEXT
cancel_motivo       TEXT
deletedat           TEXT DEFAULT NULL
deletedpor          INTEGER DEFAULT NULL
deletedreason       TEXT DEFAULT NULL
criadopor           INTEGER DEFAULT NULL
imported_legacy     INTEGER NOT NULL DEFAULT 0
createdat           TEXT DEFAULT (datetime('now','localtime'))
updatedat           TEXT DEFAULT (datetime('now','localtime'))
```

Indices planejados:

```txt
idx_nfe_notas_chave
idx_nfe_notas_origem_ordemid
idx_nfe_notas_status
idx_nfe_notas_deletedat
idx_nfe_notas_numero_serie_ambiente
idx_nfe_notas_legacy_ordemid
```

Regras:

- `chave` deve ser unica quando existir.
- Uma OS pode ter historico fiscal com mais de uma NF-e, por exemplo uma nota
  cancelada e uma nova emissao posterior.
- O bloqueio operacional e: nao emitir nova NF-e de OS se ja existir nota
  `autorizado` ou `emitindo` ativa para essa OS.
- O backfill nao pode duplicar notas legadas. Para isso, linhas migradas terao
  `imported_legacy=1` e o processo verificara existencia previa por `ordemid`.

### `nfe_itens`

Snapshot dos itens exatamente como usados para a NF-e.

```txt
id                  INTEGER PRIMARY KEY AUTOINCREMENT
nfeid               INTEGER NOT NULL
ordem_item_id       INTEGER DEFAULT NULL
produto_id          INTEGER DEFAULT NULL
nome                TEXT NOT NULL
quantidade          REAL NOT NULL DEFAULT 1
preco_unitario      REAL NOT NULL DEFAULT 0
subtotal            REAL GENERATED ALWAYS AS (quantidade * preco_unitario) STORED
avulso              INTEGER DEFAULT 0
ncm                 TEXT NOT NULL
cfop                TEXT NOT NULL
csosn               TEXT NOT NULL
origem_fiscal       TEXT NOT NULL DEFAULT '0'
unidade             TEXT NOT NULL DEFAULT 'UN'
createdat           TEXT DEFAULT (datetime('now','localtime'))
```

Indice:

```txt
idx_nfe_itens_nfeid
```

### `nfe_eventos`

Adicionar coluna:

```txt
nfeid INTEGER DEFAULT NULL
```

Eventos novos sempre gravam `nfeid`. `ordemid` permanece enquanto necessario
para compatibilidade e auditoria de eventos antigos.

## Migracao

### Fase 1: entidade nova e compatibilidade

1. Criar `nfe_notas`, `nfe_itens` e `nfe_eventos.nfeid` em `backend/database.js`.
2. Rodar backfill idempotente:
   - selecionar `ordens` com `nfe_status IS NOT NULL`;
   - inserir uma nota `origem='ordem'`, `ordemid=o.id`,
     `imported_legacy=1` quando ainda nao houver linha legada para aquela OS;
   - copiar numero, serie, chave, protocolo, status, XML, datas de emissao,
     dados de cancelamento e lixeira;
   - montar `cliente_snapshot` com dados da OS e do cadastro de cliente;
   - montar `emitente_snapshot` com a configuracao atual quando nao houver outro
     snapshot disponivel;
   - copiar itens de `ordem_itens` com fiscais de `produtos` para `nfe_itens`;
   - associar `nfe_eventos.nfeid` por `chave` e, quando a chave estiver ausente,
     por `ordemid`.
3. Adaptar backend para ler e escrever NF-e por `nfe_notas`.
4. Adaptar rotas de OS para anexar resumo fiscal consultando `nfe_notas`.
5. Manter colunas `ordens.nfe_*` sem uso ativo como fallback temporario.

Essa fase nao usa `DROP COLUMN`.

### Fase 2: limpeza do legado

Depois de validacao em producao:

1. Confirmar que backfill cobriu todas as notas.
2. Confirmar por testes e busca de fonte que nao ha leitura/escrita de
   `ordens.nfe_*`.
3. Fazer backup obrigatorio do banco.
4. Remover as colunas `nfe_*` de `ordens` em migracao propria e testada.
5. Remover codigo e testes de compatibilidade com o legado.

## Pipeline De Emissao

Criar uma camada de servico, por exemplo `backend/services/nfeNotasService.js`,
para concentrar o fluxo comum:

1. montar preview;
2. normalizar cliente;
3. normalizar itens;
4. validar cliente, emitente e itens fiscais;
5. reservar/criar `nfe_notas` com status `emitindo`;
6. consumir numeracao em `nfe_sequencias`;
7. montar payload via `montarNFe({ ordem, itens, cliente, emitente, numero,
   serie, ambiente, autXML })`;
8. chamar `wizard.NFE_Autorizacao`;
9. persistir autorizacao ou rejeicao em `nfe_notas`;
10. registrar `nfe_eventos` com `nfeid`;
11. salvar XML em banco e disco;
12. devolver numero quando a rejeicao permitir, preservando as regras atuais.

Para evitar grande refactor de uma vez, `montarNFe()` pode continuar recebendo
um objeto "ordem-shaped" na primeira fase, desde que o servico monte um DTO
fiscal neutro com `valortotal`, `descontovalor` e `pagamento`.

## Rotas

Rotas existentes preservadas:

```txt
GET  /api/nfe/emitir/:id/preview
POST /api/nfe/emitir/:id
```

Essas rotas passam a usar `nfe_notas` internamente.

Rotas novas:

```txt
GET  /api/nfe/avulsa/preview
POST /api/nfe/avulsa/preview
POST /api/nfe/avulsa
```

`GET /avulsa/preview` devolve estrutura vazia com emitente, ambiente e serie.
`POST /avulsa/preview` normaliza cliente e itens antes da revisao.
`POST /avulsa` emite de verdade.

Rotas que passam a resolver por `nfe_notas`:

```txt
GET    /api/nfe
GET    /api/nfe/lixeira
GET    /api/nfe/:chave/eventos
GET    /api/nfe/:chave/xml/autorizacao
GET    /api/nfe/:chave/danfe
POST   /api/nfe/:chave/cce
POST   /api/nfe/:chave/cancelar
DELETE /api/nfe/:id
POST   /api/nfe/:id/restore
```

`/api/nfe/ordem/:ordemId/eventos` pode continuar existindo para
compatibilidade, mas deve consultar `nfe_notas` e `nfe_eventos.nfeid`.

## Payload Da Nota Avulsa

```js
{
  clienteid: 123,
  cliente: {
    nome: "Cliente",
    documento: "07500718000196",
    ie: "ISENTO",
    logradouro: "Rua A",
    numero: "10",
    bairro: "Centro",
    cidade: "Ipatinga",
    uf: "MG",
    cep: "35160000"
  },
  pagamento: "Pix",
  itens: [
    {
      produto_id: 10,
      nome: "Moldura",
      quantidade: 1,
      preco_unitario: 120,
      avulso: false,
      ncm: "44151000",
      cfop: "5102",
      csosn: "400",
      origem_fiscal: "0",
      unidade: "UN"
    }
  ]
}
```

`clienteid` e `produto_id` sao opcionais. Mesmo quando informados, a emissao
usa os snapshots recebidos/normalizados, nao busca dados novamente depois de
reservar a nota.

## Interface

Na tela `/nfe`, o botao `Emitir NF-e` abre o modal atual com escolha:

```txt
Por OS
Avulsa
```

Modo por OS:

- mantem busca e selecao de OS elegivel;
- usa a revisao existente;
- envia overrides fiscais como hoje, mas backend persiste em `nfe_notas`.

Modo avulsa:

- permite selecionar cliente cadastrado opcionalmente;
- permite iniciar sem cliente e preencher na revisao;
- carrega produtos de `/api/produtos`;
- adiciona produto cadastrado ou item avulso digitado;
- permite editar quantidade e preco;
- mostra a revisao existente com cliente, emitente e itens;
- permite ajustar NCM, CFOP, CSOSN, origem fiscal e unidade;
- emite sem OS e sem caixa.

A tabela de NF-e passa a exibir origem:

```txt
NF-e | Origem | Cliente | Servico/Resumo | Valor | Emitida em | Status | Acoes
```

Para OS, `Origem` mostra a OS. Para avulsa, mostra `Avulsa`.

## Validacoes

Reaproveitar `backend/domain/nfeEmissionRules.js` e expandir para itens avulsos
completos:

- cliente fiscal exige nome, CPF/CNPJ, logradouro, numero, bairro, cidade, UF e
  CEP;
- CPF/CNPJ deve ter 11 ou 14 digitos;
- CEP deve ter 8 digitos;
- UF deve ter 2 letras;
- item exige nome, quantidade maior que zero e preco maior que zero;
- NCM deve ter 8 digitos;
- CFOP deve ter 4 digitos;
- CSOSN deve ser 101, 102, 103, 300, 400, 500 ou 900;
- origem fiscal deve ser 0 a 8;
- unidade e obrigatoria;
- OS nao pode emitir quando ja houver NF-e ativa `emitindo` ou `autorizado`;
- nota avulsa nao pode criar OS, lancamento ou item de caixa.

## Inutilizacao

`nfeInutilizacaoService.buscarNumeroUtilizado()` passa a consultar
`nfe_notas` por `numero`, `serie` e `ambiente`. Durante a Fase 1, pode manter
fallback para `ordens.nfe_numero` apenas se a tabela nova ainda nao tiver a nota
por falha de backfill; esse fallback deve ser removido na Fase 2.

## Testes

### Banco e migracao

- cria `nfe_notas`, `nfe_itens`, indices e `nfe_eventos.nfeid`;
- backfill copia NF-e antiga de OS para `nfe_notas`;
- backfill copia itens da OS para `nfe_itens`;
- backfill associa eventos por chave ou ordem;
- backfill e idempotente e nao duplica linhas;
- Fase 2 tem teste de ausencia de referencias a `ordens.nfe_*` antes da
  limpeza.

### Regras fiscais

- serializa item avulso completo com defaults fiscais seguros;
- rejeita item avulso sem NCM, CFOP, CSOSN, origem ou unidade validos;
- rejeita cliente fiscal incompleto;
- aceita cliente cadastrado normalizado para snapshot;
- monta payload NF-e para DTO fiscal sem depender de uma OS real.

### Rotas backend

- `GET /api/nfe` lista notas de OS migradas e avulsas no mesmo formato;
- `GET /api/nfe/lixeira` lista somente notas ocultadas;
- `GET /api/nfe/:chave/xml/autorizacao` usa `nfe_notas.xml`;
- `GET /api/nfe/:chave/danfe` usa `nfe_notas.xml`;
- CC-e resolve por `nfe_notas`, grava `nfe_eventos.nfeid` e preserva limite de
  20 eventos;
- cancelamento resolve por `nfe_notas` e atualiza status da nota;
- lixeira bloqueia autorizada/cancelada e permite rejeitada;
- emissao por OS bloqueia segunda nota ativa para a mesma OS;
- emissao avulsa nao cria `ordens`, `lancamentos` ou `lancamento_itens`;
- inutilizacao bloqueia numero ja usado em `nfe_notas`.

### Frontend

- mostra escolha `Por OS` e `Avulsa`;
- fluxo por OS continua carregando preview e emitindo;
- fluxo avulso permite cliente opcional;
- fluxo avulso adiciona produto cadastrado;
- fluxo avulso adiciona item avulso;
- validacao visual bloqueia item fiscal incompleto;
- listagem mostra origem avulsa sem quebrar acoes XML/DANFE/detalhe.

## Rollout

1. Implementar testes RED para modelo, backfill e regras avulsas.
2. Implementar tabelas e backfill.
3. Implementar servico fiscal comum.
4. Migrar rotas de leitura e eventos para `nfe_notas`.
5. Migrar emissao por OS para o novo servico.
6. Implementar emissao avulsa.
7. Atualizar frontend.
8. Rodar testes focados e build frontend.
9. Rodar suite backend completa.
10. Validar manualmente em homologacao fiscal antes de producao.

## Riscos E Mitigacoes

- **Backfill incompleto:** manter colunas legadas na Fase 1, testar contagem e
  idempotencia.
- **Regressao em OS:** manter rotas existentes e adicionar testes para preview,
  emissao e listagem de OS.
- **Evento fiscal sem nota:** resolver por chave e preencher `nfeid` quando
  possivel.
- **Nota avulsa sem caixa:** teste explicito garantindo ausencia de inserts em
  `lancamentos`.
- **Remocao prematura do legado:** Fase 2 separada, com backup e teste de
  ausencia de referencias.
- **Dados fiscais mutaveis:** salvar snapshot em `nfe_notas` e `nfe_itens`.
