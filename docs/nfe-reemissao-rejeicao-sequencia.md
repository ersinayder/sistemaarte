# NF-e: reemissao apos rejeicao e sequencia

## Regra critica

Rejeicao corrigivel da SEFAZ nao deve fazer a mesma OS pular para um novo
numero de NF-e.

Quando uma emissao por OS recebe rejeicao corrigivel, por exemplo falta ou
inconsistencia de IE do destinatario (`cStat=232`, `233`, `234`), a reemissao
da mesma OS deve usar a mesma serie e o mesmo numero fiscal da tentativa
rejeitada. Isso vale mesmo que outra OS tenha emitido uma NF-e autorizada no
intervalo.

Exemplo esperado:

```txt
OS-0351 -> NF-e 297 rejeitada por IE
OS-0349 -> NF-e 298 autorizada
OS-0351 -> reemite NF-e 297 novamente
OS-0351 -> NF-e 297 autorizada apos correcao
```

O comportamento proibido e:

```txt
OS-0351 -> NF-e 297 rejeitada
OS-0351 -> reemite NF-e 298/299
```

## Implementacao atual

- `backend/repositories/nfeAttemptRepository.js` reserva uma tentativa ativa
  por OS e serie.
- Se a ultima tentativa da OS/serie esta `rejeitado` com `cStat`
  reutilizavel, a proxima tentativa da mesma OS reaproveita `numero`, `serie`
  e `lote`, criando apenas novo ordinal de idempotencia (`a2`, `a3`...).
- Essa reutilizacao nao altera `nfe_sequencias.ultimo_numero`.
- A reutilizacao e bloqueada se outra OS ou outra nota canonica ja ocupa a
  mesma `serie` e `numero`.
- Se depois da rejeicao corrigivel houver apenas `falha_local` posterior do
  mesmo numero, a proxima tentativa ainda reaproveita o numero rejeitado.
- `backend/services/nfeEmissaoService.js` nao devolve numero global em
  rejeicao da SEFAZ.
- `devolverNumero()` fica restrito a `falha_local`, antes da transmissao.
- `backend/services/nfeNotasService.js` reaproveita a linha canonica
  `nfe_notas` rejeitada da mesma OS/numero/serie, limpando campos de rejeicao
  quando a nota volta para `emitindo`.
- XML autorizado e DANFE so podem ser servidos para nota `autorizado` ou
  `cancelado`, e o XML precisa ser um `nfeProc` autorizado valido da propria
  chave.
- Emissao avulsa tambem segue a classificacao conservadora: retorno nao
  conclusivo vira `incerto`, nao rejeicao terminal.
- Exportacao em lote de XML/DANFE tambem valida o `nfeProc` autorizado da
  chave antes de incluir o arquivo no ZIP.

## CStats reutilizaveis

A allowlist fica em `backend/domain/nfeEmissionRules.js`, via
`listarCStatsRejeicaoReutilizavel()`.

Nao incluir cStats de duplicidade, denegacao ou situacao em que a SEFAZ declara
que o numero ja foi usado. Exemplos que continuam bloqueantes/incertos:

- `204`, `205`, `206`, `539`: duplicidade/numeracao.
- `302`, `303`: denegacao/situacao cadastral que nao deve ser tratada como
  simples reaproveitamento automatico.
- Rejeicao textual sem cStat reconhecido tambem fica `incerto`; nao pode virar
  rejeicao terminal por heuristica.

## Testes obrigatorios

Antes de alterar essa regra, rode:

```powershell
cd backend
npm.cmd test -- nfeEmissionRules.test.js nfeAttemptRepository.test.js nfeEmissaoService.test.js nfeNotasService.test.js routeContracts.test.js
```

Coberturas principais:

- `nfeAttemptRepository.test.js`: reutiliza rejeicao corrigivel da mesma OS
  sem voltar o numero para outra OS.
- `nfeEmissaoService.test.js`: reproduz rejeicao por IE, autorizacao de outra
  OS no meio e reemissao da OS original com o mesmo numero.
- `nfeNotasService.test.js`: reemissao da mesma OS/numero reutiliza a nota
  canonica rejeitada em vez de criar linhas duplicadas.
- `routeContracts.test.js`: XML/DANFE exigem nota autorizada/cancelada e XML
  legal validado antes de baixar documento fiscal, inclusive na emissao avulsa.
- `nfeExportService.test.js`: exportacao em lote pula XML sem autorizacao legal
  valida.

## Operacao

Se uma rejeicao corrigivel aparecer na tela:

1. Corrigir cliente, emitente ou itens conforme a mensagem.
2. Clicar em reemitir na mesma OS.
3. Conferir se o numero da NF-e se manteve.
4. So usar inutilizacao quando houver quebra real de numeracao sem nota
   autorizada/cancelada/denegada e sem reutilizacao segura.
