# Design: Exportacao de NF-e e DANFE em PDF

Data: 2026-07-01
Status: aprovado pelo usuario para escrita da spec

## Contexto

A tela `/nfe` ja permite baixar o XML autorizado de uma nota e abrir o DANFE individual em HTML imprimivel. O usuario quer duas mudancas relacionadas:

- um botao `Exportar` na tela de notas fiscais, com escolha entre XML e DANFE e periodo inicial/final, gerando um arquivo `.zip`;
- substituir totalmente o DANFE HTML atual por download automatico de PDF ao clicar em `DANFE`.

O `AGENTS.md` antigo orienta que DANFE seja HTML imprimivel e que o sistema nao gere PDF binario para DANFE. Esta spec registra uma excecao deliberada e aprovada pelo usuario em 2026-07-01: a partir desta feature, o contrato de DANFE passa a ser PDF baixavel.

## Objetivos

- Transformar `GET /api/nfe/:chave/danfe` em endpoint de download PDF.
- Fazer o botao `DANFE` da tela `/nfe` baixar automaticamente `danfe-<chave>.pdf`.
- Adicionar exportacao em lote por periodo para:
  - XML autorizado;
  - DANFE PDF.
- Entregar o lote como `.zip`.
- Preservar permissoes atuais de NF-e: `admin` e `caixa`.
- Usar `nfe_notas.createdat` como criterio de periodo, exposto na API como `nfe_emitida_em`.
- Exportar apenas notas com `nfe_notas.status` `autorizado` ou `cancelado`, pois sao as notas com XML autorizado/DANFE disponivel.
- Incluir notas de origem `ordem` e `avulsa`.

## Fora de Escopo

- Nao exportar XML de CC-e, cancelamento ou inutilizacao no primeiro lote.
- Nao adicionar agendamento automatico de exportacao.
- Nao alterar emissao, cancelamento, CC-e, inutilizacao, sequencias fiscais ou regras de status de OS.
- Nao mover notas para lixeira nem alterar a lixeira fiscal.
- Nao gerar DANFE no frontend.

## Fluxo de Usuario

Na tela `/nfe`, o cabecalho ganha um botao secundario `Exportar`.

Ao clicar:

1. Abre um modal compacto.
2. O operador escolhe o tipo:
   - `XML`;
   - `DANFE PDF`.
3. O operador informa data inicial e data final.
4. Ao confirmar, o frontend chama o endpoint de exportacao com `responseType: "blob"`.
5. O navegador baixa automaticamente o `.zip`.

O botao individual `DANFE` continua aparecendo nas notas autorizadas e canceladas, mas passa a baixar PDF em vez de abrir nova aba.

## Backend

### DANFE PDF Individual

O endpoint existente `GET /api/nfe/:chave/danfe` sera mantido como caminho publico da aplicacao, mas sua resposta muda:

- valida chave com 44 digitos;
- busca a nota fiscal canonica por chave em `nfe_notas`, via `resolverNotaPorChave()`;
- exige nota nao enviada para a lixeira fiscal;
- nao depende de OS ativa, pois a NF-e continua intacta mesmo se a OS for enviada para a lixeira operacional;
- exige `nfe_notas.xml` presente e parseavel por `extrairXmlFiscal()`;
- renderiza o DANFE a partir do HTML existente de `renderDanfeHtml(xml)`;
- converte o HTML para PDF no backend;
- responde com:
  - `Content-Type: application/pdf`;
  - `Content-Disposition: attachment; filename="danfe-<chave>.pdf"`.

A conversao deve ficar isolada em um utilitario dedicado, por exemplo `backend/utils/pdf/danfePdf.js`, para que a rota fiscal nao misture consulta, regra fiscal e detalhes do motor de PDF.

### Motor de PDF

A implementacao recomendada e renderizar o HTML atual em Chromium headless e gerar PDF A4. A implementacao final usa `puppeteer-core`, preferindo `DANFE_PDF_CHROME_PATH`/`PUPPETEER_EXECUTABLE_PATH` e depois Chrome/Edge instalado no Windows, para evitar depender do Chromium baixado no cache do Puppeteer.

Requisitos do PDF:

- tamanho A4;
- margens coerentes com o DANFE atual;
- background e imagens habilitados;
- barcode e logo renderizados;
- resultado reproduzivel para download individual e exportacao em lote.

Se o motor de PDF falhar, a rota retorna erro controlado sem vazar stack/schema.

### Exportacao ZIP

Adicionar endpoint:

`GET /api/nfe/exportar?tipo=xml|danfe&inicio=YYYY-MM-DD&fim=YYYY-MM-DD`

Contrato:

- autentica `admin` e `caixa`;
- valida `tipo`, `inicio` e `fim`;
- rejeita periodo invertido;
- aplica limite maximo de periodo para evitar ZIP gigante. Limite recomendado: 370 dias;
- consulta notas canonicas em `nfe_notas n` com `LEFT JOIN ordens o ON o.id = n.ordemid`;
- nao exporta notas enviadas para a lixeira fiscal:
  - `COALESCE(n.deletedat, CASE WHEN n.origem = 'ordem' THEN o.nfe_deletedat ELSE NULL END) IS NULL`;
