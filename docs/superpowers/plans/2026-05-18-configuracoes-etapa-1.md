# Configuracoes Etapa 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-only Configuracoes page foundation and the Empresa configuration persistence/API, without changing NF-e emission behavior yet.

**Architecture:** Add focused backend modules for empresa configuration validation and persistence, expose admin-only Express routes, then add a React page with internal sections and an Empresa form. Keep Etapa 1 compatible with current `.env`-based NF-e by only preparing helper boundaries, not switching fiscal emission yet.

**Tech Stack:** Node.js 22, Express 4, better-sqlite3, React 18, Vite, Tailwind/global CSS tokens, Vitest.

---

## Files And Responsibilities

- Modify `backend/database.js`: create `empresa_config` table in schema/init migrations.
- Create `backend/domain/configuracoesRules.js`: normalize and validate Empresa payloads; compute status indicators.
- Create `backend/routes/configuracoes.js`: admin-only API for reading/saving Empresa config and summary status.
- Modify `backend/server.js`: mount `/api/configuracoes`.
- Create `backend/__tests__/configuracoesRules.test.js`: fast unit tests for validation and normalization.
- Modify `frontend/src/App.jsx`: lazy-load and route `/configuracoes` for admin only.
- Modify `frontend/src/components/Sidebar.jsx`: add Configuracoes menu item for admin.
- Create `frontend/src/pages/Configuracoes.jsx`: visual shell with sections and Empresa form.
- Modify `frontend/src/styles/global.css`: add scoped classes for the Configuracoes layout if inline styles become too noisy.

Etapa 1 intentionally does not touch `backend/routes/nfe.js`, `backend/domain/nfeRules.js`, or certificate handling. Those belong to Etapa 2.

---

### Task 1: Add Empresa Config Schema

**Files:**
- Modify: `backend/database.js`

- [ ] **Step 1: Add the table to `SCHEMA`**

Insert this block after the `sequencias` table and before the first index:

```js
CREATE TABLE IF NOT EXISTS empresa_config (
  id                    INTEGER PRIMARY KEY CHECK (id = 1),
  razaosocial           TEXT,
  nomefantasia          TEXT,
  cnpj                  TEXT,
  inscricaoestadual     TEXT,
  crt                   TEXT DEFAULT '1',
  telefone              TEXT,
  email                 TEXT,
  logradouro            TEXT,
  numero                TEXT,
  bairro                TEXT,
  municipio             TEXT,
  codigomunicipio       TEXT,
  uf                    TEXT,
  cep                   TEXT,
  updatedat             TEXT DEFAULT (datetime('now','localtime'))
);
INSERT OR IGNORE INTO empresa_config (id) VALUES (1);
```

- [ ] **Step 2: Add the same creation to `initDB()` after existing NF-e sequence setup**

Add this immediately after the `nfe_sequencias` `db.exec` block:

```js
  db.exec(`
    CREATE TABLE IF NOT EXISTS empresa_config (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      razaosocial           TEXT,
      nomefantasia          TEXT,
      cnpj                  TEXT,
      inscricaoestadual     TEXT,
      crt                   TEXT DEFAULT '1',
      telefone              TEXT,
      email                 TEXT,
      logradouro            TEXT,
      numero                TEXT,
      bairro                TEXT,
      municipio             TEXT,
      codigomunicipio       TEXT,
      uf                    TEXT,
      cep                   TEXT,
      updatedat             TEXT DEFAULT (datetime('now','localtime'))
    );
    INSERT OR IGNORE INTO empresa_config (id) VALUES (1);
  `);
```

- [ ] **Step 3: Run backend tests**

Run:

```powershell
npm.cmd test
```

from `C:\Users\esina\OneDrive\Documentos\Sistema\backend`.

Expected: current suite still passes. If unrelated existing tests fail, record the failure before continuing.

- [ ] **Step 4: Commit**

```powershell
git add backend/database.js
git commit -m "feat: add empresa config schema"
```

---

### Task 2: Add Empresa Validation Rules

