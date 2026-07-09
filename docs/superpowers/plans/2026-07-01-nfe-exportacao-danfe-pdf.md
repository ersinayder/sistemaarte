# NF-e Exportacao e DANFE PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current DANFE HTML response with automatic PDF downloads and add ZIP export for authorized XMLs or DANFE PDFs by fiscal emission period.

**Architecture:** Keep the existing NF-e route contract and DANFE HTML renderer as the visual source, then add a focused PDF renderer that turns the HTML into A4 PDF buffers. Put parameter validation and ZIP export orchestration outside `backend/routes/nfe.js` so the already-large route file only wires HTTP concerns, while the frontend adds a small export modal and reuses the existing blob download pattern.

**Tech Stack:** Node.js 22, Express 4, CommonJS, better-sqlite3, Vitest 4.1, `archiver`, `puppeteer`, React 18, Vite 8, Axios, Testing Library, lucide-react.

---

## File Structure

- Modify: `backend/package.json`
  - Add `puppeteer` as a runtime dependency because the Windows Server must generate DANFE PDFs without relying on the user's browser.
- Modify: `backend/package-lock.json`
  - Lock the installed PDF dependency.
- Create: `backend/utils/nfeXml.js`
  - Move reusable XML extraction and fiscal filename sanitization out of `backend/routes/nfe.js`.
- Test: `backend/__tests__/nfeXml.test.js`
  - Verify XML extraction from strings, JSON wrappers, nested objects, arrays, and invalid values.
- Create: `backend/utils/pdf/danfePdf.js`
  - Render DANFE HTML into A4 PDF buffers using Puppeteer with a small browser singleton.
- Test: `backend/__tests__/danfePdf.test.js`
  - Mock Puppeteer and verify page lifecycle, A4 options, print background, and buffer output.
- Create: `backend/domain/nfeExportRules.js`
  - Validate export query parameters, build safe filenames, and build `manifesto.txt`.
- Test: `backend/__tests__/nfeExportRules.test.js`
  - Cover valid periods, invalid dates, inverted periods, max-period guard, filenames, and manifest text.
- Create: `backend/services/nfeExportService.js`
  - Query exportable notes, generate XML or PDF entries, write ZIP buffers, and return safe metadata.
- Test: `backend/__tests__/nfeExportService.test.js`
  - Use fake DB rows and fake PDF renderer to verify XML ZIP, DANFE ZIP, skipped notes, and empty-period errors.
- Modify: `backend/routes/nfe.js`
  - Import shared XML helpers, replace DANFE response with PDF, add `/exportar`, and keep manual routes before dynamic routes.
- Modify: `backend/__tests__/routeContracts.test.js`
  - Assert the export route roles, route ordering, PDF dependency, and the new DANFE content type contract.
- Modify: `frontend/src/pages/NotasFiscais.jsx`
  - Replace `abrirDanfe()` with blob download, add export modal state, and add header button.
- Modify: `frontend/src/pages/NotasFiscais.test.jsx`
  - Cover the export button/modal and ensure DANFE uses download instead of `window.open`.

---

### Task 1: Add PDF Runtime Dependency

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

- [ ] **Step 1: Install Puppeteer in the backend**

Run:

```powershell
cd backend
npm.cmd install puppeteer
```

Expected: command exits with code `0`, `backend/package.json` includes `"puppeteer"`, and `backend/package-lock.json` is updated.

- [ ] **Step 2: Verify dependency resolution**

Run:

```powershell
cd backend
npm.cmd ls puppeteer
```

Expected: output contains `puppeteer@` and exits with code `0`.

- [ ] **Step 3: Commit dependency update**

```powershell
git add backend/package.json backend/package-lock.json
git commit -m "chore: add danfe pdf renderer dependency"
```

---

### Task 2: Extract Reusable NF-e XML Helpers

**Files:**
- Create: `backend/utils/nfeXml.js`
- Test: `backend/__tests__/nfeXml.test.js`
- Modify: `backend/routes/nfe.js`

- [ ] **Step 1: Write failing tests for XML extraction and filenames**

Create `backend/__tests__/nfeXml.test.js`:

```js
import { describe, expect, it } from 'vitest';
import nfeXml from '../utils/nfeXml.js';

const { extrairXmlFiscal, serializarXmlFiscal, filenameSeguro } = nfeXml;

describe('nfeXml helpers', () => {
  it('extracts raw XML strings', () => {
    expect(extrairXmlFiscal('  <nfeProc>ok</nfeProc>  ')).toBe('<nfeProc>ok</nfeProc>');
  });

  it('extracts XML from JSON strings and nested fiscal wrappers', () => {
    const source = JSON.stringify({
      resposta: {
        xmlProc: '<nfeProc><protNFe /></nfeProc>',
      },
    });

    expect(extrairXmlFiscal(source)).toBe('<nfeProc><protNFe /></nfeProc>');
  });

  it('extracts XML from arrays and common nfewizard fields', () => {
    const source = [
      { ignored: true },
      { procNFe: '<nfeProc><NFe /></nfeProc>' },
    ];

    expect(extrairXmlFiscal(source)).toBe('<nfeProc><NFe /></nfeProc>');
  });

  it('returns null for non-XML values', () => {
    expect(extrairXmlFiscal('plain text')).toBeNull();
    expect(extrairXmlFiscal({ semXml: 'valor' })).toBeNull();
    expect(extrairXmlFiscal(null)).toBeNull();
  });

  it('serializes unknown fiscal responses as formatted JSON', () => {
    expect(serializarXmlFiscal({ cStat: '100' })).toContain('"cStat": "100"');
  });

  it('sanitizes filenames without losing useful numeric identifiers', () => {
    expect(filenameSeguro('NF-e 29/1 chave: 3126')).toBe('NF-e_29_1_chave__3126');
    expect(filenameSeguro('')).toBe('nfe');
  });
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- nfeXml.test.js
```

