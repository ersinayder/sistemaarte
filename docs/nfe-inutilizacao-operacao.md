# Operacao: Inutilizacao Manual de Numeracao NF-e

## Quando usar

Use inutilizacao quando um numero de NF-e ficou inutilizado por quebra tecnica
de sequencia e nao existe NF-e autorizada, cancelada ou denegada com esse
numero.

Nao use inutilizacao para rejeicao corrigivel de OS. Nesses casos, corrija os
dados fiscais e reemita a mesma OS; o sistema deve reutilizar o mesmo numero de
NF-e rejeitado. Detalhes: `docs/nfe-reemissao-rejeicao-sequencia.md`.

Nao use inutilizacao para corrigir NF-e ja autorizada. Para nota autorizada,
avaliar cancelamento, CC-e ou orientacao contabil.

## Onde fica

Tela:

```txt
/nfe
```

Botao:

```txt
Inutilizar numeracao
```

Disponivel somente para usuario `admin`.

## Dados solicitados

- Ano.
- Numero inicial.
- Numero final.
- Justificativa fiscal.
- Confirmacao textual.

O sistema preenche automaticamente:

- Ambiente fiscal.
- CNPJ emitente mascarado.
- Modelo `55`.
- Serie configurada.
- Ultimo numero conhecido.

## Confirmacao exigida

Para um numero:

```txt
INUTILIZAR 280
```

Para intervalo:

```txt
INUTILIZAR 280-285
```

O backend recalcula essa frase. Alterar a interface ou enviar direto pela API
nao contorna a confirmacao.

## Status locais

| Status | Significado |
|---|---|
| `processando` | Reserva local criada antes de chamar a SEFAZ. |
| `autorizado` | SEFAZ aceitou a inutilizacao (`cStat=102`). |
| `rejeitado` | SEFAZ respondeu rejeicao fiscal definitiva. |
| `incerto` | Timeout, rede ou resposta incompleta. Nao reenviar sem consulta fiscal. |
| `falha_local` | Falha antes da transmissao. |

## XML e protocolo

O sistema salva:

- XML assinado de envio.
- XML bruto de retorno.
- Protocolo SEFAZ.
- `cStat` e motivo.
- Usuario e data.

Os XMLs ficam no banco e em:

```txt
backend/data/nfe_xmls/
```

## Procedimento seguro

1. Fazer backup do banco antes do deploy ou antes de uma operacao real sensivel.
2. Validar a operacao em homologacao com uma faixa de teste.
3. Conferir `cStat=102`, protocolo e XMLs.
4. Em producao, conferir ano, serie, faixa e justificativa antes da confirmacao.
5. Se der `incerto`, nao reenviar a mesma faixa. Consultar SEFAZ/contador antes.

## Caso 280/2026

Dados esperados para o incidente diagnosticado:

```txt
Ano: 2026
Modelo: 55
Serie: 1
Numero inicial: 280
Numero final: 280
Justificativa: Quebra de sequencia por rejeicao fiscal durante emissao da OS-0259
Confirmacao: INUTILIZAR 280
```

Prazo ordinario para quebra ocorrida em junho de 2026: 10 de julho de 2026.
