# Fase 2: Pendencias fiscais operacionais

## Objetivo

Dar visibilidade read-only para tentativas fiscais ativas ou inconclusivas de NF-e, CC-e e cancelamento, para que operadores vejam quando existe uma pendencia `processando` ou `incerto` antes de reenviar uma acao fiscal.

## Contexto

A fase 1 passou a persistir tentativas idempotentes em `nfe_emissao_tentativas` e `nfe_evento_tentativas`. Essas tabelas bloqueiam reenvios perigosos quando uma transmissao esta ativa ou incerta, mas a tela `/nfe` ainda mostra apenas notas e eventos consolidados em `nfe_eventos`.

Sem uma leitura operacional, o usuario pode ver apenas uma resposta de erro ao tentar reenviar, sem entender qual OS, chave, tipo de evento ou motivo esta pendente.

## Abordagem escolhida

Criar um endpoint separado `GET /api/nfe/pendencias`, restrito a `admin` e `caixa`, que agrega tentativas ativas de emissao e eventos fiscais. A resposta nao deve incluir XML, payload fiscal, dados de certificado, documentos do cliente ou mensagens internas de excecao.

A tela `NotasFiscais.jsx` deve consultar esse endpoint junto com a listagem principal e exibir uma faixa operacional discreta acima dos filtros, somente quando houver pendencias. A faixa deve ser densa e escaneavel, com contagem, status, tipo, OS/chave e motivo resumido.

## Alternativas consideradas

- Incluir pendencias dentro de `GET /api/nfe`: reduziria uma chamada, mas misturaria a lista de notas com telemetria operacional e aumentaria o risco de regressao no contrato existente.
- Criar uma pagina fiscal nova: seria mais expansivo do que o necessario para a fase atual.
- Exibir apenas toast quando houver pendencia: melhora pouco a revisibilidade e nao fica disponivel para conferencia posterior.

## Contrato backend

`GET /api/nfe/pendencias` retorna:

```json
{
  "pendencias": [
    {
      "id": 1,
      "origem": "emissao",
      "tipo": "emissao",
      "status": "incerto",
      "ordemid": 17,
      "numero_os": "OS-001",
      "cliente": "Cliente",
      "chave": null,
      "numero_nfe": 10,
      "serie": "1",
      "nseqevento": null,
      "cstat": "timeout",
      "motivo": "SEFAZ demorou demais para responder",
      "createdat": "2026-06-25T10:00:00.000Z",
      "updatedat": "2026-06-25T10:01:00.000Z"
    }
  ],
  "meta": {
    "ambiente": 2,
    "total": 1
  }
}
```

Somente status `processando` e `incerto` entram na resposta.

## Contrato frontend

`NotasFiscais.jsx` deve manter:

- fluxo atual de listagem, lixeira, inutilizacao, emissao, CC-e, cancelamento, XML e DANFE;
- estilo operacional denso;
- `skipGlobalErrorToast` na chamada de pendencias, para nao poluir a tela se a leitura auxiliar falhar;
- nenhum bloqueio visual de acoes, porque as regras de bloqueio continuam no backend.

## Tratamento de erro

Falha no endpoint retorna mensagem generica `Erro ao listar pendencias fiscais`.

Falha no carregamento frontend de pendencias nao deve impedir a lista de notas. A tela deve apenas esconder a faixa auxiliar e registrar a falha via toast discreto somente se o usuario acionar recarregar manualmente.

## Testes

- Teste de dominio/repositorio para listar pendencias agregadas e sanitizadas.
- Contrato de rota para garantir `admin` e `caixa`.
- Contrato de fonte para garantir que o endpoint nao seleciona `xml_*`, `payload_json` ou `erro_local`.
- Teste/contrato frontend para garantir chamada a `/nfe/pendencias`, `skipGlobalErrorToast` e renderizacao condicional da faixa.