**Files:**
- Create: `backend/domain/configuracoesRules.js`
- Create: `backend/__tests__/configuracoesRules.test.js`

- [ ] **Step 1: Create failing tests**

Create `backend/__tests__/configuracoesRules.test.js`:

```js
import { describe, it, expect } from 'vitest';

const rules = await import('../domain/configuracoesRules.js');
const { normalizarEmpresaConfig, validarEmpresaConfig, statusEmpresaConfig } = rules;

describe('configuracoesRules', () => {
  it('normaliza documentos e textos da empresa', () => {
    const out = normalizarEmpresaConfig({
      razaosocial: '  Arte e Molduras Ltda  ',
      nomefantasia: '  Arte & Molduras ',
      cnpj: '07.500.718/0001-96',
      inscricaoestadual: '  123.456.789.0000 ',
      crt: '1',
      telefone: '(31) 99999-0000',
      email: ' LOJA@EXEMPLO.COM ',
      logradouro: ' Rua A ',
      numero: ' 123 ',
      bairro: ' Centro ',
      municipio: ' Ipatinga ',
      codigomunicipio: '3131307',
      uf: 'mg',
      cep: '35160-000',
    });

    expect(out.razaosocial).toBe('Arte e Molduras Ltda');
    expect(out.nomefantasia).toBe('Arte & Molduras');
    expect(out.cnpj).toBe('07500718000196');
    expect(out.inscricaoestadual).toBe('1234567890000');
    expect(out.telefone).toBe('31999990000');
    expect(out.email).toBe('loja@exemplo.com');
    expect(out.uf).toBe('MG');
    expect(out.cep).toBe('35160000');
  });

  it('exige campos fiscais essenciais quando validarEmpresaConfig roda', () => {
    const result = validarEmpresaConfig(normalizarEmpresaConfig({
      razaosocial: '',
      cnpj: '123',
      crt: '9',
      municipio: '',
      uf: 'Minas',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.razaosocial).toBe('Razao social e obrigatoria');
    expect(result.errors.cnpj).toBe('CNPJ deve ter 14 digitos');
    expect(result.errors.crt).toBe('CRT deve ser 1, 2 ou 3');
    expect(result.errors.municipio).toBe('Municipio e obrigatorio');
    expect(result.errors.uf).toBe('UF deve ter 2 letras');
  });

  it('retorna status OK somente quando campos essenciais existem', () => {
    const status = statusEmpresaConfig({
      razaosocial: 'Arte e Molduras Ltda',
      cnpj: '07500718000196',
      inscricaoestadual: '1234567890000',
      crt: '1',
      logradouro: 'Rua A',
      numero: '123',
      bairro: 'Centro',
      municipio: 'Ipatinga',
      codigomunicipio: '3131307',
      uf: 'MG',
      cep: '35160000',
    });

    expect(status.status).toBe('OK');
    expect(status.missing).toEqual([]);
  });

  it('retorna Pendente com campos faltantes', () => {
    const status = statusEmpresaConfig({ razaosocial: 'Arte' });

    expect(status.status).toBe('Pendente');
    expect(status.missing).toContain('cnpj');
    expect(status.missing).toContain('cep');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm.cmd test -- configuracoesRules.test.js
```

from `C:\Users\esina\OneDrive\Documentos\Sistema\backend`.

Expected: fail because `backend/domain/configuracoesRules.js` does not exist.

- [ ] **Step 3: Create validation implementation**

Create `backend/domain/configuracoesRules.js`:

```js
const DIGITS = /\D/g;

const FIELD_KEYS = [
  'razaosocial',
  'nomefantasia',
  'cnpj',
  'inscricaoestadual',
  'crt',
  'telefone',
  'email',
  'logradouro',
  'numero',
  'bairro',
  'municipio',
  'codigomunicipio',
  'uf',
  'cep',
];

const REQUIRED_EMPRESA_FIELDS = [
  'razaosocial',
  'cnpj',
  'crt',
  'logradouro',
  'numero',
  'bairro',
  'municipio',
  'codigomunicipio',
  'uf',
  'cep',
];

function cleanText(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function onlyDigits(value, max = 32) {
  return cleanText(value, max).replace(DIGITS, '').slice(0, max);
}

function normalizarEmpresaConfig(input = {}) {
  return {
    razaosocial: cleanText(input.razaosocial, 200),
    nomefantasia: cleanText(input.nomefantasia, 200),
    cnpj: onlyDigits(input.cnpj, 14),
    inscricaoestadual: onlyDigits(input.inscricaoestadual, 20),
    crt: cleanText(input.crt || '1', 1),
    telefone: onlyDigits(input.telefone, 20),
    email: cleanText(input.email, 180).toLowerCase(),
    logradouro: cleanText(input.logradouro, 200),
    numero: cleanText(input.numero, 20),
    bairro: cleanText(input.bairro, 120),
    municipio: cleanText(input.municipio, 120),
    codigomunicipio: onlyDigits(input.codigomunicipio, 7),
    uf: cleanText(input.uf, 2).toUpperCase(),
    cep: onlyDigits(input.cep, 8),
  };
}

function validarEmpresaConfig(config = {}) {
  const errors = {};

  if (!config.razaosocial) errors.razaosocial = 'Razao social e obrigatoria';
  if (!config.cnpj) errors.cnpj = 'CNPJ e obrigatorio';
  else if (config.cnpj.length !== 14) errors.cnpj = 'CNPJ deve ter 14 digitos';
  if (!['1', '2', '3'].includes(config.crt)) errors.crt = 'CRT deve ser 1, 2 ou 3';
  if (!config.logradouro) errors.logradouro = 'Logradouro e obrigatorio';
  if (!config.numero) errors.numero = 'Numero e obrigatorio';
  if (!config.bairro) errors.bairro = 'Bairro e obrigatorio';
  if (!config.municipio) errors.municipio = 'Municipio e obrigatorio';
  if (!config.codigomunicipio) errors.codigomunicipio = 'Codigo IBGE e obrigatorio';
  else if (config.codigomunicipio.length !== 7) errors.codigomunicipio = 'Codigo IBGE deve ter 7 digitos';
  if (!config.uf || config.uf.length !== 2) errors.uf = 'UF deve ter 2 letras';
  if (!config.cep) errors.cep = 'CEP e obrigatorio';
  else if (config.cep.length !== 8) errors.cep = 'CEP deve ter 8 digitos';
  if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) {
    errors.email = 'E-mail invalido';
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function statusEmpresaConfig(config = {}) {
  const missing = REQUIRED_EMPRESA_FIELDS.filter((key) => !cleanText(config[key]));
  return {
    status: missing.length === 0 ? 'OK' : 'Pendente',
    missing,
  };
}

function pickEmpresaConfig(row = {}) {
  const out = {};
  for (const key of FIELD_KEYS) out[key] = row[key] ?? '';
  out.updatedat = row.updatedat ?? null;
  return out;
}

module.exports = {
  FIELD_KEYS,
  REQUIRED_EMPRESA_FIELDS,
  normalizarEmpresaConfig,
  validarEmpresaConfig,
  statusEmpresaConfig,
  pickEmpresaConfig,
};
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
npm.cmd test -- configuracoesRules.test.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/domain/configuracoesRules.js backend/__tests__/configuracoesRules.test.js
git commit -m "feat: add empresa config validation"
```

---

### Task 3: Add Admin-Only Configuracoes API

**Files:**
- Create: `backend/routes/configuracoes.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Create route module**

Create `backend/routes/configuracoes.js`:

```js
const router = require('express').Router();
const { getOne, run } = require('../database');
const { auth } = require('../middlewares/auth');
const {
  normalizarEmpresaConfig,
  validarEmpresaConfig,
  statusEmpresaConfig,
  pickEmpresaConfig,
} = require('../domain/configuracoesRules');

const SEL_EMPRESA = `
  SELECT razaosocial, nomefantasia, cnpj, inscricaoestadual, crt,
         telefone, email, logradouro, numero, bairro, municipio,
         codigomunicipio, uf, cep, updatedat
  FROM empresa_config
  WHERE id = 1
`;

