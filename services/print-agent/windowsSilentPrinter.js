'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

const BROWSER_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function getBrowserPath() {
  for (const p of BROWSER_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getSumatraPath(baseDir = __dirname) {
  const direct = path.join(baseDir, 'SumatraPDF.exe');
  if (fs.existsSync(direct)) return direct;
  const inBin = path.join(baseDir, 'bin', 'SumatraPDF.exe');
  if (fs.existsSync(inBin)) return inBin;
  return null;
}

function safeJobName(value = 'documento') {
  return String(value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'documento';
}

async function printViaSumatra({
  html,
  jobName = 'documento',
  copies = 1,
  printerName = 'Canon G3010 series',
  baseDir = __dirname,
  timeoutMs = 30000,
}) {
  if (process.platform !== 'win32') {
    throw new Error('Impressao direta Windows disponivel apenas no Windows.');
  }

  const browser = getBrowserPath();
  if (!browser) {
    throw new Error('Nenhum navegador (Edge ou Chrome) encontrado para renderizacao.');
  }

  const sumatra = getSumatraPath(baseDir);
  if (!sumatra) {
    throw new Error('SumatraPDF.exe nao encontrado em ' + baseDir);
  }

  const safeName = safeJobName(jobName);
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const tempHtml = path.join(os.tmpdir(), `sa-${safeName}-${stamp}.html`);
  const tempPdf = path.join(os.tmpdir(), `sa-${safeName}-${stamp}.pdf`);
  const tempProfile = path.join(os.tmpdir(), `sa-profile-${stamp}`);

  try {
    fs.writeFileSync(tempHtml, html, 'utf8');

    // 1. Converte HTML para PDF usando Edge / Chrome headless
    const browserArgs = [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--user-data-dir=${tempProfile}`,
      `--print-to-pdf=${tempPdf}`,
      tempHtml,
    ];

    childProcess.execFileSync(browser, browserArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      stdio: 'pipe',
    });

    if (!fs.existsSync(tempPdf) || fs.statSync(tempPdf).size === 0) {
      throw new Error('Falha ao gerar PDF para impressao (arquivo vazio ou inexistente).');
    }

    // 2. Envia para a impressora via SumatraPDF silenciosamente
    const normalizedCopies = Math.max(1, Math.min(2, Number(copies) || 1));
    const sumatraArgs = [
      '-print-to',
      printerName,
      '-print-settings',
      `${normalizedCopies}x,portrait,noscale`,
      '-silent',
      tempPdf,
    ];

    childProcess.execFileSync(sumatra, sumatraArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      stdio: 'pipe',
    });

    return { ok: true, printerName, copies: normalizedCopies };
  } finally {
    // Limpeza de arquivos temporarios
    try { if (fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml); } catch {}
    try { if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf); } catch {}
    try { if (fs.existsSync(tempProfile)) fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
  }
}

module.exports = {
  getBrowserPath,
  getSumatraPath,
  printViaSumatra,
  safeJobName,
};
