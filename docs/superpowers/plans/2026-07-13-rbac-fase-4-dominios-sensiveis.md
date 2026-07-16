# RBAC Fase 4 Dominios Sensiveis Implementation Plan

**Goal:** Migrar dominios operacionais sensiveis para permissoes granulares, preservando regras de negocio de OS, caixa, oficina, propostas e NF-e.

## Escopo entregue

- Backend:
  - `/api/caixa` protegido por `caixa.ver`, `caixa.criar_lancamento`, `caixa.editar_lancamento`, `caixa.excluir_lancamento` e `caixa.fechamento`.
  - `/api/ordens` protegido por `ordens.*`, `oficina.alterar_status` e `ordens.whatsapp`, com cancelamento separado por `ordens.cancelar`.
  - Impressao/PDF de OS protegido por `ordens.imprimir`.
  - `/api/propostas` protegido por `propostas.*`.
  - `/api/nfe` protegido por `nfe.*`, incluindo integridade, exportacao, conciliacao, XML, DANFE, lixeira e inutilizacao.
- Frontend:
  - `App.jsx` usa `permissions` nas rotas sensiveis.
  - `Sidebar` usa permissoes reais para exibicao de modulos.
  - Atendimento, Ordens, Detalhe de OS, Oficina, Caixa, Propostas e NF-e escondem e bloqueiam acoes por `can(...)`.
- Contratos:
  - `authPermission` e `authAnyPermission` expoem metadados de teste sem alterar comportamento de runtime.
  - Testes de contrato foram atualizados para permissoes, nao roles.

## Protecoes preservadas

- Status de OS permanecem inalterados.
- Oficina pode alterar status permitido, mas nao cancela OS.
- Cancelar OS exige `ordens.cancelar`, mesmo em rotas genericas de update/status.
- Entrega continua validada pelas regras existentes e saldo oficial.
- Saldo de OS continua centralizado em `getResumoFinanceiroOS()`.
- NF-e autorizada/cancelada permanece fora da lixeira fiscal.
- Inutilizacao fiscal segue em fluxo explicito e protegido por `nfe.inutilizar`.

## Validacao executada

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
npm.cmd test

cd ..\frontend
npm.cmd ci
npm.cmd run build
npm.cmd test
```

Resultados:

- Backend contratos: 85 testes passando.
- Backend completo: 82 arquivos, 745 testes passando.
- Frontend build: sucesso.
- Frontend completo: 10 arquivos, 47 testes passando.

## Fora desta fase

- Edicao visual da matriz de perfis/permissoes.
- Remocao completa de todos os helpers legados `isAdmin`, `isCaixa` e `isOficina`.
- Criacao de perfis customizados pela UI.
