# Backup Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist local backup health in `backup-status.json` and expose it through an admin-only API endpoint.

**Architecture:** Extend `backend/utils/backupStatus.js` with small read/write helpers for a JSON snapshot stored beside the local `.db` backups. Update `database.backup()` to write the snapshot after successful or failed backup attempts, and update `routes/backup.js` so admins can read the current status and manual backup calls return the same shape.

**Tech Stack:** Express 4, Node.js fs/path, SQLite via `better-sqlite3`, Vitest 4.1.

---

### Task 1: Persist Backup Status Snapshot

**Files:**
- Modify: `backend/utils/backupStatus.js`
- Modify: `backend/__tests__/backupStatus.test.js`

- [x] **Step 1: Write failing tests**

Add tests for:
- `writeBackupStatus(backupsDir, status)` creates `backup-status.json`.
- `readBackupStatus(backupsDir)` returns stored JSON.
- `readBackupStatus(backupsDir)` falls back to a live `buildBackupStatus()` snapshot when no JSON exists.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/backupStatus.test.js`
Expected: fail because the read/write helpers are not exported yet.

- [x] **Step 3: Implement helpers**

Add:
- `BACKUP_STATUS_FILE = "backup-status.json"`
- `backupStatusPath(backupsDir)`
- `writeBackupStatus(backupsDir, status)`
- `readBackupStatus(backupsDir, options)`

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/backupStatus.test.js`
Expected: pass.

### Task 2: Connect Backup Flow And Route

**Files:**
- Modify: `backend/database.js`
- Modify: `backend/routes/backup.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [x] **Step 1: Add failing route/source contracts**

Assert:
- `routes/backup.js` exposes `GET /status`.
- `routes/backup.js` uses `readBackupStatus`.
- `database.js` uses `writeBackupStatus`.
- manual `POST /api/backup` returns the backup result instead of only `{ ok: true }`.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/routeContracts.test.js`
Expected: fail until route/database wiring exists.

- [x] **Step 3: Implement route and backup wiring**

Update `backup()` to return `{ ok, arquivo, status }` on success and write a failure snapshot before rethrowing on error. Add `GET /api/backup/status` for admins.

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/backupStatus.test.js __tests__/routeContracts.test.js`
Expected: pass.

### Task 3: Full Verification And Docs

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-05-19-backup-status.md`

- [x] **Step 1: Update documentation**

Mark backup observability complete and move next roadmap focus to Propostas/Funil.

- [x] **Step 2: Run backend tests**

Run: `npm.cmd test`
Expected: all tests pass.

- [x] **Step 3: Run frontend build**

Run: `npm.cmd run build`
Expected: production build succeeds.

- [ ] **Step 4: Commit and push**

Commit: `feat: add backup status endpoint`
