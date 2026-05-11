# Sistema Arte e Molduras

Sistema interno de gestão de ordens de serviço (OS), caixa, clientes e produtos para a loja **Arte e Molduras**.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + TailwindCSS |
| Backend | Node.js 22 + Express |
| Banco | SQLite (`better-sqlite3`) — WAL mode |
| Auth | JWT via cookie HttpOnly (`12h`) |
| Deploy | PM2 + GitHub Actions (self-hosted runner, Windows Server) |
| Testes | Vitest |

## Rodar localmente

```bash
# Backend
cd backend
npm install
cp .env.example .env   # preencher JWT_SECRET e demais vars
NODE_ENV=development node server.js

# Frontend (outro terminal)
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173 | Backend: http://localhost:3001

### Usuários padrão (somente dev)

> ⚠️ O seed de usuários padrão **só executa** quando `NODE_ENV=development` ou `SEED_DEV=1`.
> Em qualquer outro ambiente (incluindo variável não definida) o seed **não roda**.

| Usuário | Senha | Role |
|---|---|---|
| admin | admin123 | admin |
| caixa | caixa123 | caixa |
| oficina | oficina123 | oficina |

## Variáveis de ambiente (`.env`)

```env
JWT_SECRET=<string longa aleatória>
PORT=3001
CORS_ORIGINS=https://seudominio.com.br
NODE_ENV=production

# WhatsApp — Evolution API (opcional)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=
WHATSAPP_ENABLED=false
```

> **O `.env` nunca é commitado.** Em produção fica em `C:\sistemaarte\backend\.env`.

## Deploy em produção

O deploy é automático via `push` na branch `main`:

1. GitHub Actions roda os testes (`vitest run`)
2. Faz build do frontend (`npm run build`)
3. Sincroniza os arquivos no servidor via `robocopy`
4. Reinicia o backend com `pm2 start ecosystem.config.js --env production`

### Reiniciar manualmente

```powershell
cd C:\sistemaarte\backend
pm2 delete sistemaarte-backend
pm2 start ecosystem.config.js --env production
pm2 save
```

## Estrutura de pastas

```
sistemaarte/
├── backend/
│   ├── __tests__/          # Testes Vitest
│   ├── data/               # oficina.db + backups (não commitado)
│   ├── domain/             # Regras de negócio (ordensRules, financeiroRules)
│   ├── middlewares/        # auth.js, errorHandler.js
│   ├── routes/             # Uma rota por recurso
│   ├── utils/              # dates.js, numbers.js, whatsapp.js
│   ├── database.js         # initDB, WAL, schema, migrations
│   ├── ecosystem.config.js # Configuração PM2
│   └── server.js           # Entry point Express
└── frontend/
    └── src/
        ├── components/     # Componentes reutilizáveis
        ├── context/        # AuthContext
        ├── hooks/          # Hooks customizados
        ├── pages/          # Uma página por rota
        └── services/
            └── api.js      # Axios com withCredentials e interceptors
```

## Testes

```bash
cd backend
npm test
```

86 testes cobrindo: auth middleware, regras de OS, financeiro, utils.
