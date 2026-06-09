# WhatsApp Configuracoes Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the WhatsApp settings tab so admins can see local WhatsApp status, scan QR in-app, choose only local/manual mode, and preview message templates.

**Architecture:** Keep backend contracts unchanged. The frontend consumes existing `/configuracoes/whatsapp` and `/configuracoes/whatsapp/web-status`, renders QR client-side with `qrcode`, and reorganizes existing form state.

**Tech Stack:** React 18, Vite 8, Tailwind/global CSS, lucide-react, qrcode.

---

### Task 1: QR Rendering Dependency

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] Install `qrcode` in the frontend with `npm.cmd install qrcode`.

### Task 2: WhatsApp Tab UI

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Modify: `frontend/src/styles/global.css`

- [ ] Add QR generation from `whatsappWebStatus.qr`.
- [ ] Replace provider select with two visual mode buttons: `web_local` and `manual`.
- [ ] Add status panel with connected/qr/disconnected states.
- [ ] Add QR image panel when `state=qr`.
- [ ] Add visual message template cards.

### Task 3: Verification

**Files:**
- Verify frontend build.
- Verify backend focused tests if backend remains untouched.

- [ ] Run `npm.cmd run build` in `frontend`.
- [ ] Manually inspect the settings page locally if a dev server is available.
