# Fase 3: Auditoria de pendencias fiscais

## Objetivo

Permitir que `admin` e `caixa` auditem a trilha de uma pendencia fiscal ativa sem transmitir, reenviar, cancelar, corrigir ou alterar estado fiscal.

## Contexto

A fase 2 tornou visiveis as pendencias `processando` e `incerto` de NF-e, CC-e e cancelamento. O proximo passo seguro antes de qualquer reconciliacao com a SEFAZ e expor a linha do tempo da tentativa: quando foi criada, quais transicoes ocorreram, qual `cStat` foi observado e qual motivo foi registrado.

## Escopo

Criar endpoint read-only:

```txt
GET /api/nfe/pendencias/:origem/:id/transicoes
```

`origem` aceita somente:

- `emissao`
- `evento`

A resposta contem a pendencia sanitizada e as transicoes sanitizadas:

```json
{
  "pendencia": {
    "id": 1,
    "origem": "emissao",
    "tipo": "emissao",
    "status": "incerto",
    "ordemid": 17,
    "numero_os": "OS-017",
    "cliente": "Cliente",
    "chave": null,
    "numero_nfe": 11,
    "serie": "1",
    "nseqevento": null,
    "cstat": "timeout",
    "motivo": "SEFAZ demorou demais",
    "createdat": "2026-06-25T10:00:00.000Z",
    "updatedat": "2026-06-25T10:02:00.000Z"
  },
  "transicoes": [
    {
      "id": 1,
      "status": "processando",
      "estado_anterior": null,
      "estado_novo": "processando",
      "cstat": null,
      "motivo": null,
      "createdat": "2026-06-25T10:00:00.000Z"
    }
  ]
}
```

## Fora de escopo

- Consultar SEFAZ.
- Resolver tentativa `incerto`.
- Reenviar emissao, CC-e ou cancelamento.
- Editar status, XML, payload ou dados fiscais.
- Expor `xml_envio`, `xml_retorno`, `payload_json`, `erro_local`, documentos do cliente ou mensagens internas.

## Frontend

Na faixa de pendencias da tela `/nfe`, cada item ganha uma acao discreta `Auditar`. A acao abre um modal operacional com:

- resumo da pendencia;
- orientacao textual curta para nao reenviar cegamente quando estiver `incerto`;
- linha do tempo das transicoes;
- botao para atualizar o detalhe.

O modal nao oferece acao fiscal destrutiva ou transmissiva.

## Erros

- `400` para origem ou id invalidos.
- `404` quando a tentativa nao existe, nao esta ativa ou pertence a OS excluida.
- `500` generico para falha inesperada.

## Testes

- Repositorio: retorna detalhe de emissao e evento com transicoes, rejeita origem invalida e nao expoe campos sensiveis.
- Contrato de rota: permissao `admin`/`caixa`, rota antes de `/:chave/eventos`, ausencia de transmissao SEFAZ e ausencia de campos sensiveis.
- Contrato de frontend: painel chama `onAudit`, modal usa endpoint novo com `skipGlobalErrorToast`, renderiza linha do tempo e nao oferece acao transmissiva.
