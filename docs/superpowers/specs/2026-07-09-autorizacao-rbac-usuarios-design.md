# Design: Autorizacao RBAC e Gestao Segura de Usuarios

Data: 2026-07-09

## Objetivo

Substituir gradualmente a autorizacao baseada diretamente em `role` por uma base RBAC explicita, testavel e segura, sem comprometer auditoria, lancamentos, historico operacional, NF-e, oficina, caixa ou regras criticas de OS.

A pagina de usuarios deve evoluir para uma gestao completa, mas a prioridade e primeiro criar uma fundacao solida. Os perfis padrao (`admin`, `caixa`, `oficina`) continuam existindo, mas passam a representar conjuntos de permissoes. A edicao visual desses perfis fica para a ultima fase.

## Principios

- Nenhuma exclusao de usuario pode apagar historico operacional.
- `admin`, `caixa` e `oficina` permanecem como perfis padrao durante toda a migracao.
- Regras de negocio continuam separadas da autorizacao.
- Autorizacao responde se o usuario pode tentar uma acao.
- Regras de dominio respondem se aquela acao e valida para o estado atual.
- O sistema deve continuar invalidando sessao quando o usuario for desativado, arquivado ou tiver acesso alterado.
- Cada fase deve ser pequena, revisavel, testada e reversivel por commit.
- A troca de `role === ...` deve ser feita por area, nunca por edicao massiva sem cobertura.

## Modelo Conceitual

### Perfis

Perfis sao conjuntos nomeados de permissoes:

- `admin`: superusuario operacional. Deve sempre manter acesso total e capacidade de recuperar o sistema.
- `caixa`: atendimento, ordens, clientes, produtos, propostas, caixa operacional e NF-e operacional.
- `oficina`: fila de oficina, visualizacao redigida e atualizacao controlada de status.

Em fases futuras, o sistema podera receber perfis como `gerente`, `vendedor`, `fiscal` ou `producao` sem alterar dezenas de checks espalhados.

### Permissoes

Permissoes devem ser strings canonicas, agrupadas por dominio. Nomes iniciais sugeridos:

```txt
dashboard.ver
atendimento.ver

ordens.ver
ordens.criar
ordens.editar
ordens.alterar_status
ordens.cancelar
ordens.excluir
ordens.restaurar
ordens.excluir_permanente
ordens.imprimir

oficina.ver
oficina.alterar_status

caixa.ver
caixa.criar_lancamento
caixa.editar_lancamento
caixa.excluir_lancamento
caixa.fechamento

clientes.ver
clientes.criar
clientes.editar
clientes.excluir

produtos.ver
produtos.criar
produtos.editar
produtos.excluir

propostas.ver
propostas.criar
propostas.editar_status
propostas.gerar_os
propostas.imprimir

financeiro.ver
financeiro.contas_pagar.ver
financeiro.contas_pagar.editar
financeiro.contas_pagar.pagar
financeiro.relatorios

nfe.ver
nfe.emitir
nfe.cancelar
nfe.cce
nfe.xml
nfe.danfe
nfe.lixeira
nfe.inutilizar

relatorios.ver
relatorios.producao

usuarios.ver
usuarios.criar
usuarios.editar
usuarios.arquivar
usuarios.restaurar
usuarios.excluir_permanente
usuarios.resetar_senha

configuracoes.ver
configuracoes.editar_empresa
configuracoes.editar_fiscal
configuracoes.editar_whatsapp
configuracoes.editar_impressao
configuracoes.seguranca

backups.ver
backups.executar
```

Essa lista deve ser validada durante a implementacao contra as rotas reais em `frontend/src/App.jsx` e `backend/server.js`.

## Banco de Dados

Novas estruturas devem entrar em `backend/database.js` via `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ADD COLUMN`, preservando as regras de migracao do projeto.

### Tabelas novas

`permission_profiles`

