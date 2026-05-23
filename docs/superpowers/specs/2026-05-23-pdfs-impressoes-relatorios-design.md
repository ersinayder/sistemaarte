# PDFs, Impressoes e Relatorios Comerciais

Data: 2026-05-23

## Contexto

O Sistema Arte e Molduras vai passar a usar impressoes fisicas com frequencia: ordens de servico, propostas, fechamentos de caixa e relatorios gerenciais. Hoje existem documentos imprimiveis em pontos separados:

- OS em `GET /api/ordens/:id/pdf`
- Proposta em `GET /api/propostas/:id/pdf`
- DANFE em `GET /api/nfe/:chave/danfe`
- Fechamento diario de caixa montado no frontend em `Caixa.jsx`
- Relatorios financeiros e de producao expostos como APIs/telas, sem documento imprimivel dedicado

O principal risco atual e confiar no frontend para calcular e agrupar dados de caixa. Isso ja aparece na divergencia de nomes de pagamento, como variantes de cartao de credito/debito, que podem gerar totais quebrados em grupos diferentes.

## Objetivos

1. Padronizar a aparencia dos documentos comerciais e operacionais.
2. Fazer todos os calculos e agrupamentos no backend.
3. Normalizar formas de pagamento em uma unica regra de dominio.
4. Criar documentos imprimiveis para o pacote completo:
   - Ordem de Servico
   - Proposta/Orcamento comercial
   - DANFE, preservando padrao fiscal
   - Fechamento diario de caixa
   - Relatorio financeiro mensal
   - DRE gerencial
   - Contas a pagar
   - Contas a receber
   - Producao
5. Manter o frontend como camada de apresentacao e atalho para abrir documentos, sem autoridade sobre totais.

## Nao Objetivos

- Nao adicionar uma dependencia pesada para PDF binario neste ciclo.
- Nao substituir o fluxo de impressao do navegador. O output continua sendo HTML imprimivel com `window.print()`.
- Nao alterar regras fiscais de NF-e/DANFE alem de ajustes visuais seguros.
- Nao reestruturar o banco de dados para pagamentos neste ciclo; a normalizacao sera aplicada no dominio e nas consultas.

## Arquitetura

### Camada de documentos no backend

Criar utilitarios em `backend/utils/print/` para componentes HTML compartilhados:

- layout base com folha A4, botoes no-print, cabecalho, rodape e estilos comuns
- formatadores de moeda, data, data/hora, texto seguro e numeros
- carregamento de logo como data URI quando necessario
- componentes de tabela, resumo financeiro, cards de KPI, bloco de assinatura e observacoes
- helper de status/pagamento para rotulos comerciais

Os documentos especificos devem ser renderizados por funcoes puras, com testes:

- `renderOrdemServicoHtml`
- `renderPropostaHtml` ajustado para usar o layout comum
- `renderFechamentoCaixaHtml`
- `renderRelatorioFinanceiroHtml`
- `renderDreHtml`
- `renderContasPagarHtml`
- `renderContasReceberHtml`
- `renderRelatorioProducaoHtml`

O DANFE pode continuar em `backend/utils/danfe.js`, mas deve receber apenas melhorias pontuais de acabamento sem descaracterizar o modelo fiscal.

### Regra unica de pagamento

Criar uma regra de dominio em `backend/domain/pagamentosRules.js`:

- `normalizarPagamento(value)` retorna uma chave canonica.
- `labelPagamento(value)` retorna o texto amigavel para impressao.
- `PAGAMENTOS_CANONICOS` define os valores aceitos para agrupamento.

Mapeamentos esperados:

- Pix -> `Pix`
- Dinheiro -> `Dinheiro`
- Cartao Credito, Cartao de Credito, Credito -> `Credito`
- Cartao Debito, Cartao de Debito, Debito -> `Debito`
- Transferencia -> `Transferencia`
- Link de Pagamento, Link Credito, Link Cobranca -> `Link`
- Boleto -> `Boleto`
- Outros -> `Outros`

Consultas e relatorios devem agrupar por chave canonica e mostrar o label amigavel. O frontend pode usar os mesmos labels, mas nao calcula consolidado final.

### Fechamento diario de caixa

Adicionar endpoint no backend:

`GET /api/caixa/fechamento?data=YYYY-MM-DD`

Regras:

- Acesso: `admin` e `caixa`.
- Buscar lancamentos ativos do dia no backend.
- Ignorar lancamentos soft-deleted e OS soft-deleted, como as APIs atuais.
- Separar entradas, saidas e saldo do dia.
- Agrupar entradas por pagamento canonico.
- Agrupar saidas por categoria e, se util, por pagamento.
- Listar lancamentos do dia com origem, categoria, descricao, OS vinculada, itens de venda avulsa e valor.
- Incluir responsavel/assinatura, data de geracao e observacao de conferencia.

O botao "PDF" do frontend passa a abrir esse endpoint. A funcao `gerarPDFFechamento` em `Caixa.jsx` deve ser removida ou reduzida a um `window.open` para o endpoint.

### Relatorios gerenciais

Adicionar endpoints imprimiveis no backend:

- `GET /api/financeiro/resumo/pdf?mes=YYYY-MM`
- `GET /api/financeiro/dre/pdf?mes=YYYY-MM`
- `GET /api/financeiro/contas-pagar/pdf?mes=YYYY-MM&status=...`
- `GET /api/financeiro/contas-receber/pdf`
- `GET /api/relatorios/producao/pdf?mes=YYYY-MM`

Os endpoints devem reutilizar as mesmas consultas ou helpers das APIs JSON existentes, evitando duplicacao de regra.

### Ordem de Servico

A OS fisica deve priorizar leitura rapida no balcao/oficina:

- numero da OS, status, prioridade, abertura e prazo
- cliente, telefone e documento quando houver
- servico, descricao, produtos/itens quando disponiveis
- total, entrada, recebido e saldo, sempre via `getResumoFinanceiroOS()`
- observacoes importantes
- assinatura do cliente e responsavel pela entrega
- rodape com data/hora de geracao

Historico de status pode aparecer na tela, mas nao deve ocupar a impressao padrao se prejudicar a folha fisica.

### Proposta/Orcamento

A proposta deve ter aparencia comercial:

- numero da proposta, cliente, data, prazo e status
- tabela de itens com quantidade, unitario e subtotal
- total em destaque
- observacoes e condicoes comerciais
- validade padrao textual, sem depender de regra fiscal

O documento deve continuar disponivel em `/api/propostas/:id/pdf`.

### Frontend

O frontend deve:

- Exibir botoes claros de impressao/PDF nas telas relevantes.
- Usar labels consistentes de pagamento.
- Abrir endpoints do backend em nova aba.
- Evitar qualquer calculo final para documentos oficiais.
- Continuar mostrando dashboards/tabelas em tela para operacao diaria, mas sem ser fonte de verdade de documentos.

## UX Visual

Padrao visual recomendado:

- documento limpo, branco, A4, com marca no topo
- tipografia sistemica, boa hierarquia e tabela legivel
- uso moderado de cores para status, totais positivos/negativos e secoes
- blocos de assinatura quando o documento fisico exigir conferencia
- botoes de impressao somente fora da midia impressa
- rodape discreto com data/hora e identificador do documento

Documentos fiscais devem manter estrutura mais tecnica; documentos comerciais podem ter acabamento mais elegante.

## Testes

Backend:

- testes unitarios para normalizacao de pagamento
- testes dos renderers garantindo dados essenciais, escape de HTML e labels corretos
- testes de fechamento diario garantindo que variantes de cartao consolidam no mesmo grupo
- testes de contrato de rotas para permissoes dos novos endpoints

Frontend:

- build do Vite
- ajustes pequenos nos botoes e chamadas, sem logica de consolidacao

Verificacao manual:

- abrir OS, proposta e fechamento diario no navegador
- verificar impressao A4 sem sobreposicao
- confirmar que grupos de pagamento aparecem consolidados

## Riscos e Mitigacoes

- Risco: duplicar regra financeira em renderers.
  Mitigacao: renderers recebem dados prontos; calculos ficam em dominio/rotas.

- Risco: pagamentos antigos com grafia variada.
  Mitigacao: normalizacao canonica aplicada no momento do agrupamento.

- Risco: DANFE perder conformidade visual/fiscal.
  Mitigacao: alterar apenas acabamento seguro e preservar a estrutura atual.

- Risco: documentos ficarem bonitos mas longos demais para loja.
  Mitigacao: compactar secoes operacionais e deixar detalhes extensos apenas quando agregam valor.