Expected: fails because `backend/utils/nfeXml.js` does not exist.

- [ ] **Step 3: Create the shared XML utility**

Create `backend/utils/nfeXml.js`:

```js
'use strict';

function extrairXmlFiscal(valor, depth = 0) {
  if (!valor || depth > 5) return null;

  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto.startsWith('<')) return texto;
    if (texto.startsWith('{') || texto.startsWith('[')) {
      try {
        return extrairXmlFiscal(JSON.parse(texto), depth + 1);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(valor)) {
    for (const item of valor) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
    return null;
  }

  if (typeof valor === 'object') {
    for (const key of ['xml', 'xmlAssinado', 'xmlProc', 'nfeProc', 'procNFe']) {
      const xml = extrairXmlFiscal(valor[key], depth + 1);
      if (xml) return xml;
    }
    for (const item of Object.values(valor)) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
  }

  return null;
}

function serializarXmlFiscal(resultado) {
  return extrairXmlFiscal(resultado) || (typeof resultado === 'string'
    ? resultado
    : JSON.stringify(resultado, null, 2));
}

function filenameSeguro(value) {
  return String(value || 'nfe').replace(/[^a-zA-Z0-9._-]/g, '_');
}

module.exports = {
  extrairXmlFiscal,
  serializarXmlFiscal,
  filenameSeguro,
};
```

- [ ] **Step 4: Import helpers in the NF-e route and remove local duplicates**

In `backend/routes/nfe.js`, add this import near the existing utility imports:

```js
const {
  extrairXmlFiscal,
  serializarXmlFiscal,
  filenameSeguro,
} = require('../utils/nfeXml');
```

Then remove these local functions from `backend/routes/nfe.js`:

```js
function extrairXmlFiscal(valor, depth = 0) {
  if (!valor || depth > 5) return null;

  if (typeof valor === 'string') {
    const texto = valor.trim();
    if (texto.startsWith('<')) return texto;
    if (texto.startsWith('{') || texto.startsWith('[')) {
      try {
        return extrairXmlFiscal(JSON.parse(texto), depth + 1);
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  if (Array.isArray(valor)) {
    for (const item of valor) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
    return null;
  }

  if (typeof valor === 'object') {
    for (const key of ['xml', 'xmlAssinado', 'xmlProc', 'nfeProc', 'procNFe']) {
      const xml = extrairXmlFiscal(valor[key], depth + 1);
      if (xml) return xml;
    }
    for (const item of Object.values(valor)) {
      const xml = extrairXmlFiscal(item, depth + 1);
      if (xml) return xml;
    }
  }

  return null;
}

function serializarXmlFiscal(resultado) {
  return extrairXmlFiscal(resultado) || (typeof resultado === 'string'
    ? resultado
    : JSON.stringify(resultado, null, 2));
}

function filenameSeguro(value) {
  return String(value || 'nfe').replace(/[^a-zA-Z0-9._-]/g, '_');
}
```

- [ ] **Step 5: Run focused backend tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeXml.test.js danfe.test.js routeContracts.test.js
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit XML helper extraction**

```powershell
git add backend/utils/nfeXml.js backend/__tests__/nfeXml.test.js backend/routes/nfe.js
git commit -m "refactor: share nfe xml helpers"
```

---

### Task 3: Add DANFE PDF Renderer

**Files:**
- Create: `backend/utils/pdf/danfePdf.js`
- Test: `backend/__tests__/danfePdf.test.js`

- [ ] **Step 1: Write failing tests for the PDF renderer**

Create `backend/__tests__/danfePdf.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMock = vi.fn(async () => Buffer.from('%PDF-test'));
const setContentMock = vi.fn(async () => undefined);
const emulateMediaTypeMock = vi.fn(async () => undefined);
const closePageMock = vi.fn(async () => undefined);
const newPageMock = vi.fn(async () => ({
  setContent: setContentMock,
  emulateMediaType: emulateMediaTypeMock,
  pdf: pdfMock,
  close: closePageMock,
}));
const browserCloseMock = vi.fn(async () => undefined);
const launchMock = vi.fn(async () => ({
  newPage: newPageMock,
  close: browserCloseMock,
}));

vi.mock('puppeteer', () => ({
  default: { launch: launchMock },
  launch: launchMock,
}));

describe('danfePdf renderer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../utils/pdf/danfePdf.js');
    await mod.closeDanfePdfBrowser();
  });

  it('renders HTML as an A4 PDF buffer', async () => {
    const { renderDanfePdf } = await import('../utils/pdf/danfePdf.js');

    const buffer = await renderDanfePdf('<html><body>DANFE</body></html>');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('%PDF-test');
    expect(launchMock).toHaveBeenCalledWith(expect.objectContaining({
      headless: true,
      args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
    }));
    expect(setContentMock).toHaveBeenCalledWith(
      '<html><body>DANFE</body></html>',
      { waitUntil: ['load', 'networkidle0'] }
    );
    expect(emulateMediaTypeMock).toHaveBeenCalledWith('print');
    expect(pdfMock).toHaveBeenCalledWith(expect.objectContaining({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    }));
    expect(closePageMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the browser between render calls and can close it explicitly', async () => {
    const { renderDanfePdf, closeDanfePdfBrowser } = await import('../utils/pdf/danfePdf.js');

    await renderDanfePdf('<html><body>1</body></html>');
    await renderDanfePdf('<html><body>2</body></html>');
    await closeDanfePdfBrowser();

    expect(launchMock).toHaveBeenCalledTimes(1);
    expect(newPageMock).toHaveBeenCalledTimes(2);
    expect(browserCloseMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the renderer tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- danfePdf.test.js
```