function empresaAtual() {
  const row = getOne(SEL_EMPRESA) || {};
  return pickEmpresaConfig(row);
}

router.get('/', auth(['admin']), (_req, res, next) => {
  try {
    const empresa = empresaAtual();
    res.json({
      empresa,
      status: {
        empresa: statusEmpresaConfig(empresa),
        fiscal: { status: 'Pendente', missing: ['certificado', 'serie', 'proximoNumero'] },
        whatsapp: { status: 'Pendente', missing: ['configuracao'] },
        backups: { status: 'Atencao', missing: ['statusOffsite'] },
        seguranca: { status: 'Atencao', missing: ['lockoutPorUsuario'] },
        sistema: { status: 'OK', missing: [] },
      },
    });
  } catch (e) { next(e); }
});

router.get('/empresa', auth(['admin']), (_req, res, next) => {
  try {
    const empresa = empresaAtual();
    res.json({ empresa, status: statusEmpresaConfig(empresa) });
  } catch (e) { next(e); }
});

router.put('/empresa', auth(['admin']), (req, res, next) => {
  try {
    const empresa = normalizarEmpresaConfig(req.body || {});
    const validation = validarEmpresaConfig(empresa);
    if (!validation.ok) {
      return res.status(400).json({ error: 'Verifique os campos da empresa', errors: validation.errors });
    }

    run(`
      UPDATE empresa_config
      SET razaosocial=?, nomefantasia=?, cnpj=?, inscricaoestadual=?, crt=?,
          telefone=?, email=?, logradouro=?, numero=?, bairro=?, municipio=?,
          codigomunicipio=?, uf=?, cep=?, updatedat=datetime('now','localtime')
      WHERE id = 1
    `, [
      empresa.razaosocial,
      empresa.nomefantasia,
      empresa.cnpj,
      empresa.inscricaoestadual,
      empresa.crt,
      empresa.telefone,
      empresa.email,
      empresa.logradouro,
      empresa.numero,
      empresa.bairro,
      empresa.municipio,
      empresa.codigomunicipio,
      empresa.uf,
      empresa.cep,
    ]);

    const saved = empresaAtual();
    res.json({ empresa: saved, status: statusEmpresaConfig(saved) });
  } catch (e) { next(e); }
});

module.exports = router;
```

- [ ] **Step 2: Mount route in `backend/server.js`**

Add this with the other route mounts, preferably after `/api/backup` and before products:

```js
app.use("/api/configuracoes", require("./routes/configuracoes"));
```

- [ ] **Step 3: Run backend tests**

Run:

```powershell
npm.cmd test
```

Expected: pass.

- [ ] **Step 4: Manual API smoke test with dev server**

If the backend is not running, start it:

```powershell
npm.cmd run dev
```

Then login and call the route using the project PowerShell pattern:

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"admin123"}'
$token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""
Invoke-RestMethod -Uri "http://localhost:3001/api/configuracoes" -Method GET -Headers @{ Authorization = "Bearer $token" }
```

Expected: JSON with `empresa` and `status`. If the local seed uses a different password, use the known local admin password.

- [ ] **Step 5: Commit**

```powershell
git add backend/routes/configuracoes.js backend/server.js
git commit -m "feat: add configuracoes api"
```

---

### Task 4: Add Frontend Route And Sidebar Entry

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Create: `frontend/src/pages/Configuracoes.jsx`

- [ ] **Step 1: Create a temporary page skeleton**

Create `frontend/src/pages/Configuracoes.jsx`:

