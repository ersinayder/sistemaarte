# RBAC Fase 3 Rotas Administrativas De Apoio Implementation Plan

**Goal:** Migrar endpoints administrativos de apoio para permissoes explicitas, sem abrir a tela de configuracoes inteira e sem tocar em dominios sensiveis.

**Scope desta entrega:** backups, relatorios administrativos e leituras de sistema/seguranca em configuracoes.

## Regras

- Backend continua sendo a fonte final de autorizacao.
- `admin` mantem acesso total pelas permissoes padrao.
- `caixa` mantem acesso ao resumo gerencial ja permitido por `relatorios.ver`.
- Rotas sensiveis de configuracoes fiscal, empresa, WhatsApp e impressao continuam fora deste recorte.
- A rota frontend `/configuracoes` continua sem ampliacao nesta entrega, porque a pagina agrega secoes sensiveis que precisam de gate visual proprio.
- Nao alterar OS, caixa, NF-e, financeiro admin, oficina, propostas ou regras de saldo/status.

## Permissoes

Backups:

- `backups.ver`: consultar status de backups.
- `backups.executar`: disparar backup manual.

Configuracoes:

- `configuracoes.ver`: consultar informacoes de sistema.
- `configuracoes.seguranca`: consultar estado das protecoes de seguranca.

Relatorios:

- `relatorios.ver`: consultar resumo administrativo.
- `relatorios.producao`: consultar e imprimir relatorio de producao.

## Tarefas

1. Backend contratos:
   - Atualizar `routeContracts.test.js` para validar permissoes em `backup`, `configuracoes` e `relatorios`.
   - Remover expectativas antigas de role nos endpoints migrados.

2. Backend rotas:
   - Trocar `auth(["admin"])` por `auth(), authPermission(...)` em `backend/routes/backup.js`.
   - Migrar os endpoints `/backups`, `/backups/manual`, `/seguranca` e `/sistema` em `backend/routes/configuracoes.js`.
   - Migrar `/resumo`, `/producao` e `/producao/pdf` em `backend/routes/relatorios.js`.

3. Validacao:
   - Backend: `npm.cmd test -- routeContracts.test.js permissionRules.test.js`.
   - Backend completo: `npm.cmd test`.
   - Frontend build apenas como smoke test, sem mudancas de UI.

## Fora de Escopo

- Abrir `/configuracoes` para perfis nao-admin.
- Gates visuais dentro de `Configuracoes.jsx`.
- Escritas fiscal, empresa, WhatsApp e impressao.
- Financeiro admin, caixa, OS, NF-e, oficina e propostas.
- Edicao visual de perfis ou matriz de permissoes.