Expected: fails because `backend/utils/pdf/danfePdf.js` does not exist.

- [ ] **Step 3: Create the PDF renderer**

Create `backend/utils/pdf/danfePdf.js`:

```js
'use strict';

const puppeteer = require('puppeteer');

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function renderDanfePdf(html) {
  if (!html || typeof html !== 'string') {
    const err = new Error('HTML do DANFE indisponivel para gerar PDF.');
    err.statusCode = 422;
    throw err;
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'] });
    await page.emulateMediaType('print');
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function closeDanfePdfBrowser() {
  const browser = browserPromise ? await browserPromise.catch(() => null) : null;
  browserPromise = null;
  if (browser) await browser.close().catch(() => {});
}

module.exports = {
  renderDanfePdf,
  closeDanfePdfBrowser,
};
```

- [ ] **Step 4: Run focused renderer tests**

Run:

```powershell
cd backend
npm.cmd test -- danfePdf.test.js
```

Expected: all tests in `danfePdf.test.js` pass.

- [ ] **Step 5: Commit renderer**

```powershell
git add backend/utils/pdf/danfePdf.js backend/__tests__/danfePdf.test.js
git commit -m "feat: add danfe pdf renderer"
```

---

### Task 4: Add NF-e Export Rules

**Files:**
- Create: `backend/domain/nfeExportRules.js`
- Test: `backend/__tests__/nfeExportRules.test.js`

- [ ] **Step 1: Write failing tests for export parameter rules**

Create `backend/__tests__/nfeExportRules.test.js`:

```js
import { describe, expect, it } from 'vitest';
import rules from '../domain/nfeExportRules.js';

const {
  normalizarPedidoExportacaoNFe,
  buildNomeArquivoZip,
  buildNomeArquivoNFe,
  buildManifestoExportacaoNFe,
} = rules;

describe('nfeExportRules', () => {
  it('normalizes valid XML and DANFE export requests', () => {
    expect(normalizarPedidoExportacaoNFe({
      tipo: 'XML',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).toEqual({
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      dias: 30,
    });

    expect(normalizarPedidoExportacaoNFe({
      tipo: 'danfe',
      inicio: '2026-06-01',
      fim: '2026-06-01',
    }).dias).toBe(1);
  });

  it('rejects invalid type and invalid ISO dates with status 400', () => {
    expect(() => normalizarPedidoExportacaoNFe({
      tipo: 'pdf',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).toThrow(/Tipo de exportacao invalido/);

    try {
      normalizarPedidoExportacaoNFe({ tipo: 'xml', inicio: '2026-02-31', fim: '2026-06-30' });
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('periodo_invalido');
    }
  });

  it('rejects inverted and oversized periods', () => {
    expect(() => normalizarPedidoExportacaoNFe({
      tipo: 'xml',
      inicio: '2026-06-30',
      fim: '2026-06-01',
    })).toThrow(/Periodo inicial nao pode ser maior/);

    expect(() => normalizarPedidoExportacaoNFe({
      tipo: 'xml',
      inicio: '2025-01-01',
      fim: '2026-12-31',
    })).toThrow(/Periodo maximo/);
  });

  it('builds safe ZIP and entry filenames', () => {
    expect(buildNomeArquivoZip({ tipo: 'xml', inicio: '2026-06-01', fim: '2026-06-30' }))
      .toBe('nfe-xml-2026-06-01-a-2026-06-30.zip');
    expect(buildNomeArquivoZip({ tipo: 'danfe', inicio: '2026-06-01', fim: '2026-06-30' }))
      .toBe('nfe-danfe-2026-06-01-a-2026-06-30.zip');

    expect(buildNomeArquivoNFe({
      nota: { id: 7, numero: 'OS 7', nfe_numero: '29/1', nfe_chave: '31260507500718000196550010000000291000000291' },
      pasta: 'xml',
      ext: 'xml',
    })).toBe('xml/29_1-31260507500718000196550010000000291000000291.xml');
  });

  it('builds a manifesto with exported and skipped notes', () => {
    const manifesto = buildManifestoExportacaoNFe({
      tipo: 'danfe',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      geradoEm: new Date('2026-07-01T12:00:00.000Z'),
      encontradas: 2,
      exportadas: 1,
      puladas: [{ numero: '30', chave: 'abc', motivo: 'XML ausente' }],
    });

    expect(manifesto).toContain('Tipo: DANFE PDF');
    expect(manifesto).toContain('Periodo: 2026-06-01 a 2026-06-30');
    expect(manifesto).toContain('Notas encontradas: 2');
    expect(manifesto).toContain('Arquivos exportados: 1');
    expect(manifesto).toContain('30 - abc - XML ausente');
  });
});
```

