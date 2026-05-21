# Frente de Atendimento e Usabilidade Geral Design

## Decisao

Criar uma nova rota principal `/atendimento` para `admin` e `caixa`, com foco em rotina de balcao. A tela vira a entrada operacional do sistema e oferece tres caminhos claros:

- `Nova OS`
- `Receber OS`
- `Venda avulsa`

As telas atuais continuam existindo. `Ordens`, `Caixa`, `Clientes`, `Produtos`, `Oficina`, `Financeiro` e `Notas Fiscais` permanecem como telas de consulta, ajuste e administracao. O atendimento diario deixa de exigir trocar entre cadastros e modulos tecnicos.

## Objetivos de UX

- Reduzir a criacao de OS para um fluxo unico, sem abas internas.
- Permitir cadastro rapido de cliente dentro da OS quando o nome digitado nao existe.
- Permitir venda avulsa com itens de produto estruturados, sem depender de texto livre na descricao do caixa.
- Ao receber o restante de uma OS e zerar saldo, perguntar se o usuario deseja marcar a OS como `Entregue`.
- Manter a decisao de entrega explicita; nao entregar automaticamente.
- Preservar as regras atuais de status, saldo e permissao.

## Navegacao

Adicionar `Atendimento` como primeira opcao em `Operacao` na sidebar.

Organizacao proposta:

```txt
Operacao
  Atendimento
  Resumo
  Caixa
  Ordens de Servico
  Orcamento Rapido
  Propostas

Producao
  Fila da Oficina

Fiscal
  Notas Fiscais

Administracao
  Financeiro

Cadastros
  Clientes
  Produtos
  Usuarios
  Configuracoes
```

O prototipo aprovado removeu os botoes repetidos no canto superior da pagina. A alternancia entre `Nova OS`, `Receber OS` e `Venda avulsa` fica dentro do painel `O que voce vai fazer agora?`, como botoes compactos com icone e titulo. Quando o usuario entra em um fluxo, os tres botoes compactos continuam visiveis no cabecalho do painel para troca rapida.

`Caixa` continua no menu de `Operacao`. A nova tela de `Atendimento` nao substitui o caixa; ela apenas vira o caminho rapido para registrar vendas e recebimentos durante o atendimento. O `Caixa` permanece como tela de conferencia, historico, fechamento e ajustes manuais.

## Tela `/atendimento`

### Estrutura

- Cabecalho da pagina: titulo `Frente de Atendimento`, subtitulo curto e KPIs operacionais.
- KPIs: OS abertas, vencidas, recebido hoje e prontas.
- Painel principal: `O que voce vai fazer agora?`
- Painel lateral: `Proximas acoes`, com atalhos para OS prontas com saldo, vencidas e caixa do dia.
- Bloco inferior: atalhos do balcao para receber OS urgentes/prontas e criar OS rapidamente.

### Cards iniciais

Os cards iniciais devem ser mais baixos que o prototipo inicial e com hierarquia clara:

- icone pequeno a esquerda;
- titulo em destaque;
- descricao curta;
- botao de acao alinhado sem deixar espaco vertical excessivo.

Depois que um fluxo for selecionado, os cards completos somem e ficam apenas os botoes compactos no cabecalho do painel.

## Fluxo `Nova OS`

Substitui o modal de 3 abas por uma tela unica dentro de `/atendimento`.

Campos principais:

- Cliente: busca por nome, telefone ou CPF/CNPJ.
- Telefone/WhatsApp.
- CPF/CNPJ.
- Tipo de cliente: PF/PJ.
- Servico.
- Prioridade.
- Prazo.
- Itens/produtos.
- Entrada.
- Forma de pagamento.
- Data da entrada.
- Observacoes.

Comportamento de cliente:

- Buscar clientes com `GET /api/clientes?q=...`.
- Quando houver cliente selecionado, preencher telefone e CPF/CNPJ.
- Quando nao houver cliente correspondente, mostrar painel inline `Cliente nao encontrado`.
- O painel oferece cadastro rapido sem sair da OS.
- O cadastro rapido cria o cliente com `POST /api/clientes` e usa o `id` retornado na OS.
- Se o operador nao cadastrar o cliente, a OS ainda pode ser criada com `clientenome`, `clientetelefone` e `clientecpf`, preservando o comportamento atual de `resolveClienteData()`.

Comportamento de itens:

- A busca de produto usa `GET /api/produtos?q=...`.
- O usuario pode adicionar produto cadastrado ou item avulso.
- A lista de itens calcula total automaticamente.
- O campo `servico` continua existindo, porque ele e usado por status, filtros, caixa e PDF.
- A OS e criada com `POST /api/ordens`, reaproveitando a logica atual de `ordem_itens` e lancamento automatico de entrada.

Resumo fixo:

- Cliente.
- Quantidade de itens.
- Total.
- Entrada.
- Saldo.
- Valor que sera registrado no caixa.
- Botao `Criar OS`.

## Fluxo `Receber OS`

Objetivo: receber saldo de OS sem obrigar o usuario a abrir `Caixa` e depois `Fila da Oficina`.

Busca:

- Campo unico por numero da OS, cliente ou telefone.
- Usar `GET /api/ordens?page=1&limit=10&q=...`.
- Mostrar cards compactos com numero, cliente, servico, status e saldo.
- Priorizar OS com saldo aberto e status diferente de `Entregue`/`Cancelado`.

Pagamento:

- Valor recebido.
- Forma de pagamento.
- Data.
- Resumo da OS selecionada.

Persistencia:

- Registrar pagamento com `POST /api/caixa` usando `ordemid`.
- A rota de caixa ja usa `getResumoFinanceiroOS()` para validar saldo e impedir pagamento maior que o saldo.

Entrega:

- Apos registrar pagamento, recalcular/consultar a OS.
- Se o saldo ficar zerado e a OS ainda nao estiver `Entregue` nem `Cancelado`, abrir confirmacao:

```txt
Pagamento quitou a OS.
Deseja marcar a OS como Entregue agora?

[Nao, so receber] [Sim, entregar]
```

- `Nao, so receber`: apenas fecha o fluxo e mostra sucesso.
- `Sim, entregar`: chamar `PATCH /api/ordens/:id/status` com `status: 'Entregue'`.
- A regra backend atual continua bloqueando `Entregue` se houver saldo aberto.

## Fluxo `Venda avulsa`

Objetivo: registrar venda de produto sem OS com itens estruturados.

Campos:

- Busca de produto.
- Itens da venda: nome, quantidade, valor unitario e total.
- Forma de pagamento.
- Data.
- Resumo da venda.

Backend:

- Estender `POST /api/caixa` para aceitar `itens` quando `ordemid` for ausente e `tipo` for `Entrada`.
- Criar tabela `lancamento_itens`:

```txt
id
lancamentoid
produto_id
nome
quantidade
preco_unitario
avulso
createdat
```

- Inserir o lancamento com `origem='vendaavulsa'`, `categoria='Venda avulsa'` e descricao gerada automaticamente a partir dos itens.
- Salvar os itens em `lancamento_itens`.
- `GET /api/caixa` pode retornar um resumo dos itens para exibicao futura.

Estoque:

- Nesta fase, venda avulsa estrutura o caixa e os itens.
- Nao baixar estoque automaticamente ainda, porque o fluxo atual de OS tambem nao baixa estoque ao usar produtos.
- A baixa automatica de estoque deve ser tratada em uma etapa propria para nao criar divergencia entre OS e venda avulsa.

## Tela `Caixa` apos a Frente de Atendimento

O caixa deve continuar existindo e ganhar uma funcao mais clara: conferir e fechar o movimento. Ele nao deve ser o caminho principal para receber OS ou vender produto avulso, mas deve listar tudo que foi registrado pelo atendimento.

Comportamento desejado:

