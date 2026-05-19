# Proposta PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add printable proposal PDF/HTML so counter staff can save or send proposals through WhatsApp manually.

**Architecture:** Create a focused `backend/utils/propostaPdf.js` renderer that receives a proposal and its items and returns printable HTML. Add `GET /api/propostas/:id/pdf` to the existing proposals route, then expose a `PDF` action in the proposal modal.

**Tech Stack:** Express 4, SQLite via `better-sqlite3`, React 18, Vite 8, Vitest 4.1.

---

### Task 1: Proposal PDF Renderer

**Files:**
- Create: `backend/utils/propostaPdf.js`
- Create: `backend/__tests__/propostaPdf.test.js`

- [x] **Step 1: Write failing renderer tests**

Cover title, proposal number, customer, item rows, total, print button, and HTML escaping.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/propostaPdf.test.js`
Expected: fail because `utils/propostaPdf.js` does not exist.

- [x] **Step 3: Implement renderer**

Return complete `<!doctype html>` with print styles and an `Imprimir / salvar PDF` button.

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/propostaPdf.test.js`
Expected: pass.

### Task 2: Backend Endpoint

**Files:**
- Modify: `backend/routes/propostas.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [x] **Step 1: Write failing route contract**

Assert `GET /:id/pdf` is admin/caixa only and uses `renderPropostaHtml`.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/routeContracts.test.js`
Expected: fail until the endpoint is added.

- [x] **Step 3: Implement endpoint**

Fetch proposal and items, return `text/html; charset=utf-8`, and 404 when proposal does not exist.

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/propostaPdf.test.js __tests__/routeContracts.test.js`
Expected: pass.

### Task 3: Frontend Integration

**Files:**
- Modify: `frontend/src/pages/Propostas.jsx`

- [x] **Step 1: Add PDF action**

Add a `PDF` button in the proposal modal that opens `/api/propostas/{id}/pdf` in a new tab.

- [x] **Step 2: Run frontend build**

Run: `npm.cmd run build`
Expected: build succeeds.

### Task 4: Docs And Verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-05-19-proposta-pdf.md`
- Modify: `docs/superpowers/specs/2026-05-19-propostas-funil-design.md`

- [x] **Step 1: Update docs**

Remove link public as near-term roadmap and document proposal PDF as the current next step.

- [x] **Step 2: Run backend tests**

Run: `npm.cmd test`
Expected: all tests pass.

- [x] **Step 3: Run frontend build**

Run: `npm.cmd run build`
Expected: production build succeeds.

- [ ] **Step 4: Commit and push**

Commit: `feat: add proposal pdf`