```jsx
import React from 'react'

export default function Configuracoes() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuracoes</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
            Central administrativa do sistema.
          </p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add lazy import and admin route in `frontend/src/App.jsx`**

Add:

```jsx
const Configuracoes = React.lazy(() => import('./pages/Configuracoes'))
```

near the other lazy imports.

Add this route after `/usuarios`:

```jsx
<Route path="/configuracoes" element={<PrivateRoute roles={['admin']}><Configuracoes /></PrivateRoute>}/>
```

- [ ] **Step 3: Add icon and menu item in `frontend/src/components/Sidebar.jsx`**

Add this to `ICONS`:

```jsx
  config:    { d: 'M12 15.5A3.5 3.5 0 1012 8a3.5 3.5 0 000 7.5z', d2: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.21.65.21 1H21a2 2 0 010 4h-1.39c0 .35-.07.69-.21 1z' },
```

Add this under the admin-only user menu item:

```jsx
              {isAdmin && navItem('/configuracoes', 'Configuracoes', 'config')}
```

- [ ] **Step 4: Build frontend**

Run:

```powershell
npm.cmd run build
```

from `C:\Users\esina\OneDrive\Documentos\Sistema\frontend`.

Expected: build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/App.jsx frontend/src/components/Sidebar.jsx frontend/src/pages/Configuracoes.jsx
git commit -m "feat: add configuracoes route"
```

---

### Task 5: Build Configuracoes Page UI And Empresa Form

**Files:**
- Modify: `frontend/src/pages/Configuracoes.jsx`
- Optional Modify: `frontend/src/styles/global.css`

- [ ] **Step 1: Replace skeleton with full page implementation**

Use this complete `frontend/src/pages/Configuracoes.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const SECOES = [
  { id: 'empresa', label: 'Empresa', desc: 'Dados oficiais usados em documentos e NF-e.' },
  { id: 'fiscal', label: 'Fiscal', desc: 'Certificado, serie, numeracao e XML.' },
  { id: 'whatsapp', label: 'WhatsApp', desc: 'Mensagens e integracao de notificacoes.' },
  { id: 'backups', label: 'Backups', desc: 'Saude dos backups locais e offsite.' },
  { id: 'seguranca', label: 'Seguranca', desc: 'Politicas de acesso e protecao.' },
  { id: 'sistema', label: 'Sistema', desc: 'Preferencias gerais da instalacao.' },
]

const EMPTY_EMPRESA = {
  razaosocial: '',
  nomefantasia: '',
  cnpj: '',
  inscricaoestadual: '',
  crt: '1',
  telefone: '',
  email: '',
  logradouro: '',
  numero: '',
  bairro: '',
  municipio: '',
  codigomunicipio: '',
  uf: '',
  cep: '',
}

function StatusPill({ status }) {
  const cls = status === 'OK' ? 'badge-success' : status === 'Atencao' ? 'badge-warning' : 'badge-secondary'
  return <span className={`badge ${cls}`}>{status || 'Pendente'}</span>
}

function digits(v) {
  return String(v || '').replace(/\D/g, '')
}

function Field({ label, value, onChange, error, required, ...props }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required ? ' *' : ''}</label>
      <input
        className="form-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
      {error && <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{error}</span>}
    </div>
  )
}

function PlannedSection({ title, desc }) {
  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 4 }}>{title}</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{desc}</p>
        </div>
        <span className="badge badge-secondary">Etapa futura</span>
      </div>
      <div style={{ marginTop: 'var(--space-5)', padding: 'var(--space-5)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Esta area ja esta prevista na central de configuracoes. A implementacao completa entra nas proximas etapas para manter os testes pequenos e seguros.
      </div>
    </div>
  )
}

export default function Configuracoes() {
  const [active, setActive] = useState('empresa')
  const [empresa, setEmpresa] = useState(EMPTY_EMPRESA)
  const [status, setStatus] = useState({})
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { document.title = 'Configuracoes - Arte & Molduras' }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get('/configuracoes')
      .then((r) => {
        if (!alive) return
        setEmpresa({ ...EMPTY_EMPRESA, ...(r.data?.empresa || {}) })
        setStatus(r.data?.status || {})
      })
      .catch(() => toast.error('Erro ao carregar configuracoes'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const currentSection = useMemo(() => SECOES.find(s => s.id === active), [active])

  const set = (key, value) => {
    setEmpresa((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: null }))
  }

  const salvarEmpresa = async () => {
    setSaving(true)
    setErrors({})
    try {
      const payload = {
        ...empresa,
        cnpj: digits(empresa.cnpj),
        inscricaoestadual: digits(empresa.inscricaoestadual),
        telefone: digits(empresa.telefone),
        codigomunicipio: digits(empresa.codigomunicipio),
        cep: digits(empresa.cep),
      }
      const r = await api.put('/configuracoes/empresa', payload)
      setEmpresa({ ...EMPTY_EMPRESA, ...(r.data?.empresa || {}) })
      setStatus((prev) => ({ ...prev, empresa: r.data?.status }))
      toast.success('Dados da empresa salvos')
    } catch (e) {
      setErrors(e.response?.data?.errors || {})
      toast.error(e.response?.data?.error || 'Erro ao salvar empresa')
    } finally {
      setSaving(false)
    }
  }

  const renderContent = () => {
    if (active !== 'empresa') {
      return <PlannedSection title={currentSection.label} desc={currentSection.desc} />
    }

    return (
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'flex-start', marginBottom: 'var(--space-5)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 4 }}>Informacoes da Empresa</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Dados usados no sistema, documentos e futuramente na emissao de NF-e pela tela.
            </p>
          </div>
          <StatusPill status={status.empresa?.status} />
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius-lg)' }} />
        ) : (
          <>
            <div className="form-grid-2">
              <Field label="Razao social" required value={empresa.razaosocial} error={errors.razaosocial} onChange={(v) => set('razaosocial', v)} />
              <Field label="Nome fantasia" value={empresa.nomefantasia} error={errors.nomefantasia} onChange={(v) => set('nomefantasia', v)} />
              <Field label="CNPJ" required value={empresa.cnpj} error={errors.cnpj} onChange={(v) => set('cnpj', v)} placeholder="07500718000196" />
              <Field label="Inscricao estadual" value={empresa.inscricaoestadual} error={errors.inscricaoestadual} onChange={(v) => set('inscricaoestadual', v)} />
              <div className="form-group">
                <label className="form-label">CRT/regime tributario *</label>
                <select className="form-input" value={empresa.crt || '1'} onChange={(e) => set('crt', e.target.value)}>
                  <option value="1">1 - Simples Nacional</option>
                  <option value="2">2 - Simples Nacional excesso sublimite</option>
                  <option value="3">3 - Regime Normal</option>
                </select>
                {errors.crt && <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-xs)', marginTop: 4 }}>{errors.crt}</span>}
              </div>
              <Field label="Telefone" value={empresa.telefone} error={errors.telefone} onChange={(v) => set('telefone', v)} />
              <Field label="E-mail" value={empresa.email} error={errors.email} onChange={(v) => set('email', v)} />
            </div>

            <div style={{ height: 1, background: 'var(--color-divider)', margin: 'var(--space-5) 0' }} />

            <div className="form-grid-2">
              <Field label="Logradouro" required value={empresa.logradouro} error={errors.logradouro} onChange={(v) => set('logradouro', v)} />
              <Field label="Numero" required value={empresa.numero} error={errors.numero} onChange={(v) => set('numero', v)} />
              <Field label="Bairro" required value={empresa.bairro} error={errors.bairro} onChange={(v) => set('bairro', v)} />
              <Field label="Municipio" required value={empresa.municipio} error={errors.municipio} onChange={(v) => set('municipio', v)} />
              <Field label="Codigo IBGE" required value={empresa.codigomunicipio} error={errors.codigomunicipio} onChange={(v) => set('codigomunicipio', v)} placeholder="3131307" />
              <Field label="UF" required value={empresa.uf} error={errors.uf} onChange={(v) => set('uf', v.toUpperCase().slice(0, 2))} placeholder="MG" maxLength={2} />
              <Field label="CEP" required value={empresa.cep} error={errors.cep} onChange={(v) => set('cep', v)} placeholder="35160000" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <button className="btn btn-ghost" type="button" onClick={() => window.location.reload()} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" type="button" onClick={salvarEmpresa} disabled={saving}>
                {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} />Salvando...</> : 'Salvar alteracoes'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuracoes</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
            Central administrativa para preparar o sistema para operacao e emissao fiscal.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 'var(--space-5)', alignItems: 'start' }} className="settings-layout">
        <div className="card card-pad" style={{ position: 'sticky', top: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {SECOES.map((secao) => (
              <button
                key={secao.id}
                type="button"
                onClick={() => setActive(secao.id)}
                style={{
                  textAlign: 'left',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: active === secao.id ? 'var(--color-primary-hl)' : 'transparent',
                  color: active === secao.id ? 'var(--color-primary)' : 'var(--color-text)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 'var(--text-sm)' }}>{secao.label}</span>
                <StatusPill status={status[secao.id]?.status} />
                <span style={{ gridColumn: '1 / -1', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.35 }}>{secao.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {renderContent()}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add responsive CSS if the inline grid overflows on mobile**

Append to `frontend/src/styles/global.css`:

```css
@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr !important;
  }

  .settings-layout > .card:first-child {
    position: static !important;
  }
}
```

- [ ] **Step 3: Build frontend**

Run:

```powershell
npm.cmd run build
```

Expected: build succeeds.

- [ ] **Step 4: Run backend tests**

Run:

```powershell
npm.cmd test
```

from `C:\Users\esina\OneDrive\Documentos\Sistema\backend`.

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/pages/Configuracoes.jsx frontend/src/styles/global.css
git commit -m "feat: build configuracoes empresa screen"
```

