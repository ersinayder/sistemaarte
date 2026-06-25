# Fase 7: Detalhe da integridade fiscal-financeira

## Objetivo

Adicionar uma auditoria detalhada, local e read-only para um apontamento de integridade fiscal-financeira de NF-e, permitindo que `admin` e `caixa` entendam a composicao do problema antes de qualquer correcao manual.

## Contexto

A fase 6 criou a faixa compacta em `/nfe` e o endpoint `GET /api/nfe/integridade-financeira`. Essa lista mostra que existe uma divergencia ou aviso, mas ainda nao mostra a composicao auditavel de uma OS especifica: status atual da OS, status fiscal, total atual da OS, total extraido do XML legal, diferenca calculada e motivo sanitizado.

Essa fase continua sem consultar SEFAZ, sem retransmitir eventos, sem editar OS, sem alterar caixa e sem inferir que NF-e autorizada significa pagamento quitado.

## Abordagem recomendada

Criar endpoint read-only:

```txt
GET /api/nfe/integridade-financeira/:ordemId
```

Restrito a `admin` e `caixa`, igual ao endpoint de lista.

A rota consulta uma OS especifica com NF-e local ativa:

```sql
SELECT id, numero, clientenome, status, valortotal, nfe_status, nfe_chave, nfe_xml
FROM ordens
WHERE id = ?
  AND deletedat IS NULL
  AND nfe_status IS NOT NULL
  AND nfe_deletedat IS NULL
```

Depois delega ao servico de integridade para montar um detalhe sanitizado:

```json
{
  "ordem": {
    "id": 10,
    "numero": "OS-10",
    "clienteNome": "Cliente",
    "status": "Pronto",
    "valorTotal": 120
  },
  "fiscal": {
    "status": "autorizado",
    "chave": "351...",
    "xmlLocal": "presente",
    "valorNFe": 100
  },
  "apontamentos": [
    {
      "tipo": "nfe_total_divergente",
      "severidade": "critico",
      "valorOS": 120,
      "valorNFe": 100,
      "diferenca": 20,
      "mensagem": "Valor total da NF-e autorizada difere do total atual da OS."
    }
  ],
  "orientacao": "Conferencia manual necessaria. Esta auditoria nao altera OS, caixa ou NF-e."
}
```

## Regras

- Usar somente dados locais do banco.
- Aceitar somente `ordemId` inteiro positivo.
- Retornar `400` para id invalido.
- Retornar `404` quando a OS nao existir, estiver na lixeira, nao tiver NF-e local ou a NF-e estiver na lixeira fiscal.
- Nao incluir XML, payload fiscal, CPF, telefone, certificado, senha ou erro interno na resposta.
- Para NF-e autorizada:
  - `xmlLocal` deve ser `ausente` quando nao houver XML fiscal extraivel;
  - `xmlLocal` deve ser `presente` quando houver XML fiscal extraivel;
  - `valorNFe` deve existir somente quando `vNF` for legivel.
- Para NF-e cancelada:
  - nao comparar `vNF` com total atual;
  - manter apenas avisos aplicaveis, como OS entregue com NF-e cancelada.
- Nao criar botoes de consultar SEFAZ, reenviar, cancelar, corrigir, editar OS ou abrir fluxo automatico.

## Frontend

Na faixa `Integridade fiscal-financeira` em `/nfe`, cada item ganha uma acao discreta `Auditar`. A acao abre modal operacional read-only com:

- resumo da OS;
- status fiscal e chave;
- total atual da OS;
- total da NF-e quando legivel;
- diferenca quando aplicavel;
- lista de apontamentos sanitizados;
- mensagem de orientacao deixando claro que a auditoria nao altera dados.

Falha ao carregar o detalhe nao deve quebrar a listagem de notas. Usar `skipGlobalErrorToast: true` e toast somente no clique de auditoria.

## Alternativas consideradas

- Reutilizar apenas o item ja carregado na faixa: rapido, mas nao garante que o detalhe reflete o estado atual no momento da auditoria.
- Abrir a pagina da OS: util para investigacao manual, mas mistura contexto fiscal com edicao operacional e pode induzir correcao antes de conferencia.
- Criar acoes corretivas no modal: rejeitado por risco fiscal e financeiro. Esta fase e somente diagnostica.

## Testes

- Servico puro para montar detalhe sanitizado a partir de uma nota local.
- Contrato de rota garantindo `admin`/`caixa`, posicao antes de rotas dinamicas por chave, tratamento de `400`/`404` e ausencia de chamadas SEFAZ.
- Contrato frontend garantindo chamada a `/nfe/integridade-financeira/${ordemId}` com `skipGlobalErrorToast`, modal read-only e ausencia de acoes corretivas.

## Fora de escopo

- Consultar SEFAZ.
- Baixar, substituir ou validar XML contra webservice.
- Emitir CC-e.
- Cancelar ou reemitir NF-e.
- Editar OS, cliente, itens ou lancamentos.
- Alterar regras de pagamento, entrega ou emissao.
