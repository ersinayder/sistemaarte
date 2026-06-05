const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { montarDestinoImpressora } = require('../../domain/impressaoConfigRules');

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

function resolvePrinterName(env = process.env, printerConfig = null) {
  const fromConfig = montarDestinoImpressora(printerConfig || {});
  if (fromConfig) return fromConfig;
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
  const printerLine = printerName ? `$printerName = ${psString(printerName)}` : '$printerName = $null';

  return `
$ErrorActionPreference = 'Stop'
$htmlPath = ${psString(htmlPath)}
${printerLine}
$browserCandidates = @(
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
  "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe"
)
$browser = $browserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  throw 'Chrome ou Edge nao encontrado no servidor para impressao HTML.'
}

$oldDefault = Get-CimInstance Win32_Printer | Where-Object { $_.Default } | Select-Object -First 1
if ($printerName) {
  $printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $printerName } | Select-Object -First 1
  if (-not $printer -and $printerName.StartsWith('\\\\')) {
    $shareName = Split-Path -Leaf $printerName
    $printer = Get-CimInstance Win32_Printer | Where-Object { $_.ShareName -eq $shareName } | Select-Object -First 1
    if (-not $printer) {
      Add-Printer -ConnectionName $printerName
      Start-Sleep -Seconds 2
      $printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $printerName -or $_.ShareName -eq $shareName } | Select-Object -First 1
    }
  }
  if (-not $printer) {
    throw "Impressora nao encontrada no servidor: $printerName"
  }
  Invoke-CimMethod -InputObject $printer -MethodName SetDefaultPrinter | Out-Null
}

$fileUri = ([System.Uri]$htmlPath).AbsoluteUri
for ($i = 0; $i -lt ${normalizePrintCopies(copies)}; $i++) {
  $userDataDir = Join-Path $env:TEMP ("sistema-arte-print-browser-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $userDataDir | Out-Null
  $args = @(
    "--kiosk-printing",
    "--disable-print-preview",
    "--no-first-run",
    "--disable-extensions",
    "--user-data-dir=$userDataDir",
    $fileUri
  )
  $process = Start-Process -FilePath $browser -ArgumentList $args -PassThru
  $shell = New-Object -ComObject WScript.Shell
  for ($attempt = 0; $attempt -lt 16; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($shell.AppActivate('Print')) {
      Start-Sleep -Milliseconds 250
      $shell.SendKeys('{ENTER}')
      break
    }
  }
  Start-Sleep -Seconds 8
  if ($process -and -not $process.HasExited) {
    $process.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 1
    if (-not $process.HasExited) { $process.Kill() }
  }
  Remove-Item -LiteralPath $userDataDir -Recurse -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

if ($printerName -and $oldDefault) {
  $currentOldDefault = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $oldDefault.Name } | Select-Object -First 1
  if ($currentOldDefault) {
    Invoke-CimMethod -InputObject $currentOldDefault -MethodName SetDefaultPrinter | Out-Null
  }
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
  printerConfig = null,
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
  const printerName = resolvePrinterName(env, printerConfig);
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