---

### Task 6: Manual Verification And Polish

**Files:**
- Modify only files from previous tasks if verification reveals issues.

- [ ] **Step 1: Start backend**

Run from `C:\Users\esina\OneDrive\Documentos\Sistema\backend`:

```powershell
npm.cmd run dev
```

Expected: backend listens on `http://localhost:3001`.

- [ ] **Step 2: Start frontend**

Run from `C:\Users\esina\OneDrive\Documentos\Sistema\frontend`:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 3: Verify admin flow in browser**

Open the frontend URL and login as admin.

Expected:

- Sidebar shows `Configuracoes`.
- `/configuracoes` loads.
- Empresa section is active.
- Other sections show planned cards for the next implementation stages.
- Saving incomplete required fields shows field errors.
- Saving complete Empresa data shows success toast and persists after reload.

Use this realistic test payload in the form:

```txt
Razao social: ARTE E MOLDURAS LTDA
Nome fantasia: Arte & Molduras
CNPJ: 07500718000196
Inscricao estadual: 1234567890000
CRT: 1 - Simples Nacional
Telefone: 31999990000
E-mail: contato@arteemolduras.com.br
Logradouro: Rua Teste
Numero: 123
Bairro: Centro
Municipio: Ipatinga
Codigo IBGE: 3131307
UF: MG
CEP: 35160000
```