- `id`
- `key` unico, por exemplo `admin`
- `name`
- `description`
- `system` para perfis padrao
- `active`
- `createdat`
- `updatedat`

`profile_permissions`

- `profile_id`
- `permission`
- chave unica por `profile_id` e `permission`

### Colunas novas em `users`

- `profile_key`, preenchido inicialmente com o mesmo valor de `role`.
- `deletedat`
- `deletedpor`
- `deletedreason`
- `updatedat`
- `access_version`, inteiro incrementado quando perfil, status de acesso ou arquivamento mudarem.

Durante a transicao, `role` continua existindo e deve continuar preenchido. `profile_key` e a fonte nova para permissao; `role` fica como compatibilidade ate a fase de limpeza.

## Backend

### Resolucao de permissoes

Criar um modulo de dominio para permissoes, por exemplo `backend/domain/permissionRules.js`, responsavel por:

- listar permissoes canonicas;
- mapear permissoes padrao por perfil;
- validar permissao desconhecida;
- resolver permissoes efetivas de um usuario;
- responder `hasPermission(user, permission)`;
- responder `hasAnyPermission(user, permissions)`;
- proteger invariantes de administracao.

### Middleware

Evoluir `backend/middlewares/auth.js` com novos middlewares:

```js
auth()
authRole(["admin"])
authPermission("usuarios.editar")
authAnyPermission(["ordens.editar", "ordens.alterar_status"])
```

Durante a migracao, `auth(["admin"])` pode continuar funcionando como compatibilidade, mas novas rotas e rotas migradas devem usar permissoes.

`req.user` deve carregar as informacoes necessarias para checks de permissao, sem colocar dados sensiveis no token. O banco deve continuar sendo consultado para validar usuario ativo, arquivamento, `access_version` e acesso atual a cada request.

### Rotas de Usuarios

Evoluir `/api/users` para suportar:

- listar usuarios ativos, inativos e arquivados;
- buscar resumo de bloqueios para exclusao permanente;
- criar usuario com perfil;
- editar dados basicos;
- alterar perfil;
- ativar/desativar;
- arquivar;
- restaurar;
- excluir permanentemente apenas se nao houver vinculos historicos;
- resetar senha.

Arquivar deve ser o caminho padrao de exclusao. Usuario arquivado nao autentica e nao aparece na lista principal, mas continua em `users` para joins historicos.

Exclusao permanente deve verificar pelo menos:

- `ordens.criadopor`
- `ordens.deletedpor`
- `ordens.nfe_deletedpor`
- `lancamentos.criadopor`
- `lancamentos.deletedpor`
- `statuslog.usuarioid`
- `produtos.deletedpor`
- `clientes.deletedpor`
- `propostas.criadopor`
- `contas_pagar.criadopor`
- `contas_pagar.deletedpor`
- `whatsapp_avisos.aberto_por`
- `whatsapp_avisos.enviado_por`
- `whatsapp_avisos.ignorado_por`
- `nfe_inutilizacoes.solicitado_por`

Se houver qualquer vinculo, retornar erro com resumo legivel.

### Invariantes obrigatorias

- Nao permitir arquivar, desativar, rebaixar ou remover permissoes criticas do proprio usuario.
- Nao permitir remover o ultimo admin ativo.
- Nao permitir remover a ultima conta com permissao `usuarios.editar` e `usuarios.restaurar`.
- Usuario arquivado, inativo ou com perfil inativo nao autentica.
- Mudancas de acesso devem invalidar sessoes antigas.
- Erros SQLite continuam sanitizados pelo `errorHandler`.

## Frontend

### AuthContext

Evoluir `frontend/src/context/AuthContext.jsx` para expor:

```js
can("nfe.emitir")
canAny(["ordens.editar", "ordens.alterar_status"])
permissions
profile
```

Os helpers atuais `isAdmin`, `isCaixa` e `isOficina` podem continuar temporariamente para reduzir risco, mas devem ser removidos por area ao longo da migracao.

