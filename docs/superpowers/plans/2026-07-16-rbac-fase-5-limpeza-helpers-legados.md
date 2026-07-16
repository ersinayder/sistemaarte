# RBAC Fase 5 Limpeza De Helpers Legados Implementation Plan

**Goal:** Remover dependencia de autorizacao visual por `role` depois da migracao das rotas sensiveis, mantendo `role` apenas como dado legado de cadastro/perfil ate a fase de edicao visual de perfis.

## Escopo entregue

- `frontend/src/App.jsx`
  - `PrivateRoute` aceita somente `permissions`.
  - rota inicial e tela sem acesso usam apenas `canAny`.
- `frontend/src/context/AuthContext.jsx`
  - removeu `isAdmin`, `isCaixa` e `isOficina` do provider.
  - manteve `profile` com fallback para `role` como compatibilidade de dados.
- `frontend/src/components/Sidebar.jsx` e `frontend/src/components/Layout.jsx`
  - navegacao e exibicao visual usam permissoes/perfil.
  - classes e estilos de topbar foram renomeados de role para profile.
- Paginas operacionais
  - Clientes e Produtos removem fallbacks por role.
  - Oficina exibe valores apenas quando o usuario possui permissoes operacionais nao redigidas.
  - OrdemDetalhe usa contexto de rota para modo oficina, nao helper de role.
  - NF-e usa `canConciliar` no modal de conciliacao.
- Backend
  - `auth()` virou autenticacao pura; autorizacao fica em `authPermission`/`authAnyPermission`.
  - XML de evento fiscal oculto usa permissao `nfe.lixeira`, nao `admin`.
  - redacao de dados da oficina em OS usa permissoes.
  - avisos WhatsApp de OS usam capacidade por permissao e preservam bloqueio para usuario em visualizacao redigida.

## Preservado intencionalmente

- `users.role` e referencias na pagina de Usuarios seguem como dado legado de cadastro/perfil ate a fase de edicao visual de perfis.
- `AuthContext.profile` ainda faz fallback para `user.role` para sessoes antigas ou respostas incompletas.
- Regras de dominio de ultimo admin continuam usando `role` enquanto a modelagem de perfis customizados nao estiver concluida.

## Validacao executada

```powershell
cd backend
npm.cmd test -- whatsappAvisosRules.test.js routeContracts.test.js ordemPrintRoute.test.js
npm.cmd test -- auth.test.js whatsappAvisosRoutes.test.js
npm.cmd test

cd ..\frontend
npm.cmd run build
npm.cmd test
```

Resultados:

- Backend focado: 99 testes passando em `whatsappAvisosRules`, `routeContracts` e `ordemPrintRoute`.
- Backend auth/WhatsApp routes: 32 testes passando.
- Backend completo: 82 arquivos, 745 testes passando.
- Frontend build: sucesso.
- Frontend completo: 10 arquivos, 48 testes passando.
