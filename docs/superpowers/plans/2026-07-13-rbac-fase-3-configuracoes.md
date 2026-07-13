# RBAC Fase 3 Configuracoes Implementation Plan

**Goal:** Finalizar a Fase 3 migrando Configuracoes completas para permissoes explicitas, sem alterar regras fiscais, WhatsApp, impressao, backup ou seguranca.

**Scope desta entrega:** `/api/configuracoes`, rota `/configuracoes`, Sidebar, filtros da pagina Configuracoes, e fechamento de rotas simples restantes (`/api/kpis` e `/api/consulta`).

## Regras

- `admin` continua com acesso total por permissoes padrao.
- Perfis `caixa` e `oficina` continuam sem acesso padrao a Configuracoes.
- Fiscal, WhatsApp e Impressao continuam usando as mesmas validacoes, serviços e salvamento de segredos existentes.
- Backup manual continua exigindo permissao propria `backups.executar`.
- Nao alterar NF-e operacional, caixa, OS, oficina, propostas ou regras de saldo/status.
- Dashboard e consultas externas ficam permissionados sem alterar calculos ou provedores.

## Permissoes

- `configuracoes.ver`: resumo geral, empresa em leitura e sistema.
- `configuracoes.editar_empresa`: salvar dados da empresa.
- `configuracoes.editar_fiscal`: fiscal, certificado e autorizados XML.
- `configuracoes.editar_whatsapp`: WhatsApp e status do servico local.
- `configuracoes.editar_impressao`: configuracao, teste e diagnostico de impressao.
- `configuracoes.seguranca`: leitura de politicas de seguranca.
- `backups.ver`: leitura de status de backups.
- `backups.executar`: backup manual.
- `dashboard.ver`: KPIs e stream operacional do dashboard.
- `dashboard.integridade`: resumo de integridade operacional.
- `clientes.consultar_documentos`: consultas CNPJ, CPF e CEP.

## Tarefas

1. Backend contratos:
   - Atualizar `routeContracts.test.js` para validar `authPermission(...)` em todos os endpoints de Configuracoes.
   - Atualizar contratos antigos que esperavam `auth(["admin"])` em impressao e WhatsApp.

2. Backend rotas:
   - Migrar `/`, `/empresa`, `/fiscal`, `/whatsapp`, `/impressao`, `/backups`, `/seguranca` e `/sistema`.
   - Preservar handlers e validadores existentes.

3. Frontend rota/menu:
   - Migrar `/configuracoes` para permissoes em `App.jsx`.
   - Mostrar link da Sidebar por permissoes `configuracoes.*` ou `backups.*`.

4. Frontend pagina:
   - Filtrar secoes por permissao.
   - Evitar chamadas para secoes nao permitidas.
   - Esconder botoes de escrita e backup manual quando a permissao nao existir.

5. Fechamento simples:
   - Migrar `/api/kpis` para `dashboard.*`.
   - Migrar `/api/consulta` para `clientes.consultar_documentos`.
   - Migrar rota/menu do Dashboard para `dashboard.ver`.
   - Mostrar painel de integridade do Dashboard por `dashboard.integridade`.

6. Validacao:
   - Backend: `npm.cmd test -- routeContracts.test.js`.
   - Backend completo: `npm.cmd test`.
   - Frontend: `npm.cmd run build`.

## Fora de Escopo

- Migrar OS, caixa, NF-e, oficina ou propostas.
- Redesenhar a tela de Configuracoes.
- Criar editor visual de perfis.
- Alterar schema ou regras fiscais/financeiras.