- Navegacao por dia preservada.
- Navegacao por mes preservada.
- Atalhos `Hoje` e `Ontem`.
- Setas para dia anterior e proximo dia.
- Seletor de mes.
- Faixa/calendario horizontal do mes mostrando, por dia, total recebido e quantidade de lancamentos.
- Lista do dia selecionado.
- Filtros por tipo, forma de pagamento, categoria e origem.
- Origens visiveis: `manual`, `entradaos`, `saldoos`, `vendaavulsa`.
- Resumo por forma de pagamento no dia e no mes.
- Botao `Novo lancamento manual` continua existindo para despesas, ajustes e entradas sem OS/produto.

O operador deve entender a separacao:

```txt
Atendimento registra o movimento.
Caixa confere, filtra, fecha e audita.
```

Essa separacao evita que o usuario precise usar o campo `descricao` para casos comuns, mas preserva flexibilidade administrativa.

## Componentes Frontend

Criar `frontend/src/pages/Atendimento.jsx`.

Componentes internos sugeridos:

- `AtendimentoModeSwitcher`: botoes compactos `Nova OS`, `Receber OS`, `Venda avulsa`.
- `AtendimentoHome`: cards iniciais e atalhos do balcao.
- `NovaOSAtendimento`: fluxo unico de criacao de OS.
- `ReceberOSAtendimento`: busca e recebimento de OS.
- `VendaAvulsaAtendimento`: venda com itens estruturados.
- `ResumoAtendimento`: resumo fixo reutilizavel.
- `ConfirmarEntregaModal`: confirmacao exibida quando pagamento quita a OS.

O design deve seguir os tokens atuais em `frontend/src/styles/global.css`, com `card`, `btn`, `form-input`, `badge`, `sidebar` e `topbar` existentes. Nao introduzir uma segunda identidade visual.

## Backend e Regras

- Preservar `resolveClienteData()` em `routes/ordens.js`.
- Preservar status exatos com acento, especialmente `Em Produção`.
- Usar somente `Cancelado` em queries SQL.
- Manter `getResumoFinanceiroOS()` como unica fonte de verdade para saldo.
- O fluxo de entrega deve usar `PATCH /api/ordens/:id/status`, nao reimplementar regra de status no frontend.
- `POST /api/caixa` continua validando saldo quando houver `ordemid`.
- Para venda avulsa com itens, criar migration aditiva em `database.js`; nao alterar tabelas existentes exceto com `ALTER TABLE ADD COLUMN` quando necessario.

## Testes

Backend:

- `POST /api/caixa` com `ordemid` continua bloqueando valor maior que saldo.
- `POST /api/caixa` com venda avulsa e itens cria lancamento e itens.
- Venda avulsa sem itens continua permitindo lancamento manual legado quando houver descricao.
- `PATCH /api/ordens/:id/status` continua bloqueando `Entregue` com saldo aberto.
- Cliente rapido via `POST /api/clientes` seguido de `POST /api/ordens` vincula `clienteid`.

Frontend:

- `/atendimento` renderiza para `admin` e `caixa`.
- `oficina` nao acessa `/atendimento`.
- Alternancia compacta troca entre os tres fluxos.
- Nova OS cria payload compativel com `/api/ordens`.
- Receber OS registra pagamento e abre confirmacao quando saldo zera.
- Venda avulsa monta payload com itens.

## Fora do Escopo

- Baixa automatica de estoque.
- Impressao de cupom fiscal.
- Integracao fiscal para venda avulsa.
- Leitor de codigo de barras.
- Multi-caixa com abertura/fechamento formal.
- Reformular visualmente todas as telas antigas nesta etapa.

## Aceite

- Operador consegue criar OS completa sem sair de `/atendimento`.
- Operador consegue cadastrar cliente rapidamente durante a criacao da OS.
- Operador consegue receber saldo de OS e decidir se entrega no mesmo fluxo.
- Operador consegue registrar venda avulsa com itens de produto.
- As telas antigas continuam funcionais e acessiveis.
