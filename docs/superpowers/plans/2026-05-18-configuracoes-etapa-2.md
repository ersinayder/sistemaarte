# Configuracoes Etapa 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Fiscal settings tab, certificate/password storage, NF-e numbering, contador `autXML`, and make NF-e use database configuration first with `.env` fallback.

**Architecture:** Store fiscal settings in SQLite alongside the existing singleton company config, expose admin-only configuration routes, centralize NF-e config resolution in a focused helper, then update NF-e emission/event paths to consume that helper. Keep all existing NF-e safeguards: mutex, XML persistence, timeout guard, status rules, and fiscal event history.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, multer, nfewizard-io, React 18, Vite, Vitest.

---

## Files And Responsibilities

- Modify `backend/database.js`: add `fiscal_config` and `nfe_autxml` tables idempotently.
- Create `backend/domain/fiscalConfigRules.js`: normalize/validate fiscal settings and `autXML` records.
- Create `backend/utils/nfeConfig.js`: resolve fiscal config, certificate, emitente, ambiente, and `autXML` with database-first fallback to `.env`.
- Modify `backend/utils/nfe.js`: initialize NFEWizard from `nfeConfig`.
- Modify `backend/domain/nfeRules.js`: accept explicit `ambiente` and optional `autXML`.
- Modify `backend/routes/configuracoes.js`: add Fiscal endpoints, certificate upload/password update, and `autXML` CRUD.
- Modify `backend/routes/nfe.js`: use `nfeConfig` for emitente, certificado checks, ambiente, serie, CNPJ for events, and `autXML`.
- Modify `frontend/src/pages/Configuracoes.jsx`: make the Fiscal tab functional.
- Add/modify tests in `backend/__tests__/fiscalConfigRules.test.js`, `backend/__tests__/nfe.test.js`, and focused helper tests if practical.

## Non-Negotiables From AGENTS.md

- Do not change OS statuses or use `Em Producao` without accent.
- Do not reimplement financeiro balance logic.
- Do not change NF-e mutex behavior.
- Do not change XML legal storage behavior.
- `config.nfe.ambiente` must be number `1` or `2`.
- `config.lib.useOpenSSL` must remain `false`.
- Certificate path must use `path.resolve()`.
- `montarNFe()` must still return `{ infNFe: {...} }`.
- Existing `.env` behavior must continue working when database fields are empty.

---

### Task 1: Fiscal Database Schema

**Files:**
- Modify: `backend/database.js`

Steps:

- [ ] Add `fiscal_config` singleton table with fields:
  - `id INTEGER PRIMARY KEY CHECK (id = 1)`
  - `ambiente INTEGER DEFAULT 2`
  - `serie TEXT DEFAULT '1'`
  - `certificado_path TEXT`
  - `certificado_nome TEXT`
  - `certificado_senha TEXT`
  - `certificado_updatedat TEXT`
  - `updatedat TEXT DEFAULT (datetime('now','localtime'))`
- [ ] Add `nfe_autxml` table with fields:
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `nome TEXT NOT NULL`
  - `documento TEXT NOT NULL`
  - `tipo TEXT DEFAULT 'contador'`
  - `ativo INTEGER DEFAULT 1`
  - `createdat TEXT DEFAULT (datetime('now','localtime'))`
  - `updatedat TEXT DEFAULT (datetime('now','localtime'))`
- [ ] Add indexes:
  - `idx_nfe_autxml_documento`
  - `idx_nfe_autxml_ativo`
- [ ] Insert singleton row for `fiscal_config`.
- [ ] Repeat table creation defensively in `initDB()` after `empresa_config` setup.
- [ ] Run backend tests.
- [ ] Commit: `feat: add fiscal config schema`

### Task 2: Fiscal Rules And Tests

**Files:**
- Create: `backend/domain/fiscalConfigRules.js`
- Create: `backend/__tests__/fiscalConfigRules.test.js`

Exports:

- `normalizarFiscalConfig(input)`
- `validarFiscalConfig(config, contexto)`
- `statusFiscalConfig(config, contexto)`
- `normalizarAutXml(input)`
- `validarAutXml(item, contexto)`
- `formatarAutXmlParaNFe(items, destinatarioDocumento)`

Rules:

- `ambiente` accepts only number `1` or `2`.
- `serie` is a non-empty digit string from 1 to 3 digits.
- `proximoNumero` is an integer from 1 to 999999999 when present.
- `autXML` document must be CPF 11 digits or CNPJ 14 digits.
- At most 10 active `autXML` records.
- `autXML` cannot equal emitente CNPJ.
- At NF-e assembly time, filter out `autXML` equal to destinatario CPF/CNPJ.
- Convert `autXML` to NF-e shape: `{ CPF: doc }` for 11 digits and `{ CNPJ: doc }` for 14 digits.

Tests:

