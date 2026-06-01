# UI Professional Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Sistema Arte frontend visual system and daily-use ergonomics without changing business rules, API contracts, status literals, roles, auth, fiscal flows, or financial calculations.

**Architecture:** Apply a conservative visual layer first, then upgrade the highest-volume screens with responsive card/table patterns. Keep existing React page logic in place and use CSS classes plus small JSX adaptations to avoid risky behavior changes.

**Tech Stack:** React 18, Vite 8, existing CSS tokens in `frontend/src/styles/global.css`, existing API service, existing page components.

---

## File Structure

- Modify `frontend/src/styles/global.css`: add professional ERP layout primitives, filter bars, data surfaces, responsive tables, mobile record cards, modal/form polish, sidebar/topbar refinements.
- Modify `frontend/src/components/Layout.jsx`: apply clearer topbar classes and remove brittle inline role-pill styling.
- Modify `frontend/src/components/Sidebar.jsx`: improve navigation polish and fix the visible `Configurações` label without changing routes or role gates.
- Modify `frontend/src/pages/Ordens.jsx`: preserve API/status/actions, add desktop table classing and a mobile card list for daily OS scanning.
- Modify `frontend/src/pages/Caixa.jsx`: preserve financial values from backend, add filter/data surface and mobile movement cards.
- Modify `frontend/src/pages/Clientes.jsx`: preserve CRUD/detail behavior, improve page shell and mobile cards.
- Modify `frontend/src/pages/Produtos.jsx`: preserve CRUD/fiscal defaults, improve filters and mobile product cards.
- Modify `frontend/src/pages/Propostas.jsx`: preserve funnel statuses and drag/drop, improve kanban/mobile layout and modal density.
- Modify `frontend/src/pages/Dashboard.jsx`: preserve KPI/SSE logic, improve dashboard shell and chart/card consistency.
- Optionally modify `frontend/src/pages/Atendimento.jsx` and `frontend/src/pages/NotasFiscais.jsx` only with non-behavioral class polish if time permits after core screens.

## Contracts To Preserve

- OS statuses remain exactly `Aguardando`, `Em Produção`, `Pronto`, `Entregue`, `Cancelado`.
- Proposal statuses remain exactly `Novo lead`, `Orcamento enviado`, `Negociacao`, `Aprovado`, `Perdido`.
- Roles remain exactly `admin`, `caixa`, `oficina`; route gates stay unchanged.
- Auth stays on `baseURL: /api`, `withCredentials: true`, and `GET /auth/me`.
- NF-e status/actions/endpoints remain unchanged.
- UI reads `saldoaberto` and other financial summaries from backend; no frontend recalculation.

## Tasks

### Task 1: Global Visual System

**Files:**
- Modify: `frontend/src/styles/global.css`

- [ ] Add page shells, filter bars, data surfaces, responsive table wrappers, mobile record cards, compact action groups, consistent badges, and modal/form polish.
- [ ] Ensure CSS is additive and scoped to shared classes or existing app containers.
- [ ] Keep dark/light token compatibility.

### Task 2: Layout And Navigation

**Files:**
- Modify: `frontend/src/components/Layout.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] Move role/date/header styling into CSS classes.
- [ ] Improve sidebar item/badge/footer visual consistency.
- [ ] Fix `Configuracoes` to `Configurações`.
- [ ] Preserve all routes and role conditionals.

### Task 3: Operational Tables

**Files:**
- Modify: `frontend/src/pages/Ordens.jsx`
- Modify: `frontend/src/pages/Caixa.jsx`

- [ ] Add mobile card list while keeping desktop table.
- [ ] Keep all existing actions, permissions, API calls, filters, pagination, status colors, and money formatting.
- [ ] Improve filter bar wrapping and table density.

### Task 4: Catalog And CRM Screens

**Files:**
- Modify: `frontend/src/pages/Clientes.jsx`
- Modify: `frontend/src/pages/Produtos.jsx`

- [ ] Add mobile card lists and improve table surfaces.
- [ ] Preserve CRUD modals and delete confirmations.
- [ ] Keep product fiscal defaults and client detail behavior unchanged.

### Task 5: Dashboard And Sales Funnel

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Propostas.jsx`

- [ ] Improve dashboard hierarchy using existing data.
- [ ] Improve proposal kanban readability and mobile handling.
- [ ] Keep drag/drop, PDF, WhatsApp, and generate-OS flow unchanged.

### Task 6: Verification

**Commands:**
- `cd frontend; npm run build`
- `rg -n "Em Producao|Cancelada|Configuracoes" frontend/src`
- `git diff -- frontend/src/services/api.js frontend/src/context/AuthContext.jsx frontend/src/App.jsx backend`

- [ ] Build must pass.
- [ ] Forbidden status typo `Em Producao` must not appear.
- [ ] Auth, route gates, and backend must not be changed.
- [ ] Run browser visual review on desktop and mobile with the populated development data.