- [ ] **Step 2: Run the rules tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- nfeExportRules.test.js
```

Expected: fails because `backend/domain/nfeExportRules.js` does not exist.

- [ ] **Step 3: Create export rules**

Create `backend/domain/nfeExportRules.js`:

```js
'use strict';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIPOS_VALIDOS = new Set(['xml', 'danfe']);

function criarErro(message, status = 400, code = 'exportacao_nfe_invalida') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function normalizarPedidoExportacaoNFe({ tipo, inicio, fim }, { maxDias = 370 } = {}) {
  const tipoNormalizado = String(tipo || '').trim().toLowerCase();
  if (!TIPOS_VALIDOS.has(tipoNormalizado)) {
    throw criarErro('Tipo de exportacao invalido. Use xml ou danfe.', 400, 'tipo_invalido');
  }
  if (!isIsoDate(inicio) || !isIsoDate(fim)) {
    throw criarErro('Informe inicio e fim no formato YYYY-MM-DD.', 400, 'periodo_invalido');
  }

  const inicioDate = new Date(`${inicio}T00:00:00.000Z`);
  const fimDate = new Date(`${fim}T00:00:00.000Z`);
  if (inicioDate.getTime() > fimDate.getTime()) {
    throw criarErro('Periodo inicial nao pode ser maior que o periodo final.', 400, 'periodo_invertido');
  }

  const dias = Math.floor((fimDate.getTime() - inicioDate.getTime()) / MS_PER_DAY) + 1;
  if (dias > maxDias) {
    throw criarErro(`Periodo maximo para exportacao de NF-e e de ${maxDias} dias.`, 400, 'periodo_longo');
  }

  return { tipo: tipoNormalizado, inicio, fim, dias };
}

