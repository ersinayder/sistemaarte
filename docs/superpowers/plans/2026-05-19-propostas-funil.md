# Propostas Funil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal proposals funnel while preserving `/orcamento` as the fast counter calculator.

**Architecture:** Add proposal tables and a focused `propostas` route that mirrors the existing OS item shape, then create a compact React funnel page and a save-proposal action in the calculator. Proposal approval does not create an OS automatically; `Gerar OS` calls a backend action that reuses the existing OS creation rules.

**Tech Stack:** Express 4, SQLite via `better-sqlite3`, React 18, Vite 8, Vitest 4.1.

---

### Task 1: Proposal Domain And Schema

**Files:**
- Create: `backend/domain/propostasRules.js`
- Create: `backend/__tests__/propostasRules.test.js`
- Modify: `backend/database.js`

- [x] **Step 1: Write failing rules tests**

Cover valid statuses, invalid statuses, final states, and whether an OS can be generated.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/propostasRules.test.js`
Expected: fail because `domain/propostasRules.js` does not exist.

- [x] **Step 3: Implement rules and schema**

Create `propostas` and `proposta_itens` in `database.js`, plus migrations with `CREATE TABLE IF NOT EXISTS`.

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/propostasRules.test.js`
Expected: pass.

### Task 2: Backend Propostas API

**Files:**
- Create: `backend/routes/propostas.js`
- Modify: `backend/server.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [x] **Step 1: Write failing route contracts**

Assert `/api/propostas` is mounted, routes are admin/caixa only, and `gerar-os` delegates to proposal conversion.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/routeContracts.test.js`
Expected: fail until route is created and mounted.

- [x] **Step 3: Implement API**

Implement list/detail/create/status/update and `POST /:id/gerar-os`.

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/propostasRules.test.js __tests__/routeContracts.test.js`
Expected: pass.

### Task 3: Frontend Funnel And Calculator Save

**Files:**
- Create: `frontend/src/pages/Propostas.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/pages/Orcamento.jsx`

- [x] **Step 1: Add route and menu**

Add `/propostas` for `admin` and `caixa`, with a menu item under Operacao.

- [x] **Step 2: Create Propostas page**

Implement kanban columns, cards, status buttons, detail modal, and `Gerar OS` for approved proposals.

- [x] **Step 3: Add Save Proposal to calculator**

Keep the current calculator UX and add a `Salvar proposta` action that posts calculated items to `/api/propostas`.

- [x] **Step 4: Run frontend build**

Run: `npm.cmd run build`
Expected: build succeeds.

### Task 4: Verification And Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-05-19-propostas-funil.md`

- [x] **Step 1: Update docs**

Mark Propostas/Funil phase 1 as implemented and leave public link/WhatsApp as next phase.

- [x] **Step 2: Run backend tests**

Run: `npm.cmd test`
Expected: all tests pass.

- [x] **Step 3: Run frontend build**

Run: `npm.cmd run build`
Expected: production build succeeds.

- [ ] **Step 4: Commit and push**

Commit: `feat: add propostas funnel`
