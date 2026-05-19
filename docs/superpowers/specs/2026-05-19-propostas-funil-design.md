# Propostas/Funil Design

## Decisao de UX

Manter a tela atual de `/orcamento` como a calculadora rapida do balcao. Ela continua servindo para calcular quadros, corte a laser, sublimacao, produtos cadastrados e produtos avulsos sem obrigar o operador a abrir um registro comercial.

Adicionar uma acao natural nessa calculadora: `Salvar proposta`. Quando o atendimento vira oportunidade real, o operador guarda os itens, cliente, valor, prazo e observacoes no funil comercial. A acao existente de criar OS continua disponivel para venda imediata.

## Fluxo

```txt
Calculadora / Orcamento Rapido
  -> Salvar proposta
  -> Funil de propostas
  -> Aprovado
  -> Gerar OS
  -> Fila da oficina / Ordens de Servico
```

## Modelo

Criar `propostas` e `proposta_itens`.

Status do funil:

```txt
Novo lead -> Orcamento enviado -> Negociacao -> Aprovado -> Perdido
```

`Aprovado` e `Perdido` sao estados finais para o funil comercial. A OS so nasce quando o usuario aciona `Gerar OS` em uma proposta aprovada. A numeracao `OS-XXXX` continua exclusiva da rota de ordens.

## Backend

Adicionar `/api/propostas` para `admin` e `caixa`:

- `GET /api/propostas`: lista com filtros por status e busca.
- `GET /api/propostas/:id`: detalhe com itens.
- `POST /api/propostas`: cria proposta com itens.
- `PATCH /api/propostas/:id/status`: move no funil.
- `POST /api/propostas/:id/gerar-os`: cria uma OS reaproveitando cliente, itens, total, prazo e observacoes.

## Frontend

Adicionar menu `Propostas` em Operacao.

Tela `/propostas`:

- visao kanban por status;
- cards com cliente, valor, data e resumo de itens;
- modal/detalhe para revisar proposta;
- acoes de mudar status;
- botao `Gerar OS` apenas quando a proposta estiver `Aprovado` e ainda nao tiver `ordemid`.

Tela `/orcamento`:

- manter comportamento de calculadora;
- adicionar botao `Salvar proposta` usando os itens calculados;
- manter `Gerar OS agora` para venda imediata.

## Fora do Escopo Desta Fase

- Link publico `/proposta/:token`.
- Aprovacao online pelo cliente.
- Envio automatico pelo WhatsApp.
- Versoes de proposta e anexos/fotos.
