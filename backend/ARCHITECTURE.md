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
| Usuários padrão em prod | Seed somente em NODE_ENV≠production | Segurança |
| Backup | better-sqlite3 .backup() | Cópia quente sem travar o banco |

## Fluxo de criação de OS

POST /api/ordens
  → validarEntradaOS() [domain]
  → transaction() {
      INSERT ordens
      INSERT statuslog (Recebido)
      INSERT lancamentos (entradaos)
    }
  → resposta JSON { id, numero }

Se qualquer etapa falhar → ROLLBACK automático, nenhum dado inconsistente.
