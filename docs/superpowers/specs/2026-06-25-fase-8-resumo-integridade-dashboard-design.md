# Fase 8: Resumo de integridade no Dashboard

## Objetivo

Adicionar ao Dashboard um resumo executivo read-only de integridade fiscal e financeira para `admin`, consolidando sinais que hoje ficam separados entre `/nfe` e `/financeiro`.

## Contexto

As fases 2 a 7 criaram visibilidade local para:

- pendencias fiscais ativas ou incertas;
- detalhe da trilha de pendencias fiscais;
- integridade financeira de OS;
- detalhe da integridade financeira de OS;
- divergencias entre NF-e local e total atual da OS;
- detalhe da divergencia fiscal-financeira.

Essas telas continuam sendo a fonte operacional para investigacao. Ainda falta, porem, um indicador de primeira tela para o administrador perceber que existe risco ativo sem precisar abrir cada area.

## Abordagem recomendada

Criar endpoint read-only:

```txt
GET /api/kpis/integridade
```

Restrito a `admin`, porque inclui contagem gerencial de integridade financeira de OS. A rota deve montar um resumo usando somente dados locais:

```json
{
  "fiscal": {
    "pendencias": 2,
    "incertas": 1,
    "processando": 1
  },
  "financeiro": {
    "apontamentos": 3,
    "criticos": 2,
    "avisos": 1
  },
  "fiscalFinanceiro": {
    "apontamentos": 1,
    "criticos": 1,
    "avisos": 0
  },
  "meta": {
    "total": 6,
    "criticos": 3,
    "avisos": 2,
    "ts": 1782380000000
  }
}
```

## Regras

- Usar somente dados locais do banco.
- Nao consultar SEFAZ.
- Nao reenviar NF-e, CC-e, cancelamento ou inutilizacao.
- Nao alterar OS, caixa, contas, NF-e ou tentativas fiscais.
- Nao expor XML, payload fiscal, CPF, telefone, certificado, senha ou erro interno.
- Reutilizar:
  - `listarPendenciasFiscais(db)` para pendencias fiscais;
  - `auditarIntegridadeFinanceiraOS(...)` ou o mesmo caminho do endpoint financeiro para contagem financeira;
  - `auditarIntegridadeFiscalFinanceiraNFe(notas)` para divergencias NF-e x OS.
- O Dashboard deve carregar esse resumo somente quando `isAdmin` for verdadeiro.
- Falha ao carregar o resumo auxiliar nao deve quebrar o Dashboard. Usar `skipGlobalErrorToast: true`.

## Frontend

No Dashboard, adicionar uma faixa compacta abaixo dos KPIs ao vivo e antes dos KPIs mensais. A faixa aparece somente para admin e somente quando houver apontamentos.

Exibir:

- total de apontamentos;
- criticos e avisos;
- pendencias fiscais;
- integridade financeira de OS;
- integridade fiscal-financeira;
- botoes de navegacao para `/nfe` e `/financeiro`.

Nao exibir botoes de corrigir, consultar SEFAZ, reenviar, cancelar, emitir CC-e ou editar OS.

## Alternativas consideradas

- Colocar o resumo em `/nfe`: manteria contexto fiscal, mas esconderia sinais financeiros do administrador.
- Colocar o resumo em `/financeiro`: protegeria melhor o financeiro, mas deixaria pendencias fiscais fora da primeira tela gerencial.
- Expor para `caixa`: rejeitado porque a contagem financeira gerencial acompanha o escopo admin de `/api/financeiro`.

## Testes

- Servico puro para agregar contagens sanitizadas.
- Contrato de rota garantindo `admin`, ausencia de SEFAZ e uso dos servicos existentes.
- Contrato frontend garantindo chamada admin-only a `/kpis/integridade`, `skipGlobalErrorToast`, renderizacao condicional e ausencia de acoes corretivas.

## Fora de escopo

- Mostrar lista detalhada no Dashboard.
- Resolver pendencias.
- Consultar SEFAZ.
- Corrigir OS, caixa, financeiro ou NF-e.
- Criar notificacoes push, automacoes ou alertas persistentes.
