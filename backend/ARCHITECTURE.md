# Arquitetura — Backend v2

## Camadas

```
routes/       Mapeiam endpoints HTTP → chamam serviços/domínio → respondem
domain/       Regras de negócio puras (sem HTTP, sem DB direto)
middlewares/  auth.js — JWT Bearer + checagem de roles
utils/        Funções utilitárias (números, datas)
database.js   Acesso ao SQLite via better-sqlite3 (WAL, transações ACID)
server.js     Boot: registra rotas, CORS, health, backup agendado
```

## Decisões técnicas

| Ponto | Decisão | Motivo |
|---|---|---|
| sql.js | Substituído por better-sqlite3 | Sem persist() manual, WAL nativo, transações ACID |
| setInterval persist | Removido | better-sqlite3 persiste incrementalmente |
| Operações compostas | Envolvidas em transaction() | Atomicidade (OS + log + lançamento) |
| Validações duplicadas | Extraídas para domain/ | DRY — alteração em um só lugar |
| JWT_SECRET hardcoded | Falha explícita em produção | Segurança |
| CORS origin:"*" | Lista de origens via env | Segurança |
| Usuários padrão em prod | Seed somente em development ou SEED_DEV=1 | Segurança |
| Backup | better-sqlite3 .backup() | Cópia quente sem travar o banco |
| NF-e incerta | Tentativa ativa persistente bloqueia reemissão | Evita duplicidade fiscal |
| XML NF-e | Banco é fonte de verdade; arquivo em disco é projeção | Recuperação sem perder autorização |
| Caixa de OS entregue | Edição valida saldo projetado em transação | Não reabre saldo de OS entregue |

## Fluxo de criação de OS

POST /api/ordens
  → validarEntradaOS() [domain]
  → transaction() {
      INSERT ordens
      INSERT statuslog (Aguardando)
      INSERT lancamentos (entradaos)
    }
  → resposta JSON { id, numero }

Se qualquer etapa falhar → ROLLBACK automático, nenhum dado inconsistente.

## Integridade fiscal NF-e

`POST /api/nfe/emitir/:id` é um adaptador HTTP fino. A rota valida
certificado, OS, itens, cliente e emitente antes de criar a tentativa. A
orquestração fica em `services/nfeEmissaoService.js`, com reserva de número em
`repositories/nfeAttemptRepository.js` e commit de autorização em
`services/nfePersistenceService.js`.

Contratos operacionais:

- `nfe_emissao_tentativas` guarda cada emissão com transições auditáveis em
  `nfe_emissao_transicoes`.
- `processando` e `incerto` são estados ativos; uma tentativa ativa retorna
  `409` e não transmite de novo.
- A chave idempotente usa `emissao:{ordem}:{serie}:{numero}:aN`. O sufixo `aN`
  preserva auditoria quando uma rejeição segura devolve a numeração e uma nova
  tentativa reutiliza o mesmo número.
- Timeout, retorno vazio, código desconhecido, cStat de duplicidade insegura e
  autorização sem XML legal ficam `incerto`. Não devolver número nem reenviar
  cegamente; consultar/reconciliar antes de nova tentativa.
- Rejeição conclusiva só devolve número quando estiver na allowlist segura.
- Autorização exige XML real `nfeProc` da mesma chave, com protocolo autorizado
  `cStat=100`; JSON nunca é aceito como XML legal.
- A autorização atualiza OS, cliente, evento fiscal e tentativa na mesma
  transação SQLite. O arquivo em `backend/data/nfe_xmls/` é gravado somente
  depois do commit; falha nesse arquivo gera alerta, mas o banco continua sendo
  a fonte de verdade.
- Estados `incerto` e `rejeitado` também são projetados em `ordens.nfe_status`
  e `nfe_eventos` para ficarem visíveis na tela fiscal atual.

## Integridade financeira do caixa

`PUT /api/caixa/:id` delega para `services/caixaLancamentoService.js`. A edição
carrega o lançamento atual, monta o lançamento projetado, identifica a OS antiga
e a nova OS com `domain/ordemPagamentoRules.js`, e valida tudo dentro da mesma
transação.

Regras:

- Somente lançamentos `pago=1` e `deletedat IS NULL` abatem saldo.
- Valores negativos entram como estorno.
- O saldo projetado nunca fica abaixo de zero.
- Se qualquer OS afetada estiver `Entregue` e terminaria com saldo positivo, a
  API retorna `409` com `code=os_entregue_saldo_aberto`.
- `entradaos` continua protegido: `caixa` não edita; `admin` altera apenas data
  e pagamento.
