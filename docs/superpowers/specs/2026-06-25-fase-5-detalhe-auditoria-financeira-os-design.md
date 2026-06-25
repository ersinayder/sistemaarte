# Fase 5: Detalhe da auditoria financeira de OS

## Objetivo

Dar ao admin uma explicacao read-only de cada apontamento da auditoria financeira de OS, sem criar rotas de correcao automatica e sem recalcular saldo fora de `getResumoFinanceiroOS()`.

## Contexto

A fase 4 criou a auditoria compacta em `/api/financeiro/integridade-os` e um painel em `/financeiro`. O painel mostra que existe uma inconsistencia, mas ainda nao mostra a composicao operacional: total da OS, recebido oficial, saldo oficial, saldo gerencial observado e lancamentos financeiros considerados ou ignorados.

Antes de qualquer fluxo de correcao, o operador precisa entender a causa provavel. Essa fase adiciona somente detalhe e auditoria local.

## Abordagem recomendada

Criar uma rota admin read-only:

```txt
GET /api/financeiro/integridade-os/:ordemId
```

A resposta deve conter:

```json
{
  "ordem": {
    "id": 10,
    "numero": "OS-10",
    "clientenome": "Cliente",
    "status": "Entregue",
    "valortotal": 100
  },
  "resumo": {
    "valorTotal": 100,
    "recebidoOficial": 75,
    "saldoOficial": 25,
    "excedente": 0
  },
  "receberGerencial": null,
  "lancamentos": [
    {
      "id": 99,
      "data": "2026-06-25",
      "tipo": "Entrada",
      "categoria": "Saldo OS",
      "descricao": "Recebimento",
      "pagamento": "Pix",
      "valor": 75,
      "pago": 1,
      "origem": "saldoos",
      "deletedat": null,
      "consideradoNoSaldo": true
    }
  ],
  "apontamentos": [
    {
      "tipo": "entregue_com_saldo",
      "severidade": "critico",
      "mensagem": "OS entregue ainda possui saldo oficial em aberto."
    }
  ]
}
```

## Regras

- A rota e exclusiva de `admin`, seguindo o financeiro gerencial.
- A rota deve usar `getResumoFinanceiroOS(ordemId)` como fonte oficial para `recebidoOficial` e `saldoOficial`.
- A consulta de `lancamentos` pode listar linhas pagas, nao pagas e deletadas da OS, mas deve marcar explicitamente `consideradoNoSaldo`.
- `consideradoNoSaldo` deve ser `true` somente quando `pago=1` e `deletedat IS NULL`.
- A resposta nao deve incluir dados sensiveis de cliente alem do que o financeiro admin ja mostra no contexto de OS: numero, nome, status e valores.
- Nao incluir stack trace, erro SQLite bruto, SQL, payload fiscal, XML ou CPF/telefone.
- Nao criar botoes de corrigir, reenviar, quitar, excluir ou reabrir OS.

## Frontend

No painel `IntegridadeFinanceiraPanel`, cada linha com apontamento deve ter uma acao discreta `Auditar`.

Ao clicar:

- abrir modal read-only;
- buscar `/financeiro/integridade-os/${ordemId}` com `skipGlobalErrorToast: true`;
- mostrar resumo da OS e dos saldos oficiais;
- mostrar tabela compacta de lancamentos relacionados;
- destacar se cada lancamento foi considerado no saldo;
- mostrar apontamentos calculados para a OS;
- nao renderizar acoes corretivas.

## Alternativas consideradas

- Expandir inline no painel: simples, mas polui a tela financeira e dificulta leitura quando houver muitos apontamentos.
- Reutilizar a tela de detalhe da OS: economiza UI, mas mistura investigacao gerencial com fluxo operacional de OS e pode expor mais campos do que a auditoria precisa.
- Criar modal read-only dedicado: recomendado, pois mantem o contexto financeiro e limita o contrato de dados.

## Testes

- Teste de servico puro para montar detalhe usando resumo oficial, contas a receber e lancamentos injetados.
- Teste de contrato da rota admin-only.
- Teste de frontend garantindo botao `Auditar`, chamada ao endpoint com `skipGlobalErrorToast` e modal sem acoes corretivas.

## Fora de escopo

- Corrigir automaticamente pagamentos excedentes.
- Reabrir OS entregue.
- Excluir lancamentos.
- Transmitir, consultar ou alterar NF-e.
- Adicionar permissao para `caixa` ou `oficina`.
