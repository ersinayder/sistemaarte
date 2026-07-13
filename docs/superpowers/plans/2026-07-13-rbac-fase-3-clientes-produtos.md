# RBAC Fase 3 Clientes E Produtos Implementation Plan

**Goal:** Migrar um recorte administrativo simples de `role` para permissoes explicitas, sem tocar nos dominios sensiveis de OS, caixa, NF-e, oficina, propostas, financeiro admin ou configuracoes.

**Scope desta entrega:** somente `clientes` e `produtos`.

## Regras

- Manter comportamento padrao para perfis atuais: `admin` e `caixa` continuam acessando clientes/produtos; `oficina` continua sem acesso.
- Backend continua sendo fonte final de autorizacao.
- Frontend usa `can(...)`/`canAny(...)` para rota, menu e acoes.
- Nao alterar regras de OS, status, saldo, NF-e ou caixa.
- Nao criar editor visual de perfis nesta fase.

## Permissoes

Clientes:

- `clientes.ver`: listar, buscar, ver detalhes e historico.
- `clientes.consultar_documentos`: consultar CNPJ.
- `clientes.criar`: criar cliente.
- `clientes.editar`: editar cliente.
- `clientes.excluir`: soft-delete de cliente.

Produtos:

- `produtos.ver`: listar e ver produto.
- `produtos.criar`: criar produto.
- `produtos.editar`: editar produto.
- `produtos.excluir`: soft-delete de produto.

## Tarefas

1. Backend contratos:
   - Atualizar `routeContracts.test.js` para validar permissoes em `clientes` e `produtos`.
   - Manter contratos role-based das areas sensiveis inalterados.

2. Backend rotas:
   - Trocar `auth([...])` por `auth(), authPermission(...)` em `backend/routes/clientes.js`.
   - Trocar `auth([...])` por `auth(), authPermission(...)` em `backend/routes/produtos.js`.

3. Frontend rotas/menu:
   - Migrar `/clientes`, `/clientes/:id` e `/produtos` em `App.jsx` para permissoes.
   - Mostrar links de Clientes/Produtos na Sidebar por `can("clientes.ver")` e `can("produtos.ver")`.

4. Frontend acoes:
   - Em `Clientes.jsx`, condicionar criar, editar, consultar CNPJ e excluir por permissoes.
   - Em `Produtos.jsx`, condicionar criar, editar e excluir por permissoes.

5. Validacao:
   - Backend: `npm.cmd test -- routeContracts.test.js permissionRules.test.js`.
   - Frontend: testes focados de App/Sidebar e paginas alteradas, quando existentes.
   - Build frontend.
   - Busca por `auth(["admin","caixa"])` restante em clientes/produtos deve retornar vazio.

## Fora de Escopo

- Configuracoes, backups, financeiro admin, relatorios, caixa, NF-e, OS, oficina e propostas.
- Edicao de perfis ou matriz de permissoes.
- Criacao de novas permissoes.