- nao filtra `o.deletedat`, pois a lixeira de OS nao deve esconder/exportar-bloquear NF-e autorizada;
- filtra `n.status IN ('autorizado', 'cancelado')`;
- filtra `date(n.createdat)` entre `inicio` e `fim`;
- ordena por data de emissao e numero da NF-e.

Para `tipo=xml`:

- adiciona um arquivo por nota: `xml/<nfe_numero>-<chave>.xml`;
- usa o XML autorizado extraido de `nfe_notas.xml`.

Para `tipo=danfe`:

- adiciona um arquivo por nota: `danfe/<nfe_numero>-<chave>.pdf`;
- usa o mesmo gerador do DANFE individual.

O ZIP deve incluir um `manifesto.txt` com:

- tipo exportado;
- periodo;
- data/hora da geracao;
- quantidade de notas encontradas;
- quantidade de arquivos exportados;
- lista de notas puladas com motivo, quando houver.

Se nenhuma nota exportavel for encontrada, retornar `404` ou `422` com mensagem amigavel em JSON. Se algumas notas falharem, o ZIP ainda deve ser entregue com manifesto.

Nome recomendado do ZIP:

- `nfe-xml-YYYY-MM-DD-a-YYYY-MM-DD.zip`;
- `nfe-danfe-YYYY-MM-DD-a-YYYY-MM-DD.zip`.

## Frontend

Alterar `frontend/src/pages/NotasFiscais.jsx` e `frontend/src/pages/OrdemDetalhe.jsx`.

### Botao DANFE Individual

Substituir `abrirDanfe(chave)` por download via helper de blob:

- chamada: `GET /nfe/:chave/danfe`;
- `responseType: "blob"`;
- nome local: `danfe-<chave>.pdf`;
- toast de erro: `DANFE indisponivel`.

### Modal de Exportacao

Adicionar estado local para abrir/fechar modal de exportacao.

O modal tera:

- titulo `Exportar NF-e`;
- seletor de tipo (`XML` ou `DANFE PDF`);
- campo `Data inicial`;
- campo `Data final`;
- botao `Cancelar`;
- botao primario `Exportar`;
- estado de carregamento durante o download.

O modal deve seguir o estilo operacional atual: denso, simples, sem hero, usando `btn`, `form-input`, `card` ou estilos existentes.

## Erros e Estados

Frontend:

- datas vazias bloqueiam envio;
- periodo invertido bloqueia envio;
- erro do backend aparece em toast;
- durante exportacao, o botao primario fica desabilitado.

Backend:

- `400`: parametros invalidos;
- `404` ou `422`: nenhuma nota exportavel;
- `500`: falha inesperada controlada;
- notas com XML ausente/invalido entram no manifesto como puladas quando houver outras notas validas.

## Testes

Backend:

- teste de contrato do endpoint individual DANFE retornando `application/pdf` e filename `.pdf`;
- teste de validacao de chave invalida;
- teste de ZIP XML por periodo;
- teste de ZIP DANFE por periodo com manifesto;
- teste garantindo inclusao de nota avulsa;
- teste garantindo que OS em lixeira operacional nao remove a NF-e exportavel;
- teste garantindo que nota na lixeira fiscal nao e exportada;
- teste de periodo invalido/invertido;
- teste de permissao `admin`/`caixa`.

Frontend:

- renderiza botao `Exportar` na tela principal de NF-e;
- modal abre e mostra tipo, data inicial e data final;
- ao confirmar, chama `/nfe/exportar` com os parametros corretos;
- botao `DANFE` usa download e nao `window.open`;
- painel fiscal da OS baixa o mesmo DANFE PDF individual.

Verificacao manual:

- baixar DANFE individual de nota autorizada;
- abrir o PDF baixado;
- exportar XML de um periodo com notas;
- exportar DANFE PDF do mesmo periodo;
- validar que o ZIP contem arquivos e `manifesto.txt`.

## Riscos

- Dependencia de Chrome/Edge headless no Windows Server pode exigir instalar o navegador ou configurar `DANFE_PDF_CHROME_PATH`.
- PDF fiscal precisa preservar dimensoes A4 e legibilidade do DANFE atual.
- Exportar muitos DANFEs em PDF pode ser mais lento que exportar XML. O limite de periodo e o manifesto reduzem risco operacional.

## Decisoes Fechadas

- O endpoint atual de DANFE sera substituido totalmente por PDF.
- O DANFE HTML nao sera mantido como contrato publico.
- A exportacao em lote de DANFE usara PDF.
- O periodo usa `nfe_notas.createdat`, exposto na API como `nfe_emitida_em`.
- A exportacao inclui NF-e avulsa.
- A lixeira operacional de OS nao altera a existencia/exportabilidade da NF-e.
- O lote inicial nao inclui XMLs de eventos fiscais.