### Rotas e Sidebar

`frontend/src/App.jsx` deve migrar de `roles` para `permissions` de forma gradual:

```jsx
<PrivateRoute permissions={["usuarios.ver"]}>
```

O menu lateral deve aparecer por permissao real, nao por role, ao final da migracao.

### Pagina de Usuarios

A pagina `/usuarios` deve evoluir para:

- busca por nome/login;
- filtros por ativo, inativo, arquivado e perfil;
- tabela operacional com acoes claras;
- modal de criacao/edicao com secoes Dados, Acesso e Seguranca;
- acao de arquivar com confirmacao e motivo;
- acao de restaurar;
- exclusao permanente somente quando a API indicar que e segura;
- exibicao do motivo quando a exclusao permanente estiver bloqueada.

A edicao visual dos perfis e da matriz de permissoes fica para a fase final. Antes disso, a tela pode mostrar o perfil e resumo das permissoes efetivas apenas para revisao.

## Fases

### Fase 1: Fundacao RBAC sem trocar rotas

Objetivo: criar modelo de permissoes e compatibilidade sem alterar comportamento.

Entregas:

- tabelas de perfil/permissoes;
- seed idempotente de `admin`, `caixa`, `oficina`;
- modulo `permissionRules`;
- testes de mapeamento dos perfis atuais;
- `auth/me` retornando permissoes efetivas;
- nenhuma rota de negocio migrada ainda.

Validacao:

- testes backend focados em permissoes;
- login dos tres perfis continua funcionando;
- rotas existentes mantem comportamento atual.

### Fase 2: Usuarios e exclusao segura

Objetivo: transformar gestao de usuarios sem tocar em dominios sensiveis.

Entregas:

- arquivar/restaurar usuario;
- exclusao permanente bloqueada por vinculos historicos;
- protecao de ultimo admin e autoprotecao;
- pagina `/usuarios` com filtros e acoes;
- testes backend de regras de usuario;
- testes frontend da pagina.

Validacao:

- usuario arquivado nao faz login;
- usuario com historico nao pode ser apagado permanentemente;
- usuario sem historico pode ser apagado permanentemente;
- historico continua mostrando nomes via `LEFT JOIN users`.

### Fase 3: Migracao de rotas administrativas simples

Objetivo: trocar checks de role em areas administrativas menos entrelacadas.

Areas candidatas:

- usuarios;
- configuracoes;
- backups;
- relatorios administrativos;
- financeiro admin;
- produtos/clientes onde o comportamento for simples.

Validacao:

- `routeContracts.test.js` deve ser atualizado para validar permissoes, nao apenas roles;
- cada endpoint migrado deve ter teste de permitido e negado;
- UI deve esconder acoes por `can(...)`.

### Fase 4: Migracao de dominios sensiveis

Objetivo: migrar OS, oficina, caixa, NF-e e propostas preservando regras criticas.

Cuidados:

- status de OS permanecem exatamente como definidos no `AGENTS.md`;
- oficina continua com dados sensiveis redigidos;
- oficina continua impedida de cancelar OS, mesmo se tiver acesso a status;
- entrega continua exigindo saldo zero;
- saldo continua vindo de `getResumoFinanceiroOS()`;
- NF-e autorizada/cancelada continua fora da lixeira fiscal;
- inutilizacao continua somente por fluxo explicito de UI.

Validacao:

- testes de contrato por rota;
- testes de regras de OS;
- testes de NF-e existentes;
- testes de caixa e financeiro relevantes;
- build frontend.

### Fase 5: Limpeza de frontend e helpers legados

Objetivo: remover dependencia visual de roles.

Entregas:

- `PrivateRoute` baseado em permissao;
- sidebar baseada em permissao;
- paginas usando `can(...)`;
- remocao gradual de `isAdmin`, `isCaixa`, `isOficina` onde nao forem mais necessarios;
- documentacao atualizada.

