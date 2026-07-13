# RBAC Fase 3 Financeiro Admin Implementation Plan

**Goal:** Migrar o financeiro administrativo para permissoes explicitas, preservando o comportamento padrao admin-only e sem alterar regras de caixa operacional, saldo de OS ou integridade financeira.

**Scope desta entrega:** `/api/financeiro`, rota `/financeiro`, link da sidebar e acoes visuais da pagina Financeiro.

## Regras

- `admin` continua com acesso total por permissoes padrao.
- `caixa` continua sem acesso ao financeiro admin.
- Saldo de OS continua vindo de `getResumoFinanceiroOS()`.
- Pagamento de contas a pagar continua criando lancamento de saida no caixa.
- Impressao operacional continua HTML servida pelo backend.
- Nao alterar `/api/caixa`, OS, NF-e, oficina ou propostas.

## Permissoes

- `financeiro.ver`: resumo, contas a receber e auditoria de integridade OS.
- `financeiro.contas_pagar.ver`: listagem de contas a pagar.
- `financeiro.contas_pagar.editar`: criar, editar, cancelar e excluir conta a pagar nao paga.
- `financeiro.contas_pagar.pagar`: marcar conta como paga e criar saida no caixa.
- `financeiro.relatorios`: DRE e impressoes financeiras.

## Tarefas

1. Backend contratos:
   - Atualizar `routeContracts.test.js` para validar `authPermission(...)` em todas as rotas de `financeiro`.
   - Manter os contratos de regras financeiras existentes.

2. Backend rotas:
   - Trocar `auth(["admin"])` por `auth(), authPermission(...)` em `backend/routes/financeiro.js`.

3. Frontend rota/menu:
   - Migrar `/financeiro` para permissoes em `App.jsx`.
   - Mostrar link Financeiro na Sidebar por permissoes `financeiro.*`.

4. Frontend acoes:
   - Carregar dados somente quando a permissao correspondente existir.
   - Exibir abas e botoes de criar/editar/pagar/cancelar/imprimir somente por permissao.

5. Validacao:
   - Backend: `npm.cmd test -- routeContracts.test.js permissionRules.test.js financeiroAdminRules.test.js financeiroIntegridadeService.test.js financeiroRules.test.js`.
   - Backend completo: `npm.cmd test`.
   - Frontend: `npm.cmd run build`.

## Fora de Escopo

- Migrar caixa operacional.
- Alterar calculos financeiros ou regras de saldo.
- Criar editor visual de perfis.
- Migrar OS, NF-e, oficina ou propostas.
