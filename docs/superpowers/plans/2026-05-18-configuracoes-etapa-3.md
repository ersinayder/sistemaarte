# Configuracoes Etapa 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar as abas WhatsApp, Backups, Seguranca e Sistema funcionais para administradores.

**Architecture:** O backend continua centralizado em `routes/configuracoes.js`, com regras puras em `domain/` e resolvers em `utils/` para preservar fallback de `.env`. O frontend troca as secoes planejadas por paineis reais, sem expor tokens ou segredos.

**Tech Stack:** Express 4, SQLite/better-sqlite3, Vitest, React 18, Vite.

---

### Task 1: WhatsApp Config

**Files:**
- Create: `backend/domain/whatsappConfigRules.js`
- Create: `backend/__tests__/whatsappConfigRules.test.js`
- Create: `backend/utils/whatsappConfig.js`
- Modify: `backend/database.js`
- Modify: `backend/utils/whatsapp.js`
- Modify: `backend/routes/configuracoes.js`

- [ ] **Step 1: Write failing rules tests**

Cover normalization, hidden token behavior, status pending/OK, and DB-first/env fallback.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- whatsappConfigRules.test.js`

- [ ] **Step 3: Implement rules, resolver, table, and routes**

Add singleton `whatsapp_config`, sanitize responses, and update send code to read DB-first config while preserving `.env` fallback.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- whatsappConfigRules.test.js`

- [ ] **Step 5: Commit**

Commit: `feat: add whatsapp settings backend`

### Task 2: Backup Status

**Files:**
- Create: `backend/utils/backupStatus.js`
- Create: `backend/__tests__/backupStatus.test.js`
- Modify: `backend/routes/configuracoes.js`

- [ ] **Step 1: Write failing backup tests**

Cover empty directory, fresh backup, stale backup, retention count, and next scheduled local run.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- backupStatus.test.js`

- [ ] **Step 3: Implement status and manual backup endpoints**

Expose `GET /api/configuracoes/backups` and `POST /api/configuracoes/backups/manual`.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- backupStatus.test.js`

- [ ] **Step 5: Commit**

Commit: `feat: add backup settings status`

### Task 3: Security And System Panels

**Files:**
- Create: `backend/domain/userRules.js`
- Create: `backend/__tests__/userRules.test.js`
- Modify: `backend/routes/users.js`
- Modify: `backend/routes/configuracoes.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Write failing security tests**

Cover minimum password length and prevention of admin self-demotion/self-deactivation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- userRules.test.js`

- [ ] **Step 3: Implement safer user rules and settings status**

Require 8-character passwords, block own role/active downgrade, reduce global API rate limit to 60/min, and expose security/system status without secrets.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd test -- userRules.test.js`

- [ ] **Step 5: Commit**

Commit: `feat: add security settings status`

### Task 4: Frontend Tabs

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Replace planned sections with real panels**

Add WhatsApp form, Backup status/actions, Security checklist, and System health cards.

- [ ] **Step 2: Build frontend**

Run: `npm.cmd run build`

- [ ] **Step 3: Smoke test local route**

Open `/configuracoes` and verify every tab renders for admin.

- [ ] **Step 4: Commit**

Commit: `feat: complete configuracoes operational tabs`

### Final Verification

- [ ] Run: `npm.cmd test`
- [ ] Run: `npm.cmd run build`
- [ ] Smoke test authenticated config endpoints locally.