Validacao:

- busca por `role ===`, `isAdmin`, `isCaixa`, `isOficina` sem usos indevidos;
- testes frontend das telas com acoes condicionais;
- build frontend.

### Fase 6: Edicao visual de perfis

Objetivo: permitir gerenciar perfis pela tela depois que a base estiver validada.

Entregas:

- tela ou secao de perfis;
- matriz de permissoes por modulo;
- protecoes contra remover acesso administrativo essencial;
- auditoria visual clara do que cada perfil permite;
- possibilidade futura de criar novos perfis.

Validacao:

- alterar perfil invalida sessoes afetadas;
- nao e possivel travar todos os administradores fora do sistema;
- permissoes desconhecidas sao rejeitadas;
- perfis padrao podem ser restaurados para defaults.

## Testes

### Backend

Adicionar ou expandir:

- `permissionRules.test.js`;
- `userRules.test.js`;
- `auth.test.js`;
- `usersRoutes.test.js`, se ainda nao existir;
- `routeContracts.test.js`.

Rodar progressivamente:

```powershell
cd backend
npm.cmd test -- userRules.test.js
npm.cmd test -- auth.test.js
npm.cmd test -- routeContracts.test.js
npm.cmd test
```

### Frontend

Adicionar ou expandir:

- testes da pagina `Usuarios`;
- testes do `AuthContext` se ja houver padrao local;
- testes de acoes condicionais por permissao nas telas migradas.

Rodar progressivamente:

```powershell
cd frontend
npm.cmd test
npm.cmd run build
```

## Fora de Escopo Inicial

- Permissoes individuais por usuario.
- Auditoria completa de todas as alteracoes de permissao.
- Criacao de novos perfis customizados antes da fase final.
- Remocao imediata da coluna `role`.
- Reescrita de regras de negocio de OS, caixa, financeiro ou NF-e.

## Riscos e Mitigacoes

Risco: bloquear administradores fora do sistema.
Mitigacao: invariantes de ultimo admin e restauracao de defaults.

Risco: permissoes concederem acesso visual mas backend negar, ou o contrario.
Mitigacao: frontend usa permissoes de `/auth/me`; backend continua sendo fonte final.

Risco: apagar usuario com historico.
Mitigacao: arquivamento como exclusao padrao e bloqueio de exclusao permanente por varredura de vinculos.

Risco: quebrar regras de oficina e OS ao trocar roles por permissoes.
Mitigacao: migrar dominios sensiveis por ultimo, com testes de contrato e regras de negocio.

Risco: migracao longa deixar dois modelos confusos.
Mitigacao: documentar fase atual, manter compatibilidade explicita e remover helpers legados ao final.

## Criterios de Conclusao

O projeto sera considerado completo quando:

- todas as rotas usarem permissoes ou regras de negocio explicitas, sem dependencia indevida de `role`;
- `/auth/me` entregar permissoes efetivas;
- a sidebar e as acoes do frontend forem dirigidas por `can(...)`;
- usuarios puderem ser arquivados/restaurados com seguranca;
- exclusao permanente existir apenas para usuarios sem historico;
- perfis puderem ser revisados e editados pela tela;
- backend e frontend estiverem com testes relevantes passando;
- a documentacao refletir o novo modelo.

## Status de Implementacao

- Fase 1 implementada: fundacao RBAC, perfis de sistema, permissoes efetivas em `/auth/me` e token minimo com `accessVersion`.
- Fase 2 implementada: gestao de usuarios com filtros, arquivamento/restauracao, reset de senha, exclusao permanente bloqueada por vinculos historicos e tela `/usuarios` operacional.
- `/api/users`, a rota `/usuarios` e o link de Usuarios na sidebar usam permissoes `usuarios.*`.
- Rotas de negocio fora de usuarios continuam usando roles durante esta fase.
- Edicao visual de perfis e matriz de permissoes segue reservada para fase posterior.
