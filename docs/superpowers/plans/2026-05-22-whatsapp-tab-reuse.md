# WhatsApp App Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch WhatsApp notices from Oficina through the installed app protocol instead of creating a new Web tab for each message.

**Architecture:** Keep WhatsApp URL construction in `frontend/src/utils/whatsappOficina.js`. The helper retains the existing WhatsApp Web URL builder for future fallback work, adds an app URL builder for `whatsapp://send`, and launches that protocol with `window.location.assign` from the Oficina click flow because WhatsApp Web isolates opened tabs with `Cross-Origin-Opener-Policy: same-origin`.

**Tech Stack:** React 18 helper code, Vitest 4.1, Vite 8.

---

## File Structure

- `backend/__tests__/whatsappOficinaUrl.test.js`: regression tests for Web URL generation, app URL generation, app launch, and launcher failure.
- `frontend/src/utils/whatsappOficina.js`: focused WhatsApp opener used by the Oficina page.
- `frontend/src/pages/Oficina.jsx`: user-facing failure message when the app protocol launcher cannot run.

### Task 1: Reproduce The Web Tab Path

**Files:**
- Modify: `backend/__tests__/whatsappOficinaUrl.test.js`

- [ ] **Step 1: Write the failing test**

Add tests that require `buildWhatsappAppUrl()` to generate `whatsapp://send?phone=<digits>&text=<encoded-text>` and require `openWhatsappConversation()` to call a supplied launcher with that app URL instead of calling a Web-tab opener.

- [ ] **Step 2: Run the focused test**

Run:

```powershell
cd C:\Users\esina\OneDrive\Documentos\Sistema\backend
npm.cmd test -- whatsappOficinaUrl.test.js
```

Expected: FAIL because the helper has no app URL builder and still sends the click through `web.whatsapp.com`.

### Task 2: Launch The WhatsApp App

**Files:**
- Modify: `frontend/src/utils/whatsappOficina.js`
- Modify: `frontend/src/pages/Oficina.jsx`
- Test: `backend/__tests__/whatsappOficinaUrl.test.js`

- [ ] **Step 1: Implement the minimal helper change**

Add `buildWhatsappAppUrl()`. Make `openWhatsappConversation()` build that URL and use a launcher that navigates to it with `window.location.assign`, returning `false` if the launcher cannot run.

Update the Oficina failure toast to say the app could not be opened before copying the message fallback.

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
git commit -m "fix: launch oficina whatsapp in app"
git push
```