- [ ] **Step 4: Verify non-admin access**

Login as `caixa` or `oficina`, or call the API with a non-admin token.

Expected:

- Sidebar does not show `Configuracoes`.
- Direct navigation to `/configuracoes` redirects away.
- `GET /api/configuracoes` returns 403.

- [ ] **Step 5: Run final commands**

Run:

```powershell
git status --short
npm.cmd test
npm.cmd run build
```

Run `npm.cmd test` in `backend`, and `npm.cmd run build` in `frontend`.

Expected:

- Only intentional files are modified.
- Backend tests pass.
- Frontend build passes.

- [ ] **Step 6: Final commit if polish was needed**

If Step 3 or Step 4 required fixes:

```powershell
git add backend frontend
git commit -m "fix: polish configuracoes etapa 1"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: This plan covers Etapa 1 from the design spec: admin route, menu entry, Empresa persistence, API, indicators, and visual shell for later sections. Fiscal certificate, `autXML`, WhatsApp, Backup, Security and System behavior are intentionally deferred to Etapas 2 and 3.
- Placeholder scan: The plan includes concrete file paths, code snippets and commands. No implementation step relies on an undeclared function.
- Type consistency: Backend uses lower-case database column names matching the current schema style. Frontend payload keys match backend validation keys exactly.
