# Fase 4: Auditoria financeira de OS

## Objetivo

Adicionar uma auditoria read-only para inconsistencias financeiras de ordens de servico, usando a mesma fonte oficial de saldo operacional: `getResumoFinanceiroOS()`.

## Contexto

As fases 0 a 3 reforcaram a integridade fiscal e a visibilidade de pendencias. O lado financeiro ja bloqueia entrega com saldo aberto nas rotas principais, mas ainda nao existe uma tela de conferencia gerencial que mostre se algum dado historico ou edicao anterior deixou:

- OS `Entregue` com saldo oficial em aberto;
- pagamento recebido acima do valor da OS;
- lista gerencial de contas a receber divergente do saldo oficial.

## Escopo

Criar uma auditoria em `/api/financeiro/integridade-os`, exclusiva para `admin`, com resposta:

```json
{
  "issues": [
    {
      "tipo": "entregue_com_saldo",
      "severidade": "critica",
      "ordemid": 17,
      "numero": "OS-017",
      "cliente": "Cliente",
      "status": "Entregue",
      "total": 100,
      "recebido": 40,
      "saldo": 60,
      "mensagem": "OS entregue com saldo aberto."
    }
  ],
  "meta": {
    "total": 1,
    "criticas": 1,
    "avisos": 0
  }
}
```

## Regras

- Nao alterar OS, caixa, contas a pagar ou lancamentos.
- Nao recalcular saldo de OS inline como regra de decisao; chamar `getResumoFinanceiroOS()` para cada OS candidata.
- Usar SQL apenas para selecionar candidatos e para comparar a lista gerencial atual de contas a receber.
- Ignorar OS deletada e lancamento deletado.
- Lançamentos `pago=0` nao abatem saldo oficial.
- Saldo oficial continua clamped em zero, mas a auditoria pode calcular `excedente = recebido - total` para aviso.

## Tipos de issue

- `entregue_com_saldo`: OS `Entregue` com `saldo > 0.01`; severidade `critica`.
- `pagamento_excedente`: recebido maior que total em mais de R$ 0,01; severidade `aviso`.
- `receber_divergente`: OS aberta que aparece de forma diferente entre a lista gerencial e o saldo oficial; severidade `aviso`.

## Frontend

Na tela `/financeiro`, adicionar um painel compacto acima das abas:

- se nao houver issue: mostrar estado discreto de integridade ok;
- se houver issue: mostrar contagem de criticas/avisos e uma lista curta;
- botao `Atualizar auditoria`;
- nenhum botao de correcao automatica.

## Testes

- Servico de auditoria com banco in-memory e `getResumoFinanceiroOS` injetado.
- Contrato da rota admin-only.
- Contrato de fonte garantindo que a rota usa o servico e que o frontend chama `/financeiro/integridade-os`.
