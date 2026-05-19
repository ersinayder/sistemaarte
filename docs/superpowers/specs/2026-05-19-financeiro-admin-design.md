# Financeiro Administrativo Design

## Objetivo

Transformar a area de `Relatorios` em um painel administrativo financeiro exclusivo para `admin`, separando frente de caixa de gestao financeira da empresa.

## Separacao de responsabilidades

`/caixa` continua sendo a tela operacional do balcão:

- vendas e recebimentos do dia
- pagamentos de OS
- devolucoes/estornos simples
- fechamento diario

`/financeiro` passa a ser a tela do dono/admin:

- resumo mensal da saude financeira
- contas a pagar
- contas a receber derivadas de OS com saldo aberto
- DRE gerencial simples

## Rotas e permissoes

- Frontend: renomear `/relatorios` para `/financeiro`.
- Menu: trocar `Relatorios` por `Financeiro`.
- A pagina `/financeiro` deve ser exclusiva de `admin`.
- O backend novo fica em `/api/financeiro`, exclusivo de `admin`.
- O endpoint legado `/api/relatorios/resumo` pode permanecer para evitar quebrar o Dashboard do caixa.

## Contas a pagar

Criar tabela `contas_pagar`, separada de `lancamentos`.

Campos principais:

- fornecedor
- descricao
- categoria
- valor
- vencimento
- status: `Pendente`, `Pago`, `Cancelado`
- pagamento
- pagoem
- lancamentoid
- observacoes
- auditoria basica: criadopor, deletedat, deletedpor, createdat, updatedat

Enquanto uma conta esta pendente, ela nao entra no caixa. Ao marcar como paga, o backend cria automaticamente uma saida em `lancamentos` e grava o `lancamentoid` na conta.

## Abas

### Resumo mensal

Mostra:

- receita realizada
- despesas pagas
- contas a pagar pendentes
- contas vencidas
- saldo realizado
- saldo previsto
- resultado gerencial simples

### Contas a pagar

Lista e cadastro de contas. A acao principal e `Marcar como pago`, que gera a saida no caixa.

### Contas a receber

Primeira versao derivada das OS com saldo aberto. Nao ha cadastro manual de contas a receber nesta fase.

### DRE gerencial

Primeira versao simples:

- receita bruta
- devolucoes/estornos
- receita liquida
- despesas por categoria
- resultado do periodo

## Fora de escopo nesta fase

- conciliacao bancaria
- recorrencia automatica de contas
- centros de custo complexos
- contas a receber cadastradas manualmente
- contabilidade fiscal completa
