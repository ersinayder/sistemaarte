# Financeiro Administrativo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old reports page with an admin-only financial management area containing monthly summary, accounts payable, receivables, and a simple DRE.

**Architecture:** Add a new `contas_pagar` table and admin-only `/api/financeiro` route. Keep the operational `/caixa` flow intact; paying an account creates a real `Saida` launch in `lancamentos`. Rename the frontend reports page to `Financeiro.jsx` and update internal links to `/financeiro`.

**Tech Stack:** Express 4, SQLite/better-sqlite3, React 18, Vite, Vitest.

---

### Task 1: Backend Rules And Schema

**Files:**
- Create: `backend/domain/financeiroAdminRules.js`
- Create: `backend/__tests__/financeiroAdminRules.test.js`
- Modify: `backend/database.js`

- [x] Write failing tests for account payable status normalization, validation, and summary math.
- [x] Add `contas_pagar` schema and migrations with indexes.
- [x] Implement the rules module.
- [x] Run `npm.cmd test -- __tests__/financeiroAdminRules.test.js`.

### Task 2: Admin Finance API

**Files:**
- Create: `backend/routes/financeiro.js`
- Modify: `backend/server.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [x] Write route contract tests for `/api/financeiro` mount and admin-only routes.
- [x] Implement monthly summary, DRE, accounts payable CRUD, pay/cancel actions, and receivables from OS balances.
- [x] Keep `/api/relatorios` available for existing dashboard use.
- [x] Run route contract tests.

### Task 3: Frontend Finance Page

**Files:**
- Rename: `frontend/src/pages/Relatorios.jsx` to `frontend/src/pages/Financeiro.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx` only if internal links/API calls require it.

- [x] Rename the route to `/financeiro` and make it admin-only.
- [x] Replace the old reports screen with tabs: Resumo mensal, Contas a pagar, Contas a receber, DRE.
- [x] Add account creation and mark-as-paid UI.
- [x] Update the sidebar label and old `/relatorios` route behavior.

### Task 4: Docs And Verification

**Files:**
- Modify: `AGENTS.md`

- [x] Document the new finance separation and route names.
- [x] Run backend tests.
- [x] Run frontend build.