- Fiscal normalization and validation.
- Invalid ambiente/serie/proximoNumero.
- `autXML` accepts CPF/CNPJ and rejects invalid document.
- Rejects document equal to emitente.
- Limits active list to 10.
- Filters destinatario and formats CPF/CNPJ shape.

Commit: `feat: add fiscal config rules`

### Task 3: NF-e Config Helper

**Files:**
- Create: `backend/utils/nfeConfig.js`
- Optional Test: `backend/__tests__/nfeConfig.test.js`

Responsibilities:

- `tpAmbAtual()` returns database `fiscal_config.ambiente` when `1` or `2`, otherwise `.env` fallback.
- `getFiscalConfig()` returns sanitized fiscal config, proximoNumero from `nfe_sequencias`, and certificate status without exposing password.
- `getCertificadoConfig()` returns `{ pathCertificado, senhaCertificado, origem }` database first, `.env` fallback.
- `getEmitenteConfig()` returns emitente from `empresa_config` first, `.env` fallback per field.
- `getAutXmlAtivos()` returns active rows.
- `getAutXmlParaNFe(destinatarioDocumento)` returns formatted filtered records.
- `getCnpjEmitente()` returns database company CNPJ first, `.env` fallback.
- `getSerieNFe()` returns `fiscal_config.serie || '1'`.

Commit: `feat: add nfe config resolver`

### Task 4: Fiscal Config API

**Files:**
- Modify: `backend/routes/configuracoes.js`

Endpoints:

- `GET /api/configuracoes/fiscal`
- `PUT /api/configuracoes/fiscal`
- `POST /api/configuracoes/fiscal/certificado`
- `PUT /api/configuracoes/fiscal/certificado/senha`
- `GET /api/configuracoes/fiscal/autxml`
- `POST /api/configuracoes/fiscal/autxml`
- `PUT /api/configuracoes/fiscal/autxml/:id`
- `DELETE /api/configuracoes/fiscal/autxml/:id`

Rules:

- All routes `auth(['admin'])`.
- Never return `certificado_senha`.
- Certificate upload accepts only `.pfx`, max 512 KB, stores under `backend/certs/`.
- Updating fiscal settings resets NFEWizard.
- Updating certificate/password resets NFEWizard.
- `PUT /fiscal` updates ambiente, serie, and optionally proximoNumero by setting `nfe_sequencias.ultimo_numero = proximoNumero - 1`.
- If lowering next number, require `confirmarReducao: true`.
- `autXML` writes use validation and active limit.

Commit: `feat: add fiscal config api`

### Task 5: Integrate NF-e With DB-First Config

**Files:**
- Modify: `backend/utils/nfe.js`
- Modify: `backend/domain/nfeRules.js`
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/nfe.test.js`

Changes:

- `utils/nfe.js` loads certificate path/password and ambiente from `utils/nfeConfig.js`.
- `domain/nfeRules.js` accepts `ambiente` and `autXML` in `montarNFe({ ... })`.
- `routes/nfe.js` uses:
  - `tpAmbAtual()` from helper.
  - `getEmitenteConfig()` instead of local `emitente()`.
  - `getCertificadoConfig()` for certificate checks.
  - `getSerieNFe()` for serie.
  - `getAutXmlParaNFe(os.cpf)` for emission payload.
  - `getCnpjEmitente()` for CC-e/cancelamento event CNPJ.
- Preserve all existing NF-e guards and status transitions.
- Add tests for `ambiente` override and `autXML` payload shape.

Commit: `feat: use fiscal config for nfe`

### Task 6: Fiscal Settings UI

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Modify: `frontend/src/styles/global.css` only if needed.

UI:

- Fiscal section becomes functional.
- Fields:
  - ambiente segmented/select: homologacao `2`, producao `1`.
  - serie.
  - proximoNumero.
  - certificate upload `.pfx`.
  - password update input.
  - certificate configured/status label, file name, updated date if available.
  - contador/autXML list with nome, documento, tipo, ativo.
- Actions:
  - Save fiscal settings.
  - Upload certificate.
  - Update password.
  - Add/update/deactivate/delete `autXML`.
- Strong confirmation when changing ambiente to producao or lowering proximoNumero.
- Do not display current certificate password.

Commit: `feat: build fiscal settings screen`

### Task 7: Verification

Run:

- Backend tests: `npm.cmd test`
- Frontend build: `npm.cmd run build`
- Manual API smoke:
  - login as admin
  - GET `/api/configuracoes/fiscal`
  - PUT `/api/configuracoes/fiscal`
  - CRUD one `autXML`
- Frontend smoke:
  - open `/configuracoes`
  - check Empresa still works
  - check Fiscal tab loads and saves non-certificate settings

Do not require real SEFAZ emission in this task. Emission should still be validated later in homologation.

Commit only if verification required fixes.