function safeSegment(value, fallback = 'nfe') {
  const raw = String(value || fallback).trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildNomeArquivoZip({ tipo, inicio, fim }) {
  return `nfe-${tipo}-${inicio}-a-${fim}.zip`;
}

function buildNomeArquivoNFe({ nota, pasta, ext }) {
  const numero = safeSegment(nota?.nfe_numero || nota?.numero || `os-${nota?.id || 'nfe'}`);
  const chave = safeSegment(nota?.nfe_chave || nota?.chave || `sem-chave-${nota?.id || 'nfe'}`);
  return `${safeSegment(pasta)}/${numero}-${chave}.${safeSegment(ext)}`;
}

function tipoLabel(tipo) {
  return tipo === 'danfe' ? 'DANFE PDF' : 'XML autorizado';
}

function buildManifestoExportacaoNFe({
  tipo,
  inicio,
  fim,
  geradoEm = new Date(),
  encontradas = 0,
  exportadas = 0,
  puladas = [],
}) {
  const lines = [
    'Exportacao de NF-e - Sistema Arte e Molduras',
    `Tipo: ${tipoLabel(tipo)}`,
    `Periodo: ${inicio} a ${fim}`,
    `Gerado em: ${geradoEm.toISOString()}`,
    `Notas encontradas: ${encontradas}`,
    `Arquivos exportados: ${exportadas}`,
    '',
  ];

  if (puladas.length) {
    lines.push('Notas puladas:');
    for (const item of puladas) {
      lines.push(`- ${item.numero || '-'} - ${item.chave || '-'} - ${item.motivo}`);
    }
  } else {
    lines.push('Notas puladas: nenhuma');
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = {
  normalizarPedidoExportacaoNFe,
  buildNomeArquivoZip,
  buildNomeArquivoNFe,
  buildManifestoExportacaoNFe,
};
```

- [ ] **Step 4: Run the rules tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeExportRules.test.js
```

Expected: all tests in `nfeExportRules.test.js` pass.

- [ ] **Step 5: Commit export rules**

```powershell
git add backend/domain/nfeExportRules.js backend/__tests__/nfeExportRules.test.js
git commit -m "feat: add nfe export rules"
```

---

### Task 5: Add ZIP Export Service

**Files:**
- Create: `backend/services/nfeExportService.js`
- Test: `backend/__tests__/nfeExportService.test.js`

- [ ] **Step 1: Write failing service tests**

Create `backend/__tests__/nfeExportService.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import nfeExportService from '../services/nfeExportService.js';

const { gerarExportacaoNFe } = nfeExportService;

function makeDb(rows) {
  const all = vi.fn(() => rows);
  return {
    prepare: vi.fn(() => ({ all })),
    _all: all,
  };
}

async function readZipText(buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  return buffer.toString('latin1');
}

describe('nfeExportService', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe31260507500718000196550010000000291000000291">
      <ide><natOp>Venda</natOp><mod>55</mod><serie>1</serie><nNF>29</nNF><dhEmi>2026-06-10T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>
      <emit><CNPJ>07500718000196</CNPJ><xNome>ARTE E MOLDURAS LTDA</xNome><enderEmit><xLgr>Rua Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>Ipatinga</xMun><UF>MG</UF><CEP>35160000</CEP></enderEmit></emit>
      <dest><CPF>12345678909</CPF><xNome>Cliente</xNome><enderDest><xLgr>Av Cliente</xLgr><nro>20</nro><xBairro>Bairro</xBairro><xMun>Ipatinga</xMun><UF>MG</UF><CEP>35162000</CEP></enderDest></dest>
      <det nItem="1"><prod><cProd>1</cProd><xProd>Moldura MDF</xProd><NCM>44140000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>100.00</vUnCom><vProd>100.00</vProd></prod></det>
      <total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vProd>100.00</vProd><vFrete>0.00</vFrete><vDesc>0.00</vDesc><vNF>100.00</vNF></ICMSTot></total>
      <transp><modFrete>9</modFrete></transp>
      <pag><detPag><tPag>01</tPag><vPag>100.00</vPag></detPag></pag>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>31260507500718000196550010000000291000000291</chNFe><nProt>131260152119363</nProt><cStat>100</cStat><dhRecbto>2026-06-10T10:00:05-03:00</dhRecbto></infProt></protNFe>
</nfeProc>`;
  const rows = [
    {
      id: 1,
      numero: 'OS 1',
      nfe_numero: '29',
      nfe_serie: '1',
      nfe_chave: '31260507500718000196550010000000291000000291',
      nfe_status: 'autorizado',
      nfe_emitida_em: '2026-06-10T10:00:00-03:00',
      nfe_xml: xml,
    },
  ];

  it('generates an XML ZIP with manifest and XML entry', async () => {
    const result = await gerarExportacaoNFe({
      db: makeDb(rows),
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    const zipText = await readZipText(result.buffer);
    expect(result.filename).toBe('nfe-xml-2026-06-01-a-2026-06-30.zip');
    expect(result.contentType).toBe('application/zip');
    expect(zipText).toContain('xml/29-31260507500718000196550010000000291000000291.xml');
    expect(zipText).toContain('manifesto.txt');
  });

  it('generates a DANFE ZIP using the supplied PDF renderer', async () => {
    const renderPdf = vi.fn(async (html) => {
      expect(html).toContain('DANFE');
      return Buffer.from('%PDF-danfe');
    });

    const result = await gerarExportacaoNFe({
      db: makeDb(rows),
      tipo: 'danfe',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      renderPdf,
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    const zipText = await readZipText(result.buffer);
    expect(renderPdf).toHaveBeenCalledTimes(1);
    expect(result.filename).toBe('nfe-danfe-2026-06-01-a-2026-06-30.zip');
    expect(zipText).toContain('danfe/29-31260507500718000196550010000000291000000291.pdf');
    expect(zipText).toContain('manifesto.txt');
  });

  it('skips notes with invalid XML when another note can be exported', async () => {
    const result = await gerarExportacaoNFe({
      db: makeDb([
        { ...rows[0], id: 1, nfe_numero: '29', nfe_xml: xml },
        { ...rows[0], id: 2, nfe_numero: '30', nfe_chave: 'bad', nfe_xml: 'sem xml' },
      ]),
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    expect(result.exportadas).toBe(1);
    expect(result.puladas).toHaveLength(1);
    expect(result.puladas[0].motivo).toBe('XML autorizado ausente ou invalido');
  });

  it('throws a friendly 404 when no notes match the period', async () => {
    await expect(gerarExportacaoNFe({
      db: makeDb([]),
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).rejects.toMatchObject({
      status: 404,
      message: 'Nenhuma NF-e exportavel encontrada para o periodo informado.',
    });
  });

  it('throws a friendly 422 when all matching notes are invalid', async () => {
    await expect(gerarExportacaoNFe({
      db: makeDb([{ ...rows[0], nfe_xml: 'sem xml' }]),
      tipo: 'xml',
      inicio: '2026-06-01',
      fim: '2026-06-30',
    })).rejects.toMatchObject({
      status: 422,
      message: 'Nenhum arquivo exportavel foi gerado para o periodo informado.',
    });
  });
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- nfeExportService.test.js
```

Expected: fails because `backend/services/nfeExportService.js` does not exist.

- [ ] **Step 3: Create the ZIP export service**

Create `backend/services/nfeExportService.js`:

```js
'use strict';

const archiver = require('archiver');
const { renderDanfeHtml } = require('../utils/danfe');
const { renderDanfePdf } = require('../utils/pdf/danfePdf');
const { extrairXmlFiscal } = require('../utils/nfeXml');
const {
  normalizarPedidoExportacaoNFe,
  buildNomeArquivoZip,
  buildNomeArquivoNFe,
  buildManifestoExportacaoNFe,
} = require('../domain/nfeExportRules');

function criarErro(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function buscarNotasExportaveis(db, { inicio, fim }) {
  return db.prepare(`
    SELECT o.id, o.numero, o.nfe_numero, o.nfe_serie, o.nfe_chave, o.nfe_status,
           o.nfe_emitida_em, o.nfe_xml
    FROM ordens o
    WHERE o.deletedat IS NULL
      AND o.nfe_deletedat IS NULL
      AND o.nfe_status IN ('autorizado', 'cancelado')
      AND date(o.nfe_emitida_em) BETWEEN ? AND ?
    ORDER BY o.nfe_emitida_em ASC, CAST(o.nfe_numero AS INTEGER) ASC, o.nfe_numero ASC
  `).all(inicio, fim);
}

function zipBuffer(entries) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }

    archive.finalize();
  });
}

async function gerarExportacaoNFe({
  db,
  tipo,
  inicio,
  fim,
  renderPdf = renderDanfePdf,
  now = new Date(),
}) {
  const pedido = normalizarPedidoExportacaoNFe({ tipo, inicio, fim });
  const notas = buscarNotasExportaveis(db, pedido);

  if (!notas.length) {
    throw criarErro('Nenhuma NF-e exportavel encontrada para o periodo informado.', 404, 'sem_notas_exportaveis');
  }

  const entries = [];
  const puladas = [];

  for (const nota of notas) {
    const xml = extrairXmlFiscal(nota.nfe_xml);
    if (!xml) {
      puladas.push({
        numero: nota.nfe_numero || nota.numero,
        chave: nota.nfe_chave,
        motivo: 'XML autorizado ausente ou invalido',
      });
      continue;
    }

    try {
      if (pedido.tipo === 'xml') {
        entries.push({
          name: buildNomeArquivoNFe({ nota, pasta: 'xml', ext: 'xml' }),
          content: xml,
        });
      } else {
        const html = renderDanfeHtml(xml);
        const pdf = await renderPdf(html);
        entries.push({
          name: buildNomeArquivoNFe({ nota, pasta: 'danfe', ext: 'pdf' }),
          content: pdf,
        });
      }
    } catch (err) {
      puladas.push({
        numero: nota.nfe_numero || nota.numero,
        chave: nota.nfe_chave,
        motivo: err.message || 'Falha ao gerar arquivo',
      });
    }
  }

  if (!entries.length) {
    throw criarErro('Nenhum arquivo exportavel foi gerado para o periodo informado.', 422, 'sem_arquivos_exportaveis');
  }

  const manifesto = buildManifestoExportacaoNFe({
    tipo: pedido.tipo,
    inicio: pedido.inicio,
    fim: pedido.fim,
    geradoEm: now,
    encontradas: notas.length,
    exportadas: entries.length,
    puladas,
  });

  entries.push({
    name: 'manifesto.txt',
    content: manifesto,
  });

  const buffer = await zipBuffer(entries);

  return {
    buffer,
    filename: buildNomeArquivoZip(pedido),
    contentType: 'application/zip',
    encontradas: notas.length,
    exportadas: entries.length - 1,
    puladas,
  };
}

module.exports = {
  gerarExportacaoNFe,
  buscarNotasExportaveis,
};
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeExportService.test.js nfeExportRules.test.js nfeXml.test.js danfe.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit export service**

```powershell
git add backend/services/nfeExportService.js backend/__tests__/nfeExportService.test.js
git commit -m "feat: add nfe zip export service"
```

---

### Task 6: Wire NF-e Routes for PDF and Export

**Files:**
- Modify: `backend/routes/nfe.js`
- Modify: `backend/__tests__/routeContracts.test.js`

- [ ] **Step 1: Add route contract tests**

Append these expectations inside the existing fiscal route tests in `backend/__tests__/routeContracts.test.js`:

```js
    expect(routeRoles(nfeRouter, 'get', '/exportar')).toEqual(['admin', 'caixa']);
    expect(routeRoles(nfeRouter, 'get', '/:chave/danfe')).toEqual(['admin', 'caixa']);
```

Append this test inside `describe('security configuration contracts', () => { ... })`:

```js
  it('serves DANFE as PDF download and keeps export route before dynamic fiscal routes', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    const source = fs.readFileSync(new URL('../routes/nfe.js', import.meta.url), 'utf8');

    expect(packageJson.dependencies).toHaveProperty('puppeteer');
    expect(source).toMatch(/renderDanfePdf/);
    expect(source).toMatch(/Content-Type['"],\s*['"]application\/pdf/);
    expect(source).toMatch(/attachment; filename="danfe-\$\{filenameSeguro\(chave\)\}\.pdf"/);
    expect(source).toMatch(/gerarExportacaoNFe/);
    expect(source.indexOf("'/exportar'")).toBeLessThan(source.indexOf("'/:chave/eventos'"));
  });
```

- [ ] **Step 2: Run route contract tests and verify they fail**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js
```

Expected: fails because `/exportar`, PDF headers, and route wiring are not present.

- [ ] **Step 3: Import PDF and export services in the NF-e route**

In `backend/routes/nfe.js`, replace this import:

```js
const { sendPrintHtml } = require('../utils/print/base');
```

with:

```js
const { renderDanfePdf } = require('../utils/pdf/danfePdf');
const { gerarExportacaoNFe } = require('../services/nfeExportService');
```

- [ ] **Step 4: Add the ZIP export endpoint before dynamic `/:chave` routes**

In `backend/routes/nfe.js`, place this block after the `/inutilizacoes/:id/xml/:tipo` route and before `// GET /api/nfe/:chave/eventos`:

```js
// GET /api/nfe/exportar?tipo=xml|danfe&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
router.get('/exportar', auth(['admin', 'caixa']), async (req, res) => {
  try {
    const result = await gerarExportacaoNFe({
      db: getDB(),
      tipo: req.query.tipo,
      inicio: req.query.inicio,
      fim: req.query.fim,
    });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) {
      console.error('[NF-e] GET /exportar:', e.message);
    }
    res.status(status).json({
      erro: e.status ? e.message : 'Erro ao exportar NF-e',
      code: e.code || 'erro_exportacao_nfe',
    });
  }
});
```

- [ ] **Step 5: Replace the DANFE HTML response with PDF download**

In `backend/routes/nfe.js`, change the DANFE route handler declaration:

```js
router.get('/:chave/danfe', auth(['admin', 'caixa']), (req, res) => {
```

to:

```js
router.get('/:chave/danfe', auth(['admin', 'caixa']), async (req, res) => {
```

Inside that route, replace:

```js
    const html = renderDanfeHtml(xml);
    sendPrintHtml(res, `danfe-${filenameSeguro(chave)}.html`, html);
```

with:

```js
    const html = renderDanfeHtml(xml);
    const pdf = await renderDanfePdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="danfe-${filenameSeguro(chave)}.pdf"`);
    res.send(pdf);
```

- [ ] **Step 6: Run focused backend tests**

Run:

```powershell
cd backend
npm.cmd test -- routeContracts.test.js nfeExportService.test.js danfePdf.test.js nfeXml.test.js
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit route wiring**

```powershell
git add backend/routes/nfe.js backend/__tests__/routeContracts.test.js
git commit -m "feat: serve danfe pdf and nfe export zip"
```

---

### Task 7: Update NF-e Frontend Download Flow

**Files:**
- Modify: `frontend/src/pages/NotasFiscais.jsx`
- Modify: `frontend/src/pages/NotasFiscais.test.jsx`

- [ ] **Step 1: Write failing frontend tests for export modal and DANFE download**

Replace `frontend/src/pages/NotasFiscais.test.jsx` with:

```jsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import NotasFiscais from './NotasFiscais';

let authState = { isAdmin: true };
const navigateMock = vi.fn();

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../components/nfe/InutilizacaoModal', () => ({
  default: ({ open }) => open ? <div role="dialog">Modal inutilizacao</div> : null,
}));

function mockListaNotas(notas = []) {
  api.get.mockImplementation((url) => {
    if (url === '/nfe') {
      return Promise.resolve({
        data: {
          notas,
          meta: { ambiente: 1, autorizadas_homologacao: 0, alvo_homologacao: 10 },
        },
      });
    }
    return Promise.resolve({ data: new Blob(['ok']) });
  });
}

describe('NotasFiscais inutilizacao manual', () => {
  beforeEach(() => {
    authState = { isAdmin: true };
    navigateMock.mockClear();
    api.get.mockReset();
    api.post.mockReset();
    api.delete.mockReset();
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
    mockListaNotas([]);
  });

  it('mostra acao de inutilizacao somente para admin', async () => {
    render(<NotasFiscais />);

    expect(await screen.findByRole('button', { name: /inutilizar numeração/i })).toBeInTheDocument();
  });

  it('nao mostra acao de inutilizacao para caixa', async () => {
    authState = { isAdmin: false };

    render(<NotasFiscais />);

    await screen.findByRole('heading', { name: /notas fiscais/i });
    expect(screen.queryByRole('button', { name: /inutilizar numeração/i })).not.toBeInTheDocument();
  });

  it('abre modal de exportacao e baixa ZIP com parametros selecionados', async () => {
    const user = userEvent.setup();
    render(<NotasFiscais />);

    await user.click(await screen.findByRole('button', { name: /exportar/i }));
    expect(screen.getByRole('heading', { name: /exportar nf-e/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'danfe' } });
    fireEvent.change(screen.getByLabelText(/data inicial/i), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText(/data final/i), { target: { value: '2026-06-30' } });

    await user.click(screen.getByRole('button', { name: /^exportar$/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/nfe/exportar', expect.objectContaining({
        responseType: 'blob',
        timeout: 120000,
        skipGlobalErrorToast: true,
        params: { tipo: 'danfe', inicio: '2026-06-01', fim: '2026-06-30' },
      }));
    });
  });

  it('baixa DANFE individual como PDF sem abrir nova aba', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    mockListaNotas([
      {
        id: 1,
        numero: 'OS 1',
        clientenome: 'Cliente',
        servico: 'Moldura',
        valortotal: 100,
        status: 'Entregue',
        nfe_status: 'autorizado',
        nfe_numero: '29',
        nfe_serie: '1',
        nfe_chave: '31260507500718000196550010000000291000000291',
        nfe_emitida_em: '2026-06-10T10:00:00-03:00',
      },
    ]);

    render(<NotasFiscais />);

    await user.click(await screen.findByRole('button', { name: /danfe/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/nfe/31260507500718000196550010000000291000000291/danfe',
        expect.objectContaining({ responseType: 'blob', timeout: 45000 })
      );
    });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run frontend tests and verify they fail**

Run:

```powershell
cd frontend
npm.cmd test -- NotasFiscais.test.jsx
```

Expected: fails because the export modal and DANFE blob download are not implemented.

- [ ] **Step 3: Update imports and remove window-opening DANFE helper**

In `frontend/src/pages/NotasFiscais.jsx`, change the lucide import:

```js
import { FileWarning, Plus, RotateCcw, Trash2 } from 'lucide-react'
```

to:

```js
import { Download, FileWarning, Plus, RotateCcw, Trash2 } from 'lucide-react'
```

Replace `abrirDanfe(chave)` with:

```js
async function baixarDanfe(chave) {
  if (!chave) {
    toast.error('Chave da NF-e indisponivel')
    return
  }
  try {
    await baixarArquivo(`/nfe/${chave}/danfe`, `danfe-${chave}.pdf`)
  } catch (e) {
    toast.error(e.response?.data?.erro || 'DANFE indisponivel')
  }
}
```

- [ ] **Step 4: Add the export modal component in `NotasFiscais.jsx` before the default page component**

Add this component above `export default function NotasFiscais`:

```jsx
function ModalExportacaoNFe({ onClose }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const primeiroDiaMes = `${hoje.slice(0, 8)}01`
  const [tipo, setTipo] = useState('xml')
  const [inicio, setInicio] = useState(primeiroDiaMes)
  const [fim, setFim] = useState(hoje)
  const [baixando, setBaixando] = useState(false)

  const handleSubmit = async () => {
    if (!inicio || !fim) {
      toast.error('Informe data inicial e data final')
      return
    }
    if (inicio > fim) {
      toast.error('Data inicial nao pode ser maior que data final')
      return
    }

    setBaixando(true)
    try {
      const nome = `nfe-${tipo}-${inicio}-a-${fim}.zip`
      const r = await api.get('/nfe/exportar', {
        params: { tipo, inicio, fim },
        responseType: 'blob',
        timeout: 120000,
        skipGlobalErrorToast: true,
      })
      const href = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = href
      a.download = nome
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
      toast.success('Exportacao gerada')
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.erro || 'Nao foi possivel exportar NF-e')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'oklch(from var(--color-text) l c h / 0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={e => e.target === e.currentTarget && !baixando && onClose()}
    >
      <div style={{
        width: 'min(460px, calc(100vw - 32px))',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>Exportar NF-e</h2>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
              Baixe XML ou DANFE PDF por periodo de emissao.
            </p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} disabled={baixando} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-4)' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Tipo</span>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value)} disabled={baixando}>
              <option value="xml">XML</option>
              <option value="danfe">DANFE PDF</option>
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Data inicial</span>
              <input className="form-input" type="date" value={inicio} onChange={e => setInicio(e.target.value)} disabled={baixando} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-muted)' }}>Data final</span>
              <input className="form-input" type="date" value={fim} onChange={e => setFim(e.target.value)} disabled={baixando} />
            </label>
          </div>
        </div>

        <div style={{ padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--color-divider)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={baixando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={baixando}>
            {baixando ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add modal state and header button**

Inside `NotasFiscais`, add state near the other modal states:

```js
  const [modalExportacao, setModalExportacao] = useState(false)
```

In the header button group, before the admin-only lixeira button, add:

```jsx
              <button className="btn btn-ghost" onClick={() => setModalExportacao(true)} style={{ gap: 'var(--space-2)' }}>
                <Download size={16} /> Exportar
              </button>
```

Near the other modal render calls, add:

```jsx
      {modalExportacao && <ModalExportacaoNFe onClose={() => setModalExportacao(false)} />}
```

- [ ] **Step 6: Change individual DANFE buttons to use the blob download helper**

Replace both occurrences of:

```jsx
<button className="btn btn-ghost btn-sm" onClick={() => abrirDanfe(n.nfe_chave)} title="Abrir DANFE para impressao">DANFE</button>
```

with:

```jsx
<button className="btn btn-ghost btn-sm" onClick={() => baixarDanfe(n.nfe_chave)} title="Baixar DANFE em PDF">DANFE</button>
```

Replace the detail modal occurrence:

```jsx
<button className="btn btn-ghost btn-sm" onClick={() => abrirDanfe(nfe.nfe_chave)} title="Abrir DANFE para impressao">DANFE</button>
```

with:

```jsx
<button className="btn btn-ghost btn-sm" onClick={() => baixarDanfe(nfe.nfe_chave)} title="Baixar DANFE em PDF">DANFE</button>
```

- [ ] **Step 7: Run focused frontend tests**

Run:

```powershell
cd frontend
npm.cmd test -- NotasFiscais.test.jsx
```

Expected: all tests in `NotasFiscais.test.jsx` pass.

- [ ] **Step 8: Commit frontend flow**

```powershell
git add frontend/src/pages/NotasFiscais.jsx frontend/src/pages/NotasFiscais.test.jsx
git commit -m "feat: add nfe export modal"
```

---

### Task 8: Final Verification

**Files:**
- Verify: backend and frontend test suites

- [ ] **Step 1: Run backend focused tests**

Run:

```powershell
cd backend
npm.cmd test -- nfeXml.test.js danfePdf.test.js nfeExportRules.test.js nfeExportService.test.js danfe.test.js routeContracts.test.js
```

Expected: all selected backend tests pass.

- [ ] **Step 2: Run frontend focused tests**

Run:

```powershell
cd frontend
npm.cmd test -- NotasFiscais.test.jsx
```

Expected: all selected frontend tests pass.

- [ ] **Step 3: Run backend full suite**

Run:

```powershell
cd backend
npm.cmd test
```

Expected: all backend tests pass.

- [ ] **Step 4: Build frontend**

Run:

```powershell
cd frontend
npm.cmd run build
```

Expected: Vite build exits with code `0` and writes `frontend/dist`.

- [ ] **Step 5: Manual browser check**

Start local backend/frontend as the project normally requires, log in as admin or caixa, then verify:

```text
1. Open /nfe.
2. Click DANFE on an authorized note.
3. Confirm the browser downloads danfe-<chave>.pdf.
4. Open the PDF and verify A4 layout, logo, barcode, customer, items, totals, and protocol.
5. Click Exportar.
6. Select XML, choose a period with authorized notes, and confirm a ZIP downloads.
7. Select DANFE PDF for the same period and confirm a ZIP downloads.
8. Open each ZIP and verify the expected folder plus manifesto.txt.
```

- [ ] **Step 6: Inspect git diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only files from this plan are modified, plus dependency lockfile changes from `npm.cmd install puppeteer`.
