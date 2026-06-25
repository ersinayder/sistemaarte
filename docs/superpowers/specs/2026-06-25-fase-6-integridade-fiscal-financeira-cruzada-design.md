# Fase 6: Integridade fiscal-financeira cruzada

## Objetivo

Adicionar uma auditoria read-only que cruza dados fiscais locais da NF-e com os valores financeiros atuais da OS, sem consultar SEFAZ, sem retransmitir eventos e sem alterar OS, caixa ou NF-e.

## Contexto

As fases anteriores deram visibilidade para pendencias fiscais e para inconsistencias financeiras de OS. Ainda falta um ponto de controle entre os dois mundos: uma NF-e autorizada representa um documento fiscal legal salvo no banco, mas a OS pode ter sido editada depois ou o XML legal pode estar ausente/invalido.

Essa fase nao deve presumir que NF-e autorizada significa pagamento quitado. Pagamento e emissao fiscal sao fluxos diferentes. A auditoria cruza somente valores fiscais locais e valores atuais da OS.

## Abordagem recomendada

Criar endpoint read-only:

```txt
GET /api/nfe/integridade-financeira
```

Restrito a `admin` e `caixa`, igual a lista principal de NF-e.

A resposta:

```json
{
  "itens": [
    {
      "tipo": "nfe_total_divergente",
      "severidade": "critico",
      "ordemId": 10,
      "numero": "OS-10",
      "clienteNome": "Cliente",
      "nfeStatus": "autorizado",
      "nfeChave": "351...",
      "valorOS": 120,
      "valorNFe": 100,
      "diferenca": 20,
      "mensagem": "Valor total da NF-e autorizada difere do total atual da OS."
    }
  ],
  "meta": {
    "total": 1,
    "criticos": 1,
    "avisos": 0
  }
}
```

## Regras

- Usar somente dados locais do banco.
- Considerar OS com `deletedat IS NULL`, `nfe_status IS NOT NULL` e `nfe_deletedat IS NULL`.
- Para `nfe_status='autorizado'`:
  - se `nfe_xml` nao tiver XML fiscal extraivel, emitir `nfe_xml_ausente` critico;
  - se `vNF` nao puder ser lido do XML, emitir `nfe_xml_total_invalido` critico;
  - se `abs(vNF - ordens.valortotal) > 0.01`, emitir `nfe_total_divergente` critico.
- Para `nfe_status='cancelado'`:
  - nao comparar `vNF` com total atual;
  - se a OS estiver `Entregue`, emitir aviso `nfe_cancelada_os_entregue`, pois pode exigir conferencia operacional, mas nao e conclusao automatica.
- Nao incluir XML, payload fiscal, CPF, telefone, certificado, senha ou erro interno na resposta.
- Nao criar botoes de consultar SEFAZ, reenviar, cancelar, corrigir ou editar OS.

## Frontend

Na tela `/nfe`, adicionar uma faixa compacta abaixo das pendencias fiscais e acima dos filtros/lista.

Exibir somente quando houver apontamentos. A faixa deve mostrar:

- contagem de apontamentos;
- tipo, OS, status fiscal, valores e mensagem;
- botao `Atualizar`;
- sem acoes corretivas.

Falha ao carregar essa auditoria auxiliar nao deve quebrar a listagem de notas. Usar `skipGlobalErrorToast: true`.

## Alternativas consideradas

- Colocar no Financeiro: facilitaria leitura gerencial, mas o dado principal e fiscal e o operador fiscal precisa ver junto da lista de NF-e.
- Comparar NF-e autorizada com saldo financeiro: rejeitado porque emissao fiscal e quitacao nao sao a mesma regra de negocio.
- Criar reconciliacao automatica: fora de escopo e arriscado sem revisao humana.

## Testes

- Servico puro para extrair `vNF` do XML fiscal e gerar apontamentos sanitizados.
- Contrato de rota garantindo `admin`/`caixa`, posicao antes de rotas dinamicas por chave e ausencia de campos sensiveis.
- Contrato frontend garantindo chamada a `/nfe/integridade-financeira`, `skipGlobalErrorToast` e painel sem acoes corretivas.

## Fora de escopo

- Consultar SEFAZ.
- Baixar ou substituir XML.
- Emitir CC-e.
- Cancelar NF-e.
- Editar OS ou lancamentos.
- Mudar regras de pagamento, entrega ou emissao.
