const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_ORDEM_PRINTER = '\\\\ARTESERVER\\Impressoraloja';
const PRINT_TIMEOUT_MS = 45000;
const TEMP_DIR = path.join(os.tmpdir(), 'sistema-arte-print');

function normalizePrintCopies(value = 1) {
  const copies = Number(value ?? 1);
  if (!Number.isInteger(copies) || ![1, 2].includes(copies)) {
    throw new Error('Informe 1 ou 2 vias para impressao.');
  }
  return copies;
}

function resolvePrinterName(env = process.env) {
  const configured = String(env.ORDEM_PRINTER_NAME || '').trim();
  return configured || DEFAULT_ORDEM_PRINTER;
}

function safeJobName(value = 'documento') {
  return String(value || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'documento';
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildPrintScript({ htmlPath, printerName, copies }) {
  const printVerb = printerName ? 'PrintTo' : 'Print';
  const printerLine = printerName ? `$printerName = ${psString(printerName)}` : '$printerName = $null';
  const argumentLine = printerName ? ' -ArgumentList $printerName' : '';

  return `
$ErrorActionPreference = 'Stop'
$htmlPath = ${psString(htmlPath)}
${printerLine}
for ($i = 0; $i -lt ${normalizePrintCopies(copies)}; $i++) {
  $process = Start-Process -FilePath $htmlPath -Verb ${printVerb}${argumentLine} -PassThru
  if ($process) {
    $process.WaitForExit(30000) | Out-Null
  }
  Start-Sleep -Milliseconds 800
}
`.trim();
}

function writeTempHtml(html, jobName) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const filename = `${safeJobName(jobName)}-${Date.now()}-${Math.random().toString(16).slice(2)}.html`;
  const file = path.join(TEMP_DIR, filename);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: PRINT_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function scheduleCleanup(file) {
  const timer = setTimeout(() => {
    fs.unlink(file, () => {});
  }, 5 * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
}

async function printHtml({
  html,
  jobName,
  copies = 1,
  env = process.env,
  platform = process.platform,
  writeTempHtml: writeTemp = writeTempHtml,
  runPowerShell: run = runPowerShell,
  scheduleCleanup: cleanup = scheduleCleanup,
} = {}) {
  if (platform !== 'win32') {
    throw new Error('Impressao direta disponivel apenas no Windows Server.');
  }
  if (!html) throw new Error('Documento de impressao vazio.');

  const normalizedCopies = normalizePrintCopies(copies);
  const printerName = resolvePrinterName(env);
  const htmlPath = writeTemp(html, jobName);
  const script = buildPrintScript({ htmlPath, printerName, copies: normalizedCopies });

  await run(script);
  cleanup(htmlPath);

  return { ok: true, printerName, copies: normalizedCopies };
}

module.exports = {
  DEFAULT_ORDEM_PRINTER,
  buildPrintScript,
  normalizePrintCopies,
  printHtml,
  resolvePrinterName,
  safeJobName,
  writeTempHtml,
};
