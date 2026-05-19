# Pagination Ordens Clientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real server-side pagination to Ordens and Clientes while preserving current filters and fast search flows.

**Architecture:** Introduce a small backend pagination helper that normalizes `page` and `limit` and builds response metadata. Update `GET /api/ordens` and `GET /api/clientes` to return `{ data, meta }` when paginated, with `COUNT(*)` using the same filters as the list query. Update React pages to consume the paginated response and keep legacy array fallback for safety.

**Tech Stack:** Express 4, SQLite via `better-sqlite3`, React 18, Vite 8, Vitest 4.1.

---

### Task 1: Backend Pagination Rules

**Files:**
- Create: `backend/domain/paginationRules.js`
- Test: `backend/__tests__/paginationRules.test.js`

- [x] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest';

const {
  normalizarPaginacao,
  montarMetaPaginacao,
} = await import('../domain/paginationRules.js');

describe('paginationRules', () => {
  it('normalizes page and limit with conservative defaults and caps', () => {
    expect(normalizarPaginacao({ page: '2', limit: '25' })).toEqual({
      page: 2,
      limit: 25,
      offset: 25,
    });
    expect(normalizarPaginacao({ page: '-1', limit: '999' })).toEqual({
      page: 1,
      limit: 100,
      offset: 0,
    });
    expect(normalizarPaginacao({})).toEqual({
      page: 1,
      limit: 25,
      offset: 0,
    });
  });

  it('builds stable pagination metadata', () => {
    expect(montarMetaPaginacao({ page: 2, limit: 25, total: 51 })).toEqual({
      page: 2,
      limit: 25,
      total: 51,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });
});
```

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/paginationRules.test.js`
Expected: fail because `../domain/paginationRules.js` does not exist.

- [x] **Step 3: Implement helper**

```js
function normalizarPaginacao(query = {}, defaults = {}) {
  const defaultLimit = Number(defaults.defaultLimit || 25);
  const maxLimit = Number(defaults.maxLimit || 100);
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limitBase = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  const limit = Math.min(Math.max(limitBase, 1), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

function montarMetaPaginacao({ page, limit, total }) {
  const safeTotal = Math.max(0, Number(total || 0));
  const totalPages = Math.max(1, Math.ceil(safeTotal / limit));
  return {
    page,
    limit,
    total: safeTotal,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = { normalizarPaginacao, montarMetaPaginacao };
```

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/paginationRules.test.js`
Expected: pass.

### Task 2: Paginate Backend Routes

**Files:**
- Modify: `backend/routes/ordens.js`
- Modify: `backend/routes/clientes.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [x] **Step 1: Add route contract tests**

Add tests that verify routes use `normalizarPaginacao`, `LIMIT ? OFFSET ?`, and `COUNT(*) AS total`.

- [x] **Step 2: Run RED**

Run: `npm.cmd test -- __tests__/routeContracts.test.js`
Expected: fail until routes are updated.

- [x] **Step 3: Update routes**

Use shared `where` arrays for list and count filters. Return:

```js
res.json({
  data: rows,
  meta: montarMetaPaginacao({ page, limit, total }),
});
```

- [x] **Step 4: Run GREEN**

Run: `npm.cmd test -- __tests__/paginationRules.test.js __tests__/routeContracts.test.js`
Expected: pass.

### Task 3: Update Frontend Pages

**Files:**
- Modify: `frontend/src/pages/Ordens.jsx`
- Modify: `frontend/src/pages/Clientes.jsx`

- [x] **Step 1: Update `Ordens.jsx`**

Fetch `/ordens` with `page`, `limit`, `status`, `tipo`, and `q`.

- [x] **Step 2: Update `Clientes.jsx`**

Fetch `/clientes` with `page`, `limit`, and `q`. Preserve table sorting locally for the current page.

- [x] **Step 3: Verify frontend build**

Run: `npm.cmd run build`
Expected: build succeeds.

### Task 4: Full Verification

**Files:**
- No new files.

- [x] **Step 1: Run backend tests**

Run: `npm.cmd test`
Expected: all tests pass.

- [x] **Step 2: Run frontend build**

Run: `npm.cmd run build`
Expected: production build succeeds.

- [x] **Step 3: Review git diff**

Run: `git diff --stat`
Expected: only pagination feature files, `AGENTS.md`, and this plan are changed.
