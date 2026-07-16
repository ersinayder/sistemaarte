# RBAC Fase 7: Perfis Customizados E Atribuicao Segura

## Objetivo

Permitir criar perfis customizados e atribui-los a usuarios sem transformar `users.role` em permissao dinamica. O sistema passa a tratar:

- `role` como tipo estrutural fixo: `admin`, `caixa`, `oficina`;
- `profile_key` como perfil efetivo de permissoes;
- `permission_profiles.base_role` como compatibilidade entre perfil efetivo e tipo estrutural.

## Decisoes

1. `role` continua restrito aos tres tipos atuais. Ele ainda protege regras estruturais, como ultimo administrador ativo, visualizacao redigida da oficina e compatibilidade historica.
2. Perfis customizados sao linhas em `permission_profiles` com `system=0`, `active=1` e `base_role` obrigatorio.
3. Perfis de sistema recebem `base_role` igual a sua chave (`admin`, `caixa`, `oficina`) via schema, migration e seed.
4. Um usuario so pode receber `profile_key` existente, ativo e com `base_role` igual ao `role` estrutural escolhido.
5. Alterar `profile_key` incrementa `users.access_version`.
6. O proprio usuario nao pode alterar seu `role`, seu `profile_key` ou se desativar pela tela de gestao.
7. O backend bloqueia qualquer alteracao que deixe zero usuarios ativos com permissoes `usuarios.ver`, `usuarios.editar` e `usuarios.restaurar`.
8. Criar/editar matriz de perfis exige `configuracoes.seguranca`; editar usuario continua usando `usuarios.editar`.
9. O perfil `admin` continua protegido com todas as permissoes.

## Entregas

- Coluna `permission_profiles.base_role` com migracao segura.
- `POST /api/permission-profiles` para criar perfil customizado.
- Listagem de perfis expondo `base_role`.
- `POST /api/users` e `PUT /api/users/:id` aceitando `profile_key` separado de `role`.
- Tela `/usuarios` separando "Tipo estrutural" e "Perfil de permissoes".
- Aba `Perfis` com acao "Novo perfil" baseada em um perfil existente ou tipo estrutural.
- Testes backend e frontend cobrindo criacao, atribuicao, incompatibilidade e invalidacao de sessao.

## Fora De Escopo

- Permissoes individuais por usuario.
- Remocao da coluna `role`.
- Transformar `role` em perfil dinamico.
- Hierarquia de perfis, escopo por loja/turno ou regras de aprovacao.
- Exclusao fisica de perfis com historico.

## Validacao

- Perfil customizado criado com permissoes conhecidas e `base_role` valido.
- Perfil customizado inativo ou incompatibilidade `role/profile_key` sao rejeitados.
- Troca de `profile_key` nao altera `role` e incrementa `access_version`.
- Nao e possivel remover o ultimo usuario ativo capaz de gerenciar usuarios.
- `/auth/me` reflete as permissoes efetivas do perfil customizado.
- Backend completo, frontend completo e build frontend passam.
