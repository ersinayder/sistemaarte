# WhatsApp Same-Tab Web Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch WhatsApp notices from Oficina in the current browser tab instead of creating a new WhatsApp Web tab for each message.

**Architecture:** Keep WhatsApp URL construction in `frontend/src/utils/whatsappOficina.js`. The helper builds `web.whatsapp.com/send` URLs and navigates the current tab with `window.location.assign` from the Oficina click flow because WhatsApp Web isolates opened tabs with `Cross-Origin-Opener-Policy: same-origin`, while the external `whatsapp://` protocol is not reliable for an operator who uses WhatsApp Web in Chrome.

**Tech Stack:** React 18 helper code, Vitest 4.1, Vite 8.

---

## File Structure

- `backend/__tests__/whatsappOficinaUrl.test.js`: regression tests for Web URL generation, current-tab launch, and navigation failure.
- `frontend/src/utils/whatsappOficina.js`: focused WhatsApp opener used by the Oficina page.
- `frontend/src/pages/Oficina.jsx`: user-facing failure message when WhatsApp Web navigation cannot run.

### Task 1: Reproduce The Web Tab Path

**Files:**
- Modify: `backend/__tests__/whatsappOficinaUrl.test.js`

- [ ] **Step 1: Write the failing test**

Add tests that require `openWhatsappConversation()` to call a supplied launcher with the existing `https://web.whatsapp.com/send` URL instead of calling an app-protocol or Web-tab opener.

- [ ] **Step 2: Run the focused test**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappOficinaUrl.test.js
```

Expected: FAIL while the helper still sends the click through `whatsapp://send`.

### Task 2: Navigate To WhatsApp Web

**Files:**
- Modify: `frontend/src/utils/whatsappOficina.js`
- Modify: `frontend/src/pages/Oficina.jsx`
- Test: `backend/__tests__/whatsappOficinaUrl.test.js`

- [ ] **Step 1: Implement the minimal helper change**

Make `openWhatsappConversation()` build the existing WhatsApp Web URL and use a launcher that navigates the current tab to it with `window.location.assign`, returning `false` if the launcher cannot run.

Update the Oficina failure toast to say WhatsApp Web could not be opened before copying the message fallback.

- [ ] **Step 2: Run the focused test**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappOficinaUrl.test.js
```

Expected: PASS.

### Task 3: Verify And Publish

**Files:**
- Verify only unless failures expose a bug in this scope.

- [ ] **Step 1: Run backend tests**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\frontend
npm.cmd run build
```

Expected: build exits 0.

- [ ] **Step 3: Commit and push**

Run:

```powershell
git add docs/superpowers/specs/2026-05-22-whatsapp-fila-oficina-design.md docs/superpowers/plans/2026-05-22-whatsapp-tab-reuse.md backend/__tests__/whatsappOficinaUrl.test.js frontend/src/utils/whatsappOficina.js frontend/src/pages/Oficina.jsx
git commit -m "fix: open oficina whatsapp in current tab"
git push
```
