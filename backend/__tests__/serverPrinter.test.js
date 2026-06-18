import { describe, expect, it, vi } from 'vitest';

const printer = await import('../utils/print/serverPrinter.js');

describe('server printer helper', () => {
  it('accepts only one or two print copies', () => {
    expect(printer.normalizePrintCopies()).toBe(1);
    expect(printer.normalizePrintCopies('1')).toBe(1);
    expect(printer.normalizePrintCopies(2)).toBe(2);
    expect(() => printer.normalizePrintCopies(0)).toThrow('Informe 1 ou 2 vias');
    expect(() => printer.normalizePrintCopies(3)).toThrow('Informe 1 ou 2 vias');
  });

  it('uses the configured store printer with the shared Canon path as fallback', () => {
    expect(printer.resolvePrinterName({ ORDEM_PRINTER_NAME: 'Canon Loja' })).toBe('Canon Loja');
    expect(printer.resolvePrinterName(
      { ORDEM_PRINTER_NAME: 'Canon Loja' },
      { printerName: 'Impressoraloja', printerIp: '192.168.0.45' }
    )).toBe('\\\\192.168.0.45\\Impressoraloja');
    expect(printer.resolvePrinterName({})).toBe('\\\\ARTESERVER\\Impressoraloja');
  });

  it('builds a browser kiosk print script without relying on .html file associations', () => {
    const script = printer.buildPrintScript({
      htmlPath: 'C:\\Temp\\ordem.html',
      printerName: '\\\\ARTESERVER\\Impressoraloja',
      copies: 2,
    });

    expect(script).toContain("$htmlPath = 'C:\\Temp\\ordem.html'");
    expect(script).toContain("$printerName = '\\\\ARTESERVER\\Impressoraloja'");
    expect(script).toContain('$copies = 2');
    expect(script).toContain('chrome.exe');
    expect(script).toContain('msedge.exe');
    expect(script).toContain('$shareName = Split-Path -Leaf $printerName');
    expect(script).toContain('$_.ShareName -eq $shareName');
    expect(script).toContain('Add-Printer -ConnectionName $printerName');
    expect(script).toContain('SetDefaultPrinter');
    expect(script).toContain('--kiosk-printing');
    expect(script).toContain('PRINT_PREVIEW_STICKY_SETTINGS');
    expect(script).toContain('print_preview_sticky_settings');
    expect(script).toContain('appState');
    expect(script).toContain('ISO_A5');
    expect(script).toContain('width_microns = 148000');
    expect(script).toContain('height_microns = 210000');
    expect(script).not.toContain('ISO_A4');
    expect(script).toContain('copies = $copies');
    expect(script).toContain('marginsType = 1');
    expect(script).toContain('scaling = 92');
    expect(script).toContain('sistema-arte-print-browser-');
    expect(script).toContain('Start-Sleep -Milliseconds 1500');
    expect(script).not.toContain('WScript.Shell');
    expect(script).not.toContain("SendKeys('{ENTER}')");
    expect(script).not.toContain('--disable-print-preview');
    expect(script).not.toContain('Start-Sleep -Seconds 8');
    expect(script).not.toContain('Start-Sleep -Seconds 3');
    expect(script).not.toContain('for ($i = 0;');
    expect(script).not.toContain('-Verb PrintTo');
  });

  it('can keep the browser open longer for heavy service order documents', () => {
    const script = printer.buildPrintScript({
      htmlPath: 'C:\\Temp\\ordem-grande.html',
      printerName: '\\\\ARTESERVER\\Impressoraloja',
      copies: 1,
      settleMs: 8000,
    });

    expect(script).toContain('Start-Sleep -Milliseconds 8000');
  });

  it('uses complete Canon A5 capabilities in a fresh Chrome profile', () => {
    const script = printer.buildPrintScript({
      htmlPath: 'C:\\Temp\\ordem.html',
      printerName: 'Canon G3010 series',
      copies: 1,
    });

    expect(script).toContain("vendor_id = '11'");
    expect(script).toContain('imageable_area_right_microns = 148000');
    expect(script).toContain('imageable_area_top_microns = 210000');
    expect(script).toContain('capabilities = $printerCapabilities');
    expect(script).toContain('media_size = @{ option = @($a5MediaSize) }');
    expect(script).toContain('displayName = $destinationId');
    expect(script).toContain('[System.Guid]::NewGuid()');
    expect(script).not.toContain('Join-Path $env:TEMP "sistema-arte-print-browser-profile"');
  });

  it('prints by writing a temporary HTML file and invoking PowerShell', async () => {
    const writeTempHtml = vi.fn(() => 'C:\\Temp\\ordem.html');
    const runPowerShell = vi.fn(() => Promise.resolve({ stdout: '', stderr: '' }));

    const result = await printer.printHtml({
      html: '<html>OS</html>',
      jobName: 'ordem-OS-0042',
      copies: 2,
      env: { ORDEM_PRINTER_NAME: 'Canon Loja' },
      printerConfig: { printerName: 'Impressoraloja', printerIp: '192.168.0.45' },
      platform: 'win32',
      writeTempHtml,
      runPowerShell,
      scheduleCleanup: vi.fn(),
    });

    expect(writeTempHtml).toHaveBeenCalledWith('<html>OS</html>', 'ordem-OS-0042');
    expect(runPowerShell).toHaveBeenCalledWith(expect.stringContaining("$printerName = '\\\\192.168.0.45\\Impressoraloja'"));
    expect(runPowerShell).toHaveBeenCalledWith(expect.not.stringContaining('-Verb PrintTo'));
    expect(result).toEqual({ ok: true, printerName: '\\\\192.168.0.45\\Impressoraloja', copies: 2 });
  });

  it('builds a clear diagnostic package for A5 server printing', async () => {
    const writeTempHtml = vi.fn(() => 'C:\\Temp\\teste-impressao-a5.html');
    const runPowerShell = vi.fn(() => Promise.resolve({ stdout: 'sent', stderr: '' }));

    const result = await printer.diagnosePrintHtml({
      html: '<html><body>A5</body></html>',
      jobName: 'diagnostico-impressao-a5',
      copies: 1,
      env: { ORDEM_PRINTER_NAME: 'Canon Loja' },
      printerConfig: { printerName: 'Impressoraloja', printerIp: '192.168.0.45' },
      platform: 'win32',
      writeTempHtml,
      runPowerShell,
      scheduleCleanup: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(result.printerName).toBe('\\\\192.168.0.45\\Impressoraloja');
    expect(result.diagnostics.html.path).toBe('C:\\Temp\\teste-impressao-a5.html');
    expect(result.diagnostics.html.bytes).toBe(Buffer.byteLength('<html><body>A5</body></html>', 'utf8'));
    expect(result.diagnostics.destination.resolved).toBe('\\\\192.168.0.45\\Impressoraloja');
    expect(result.diagnostics.a5.mediaSize.name).toBe('ISO_A5');
    expect(result.diagnostics.a5.mediaSize.widthMicrons).toBe(148000);
    expect(result.diagnostics.a5.mediaSize.heightMicrons).toBe(210000);
    expect(result.diagnostics.a5.scaling).toBe(92);
    expect(result.diagnostics.chrome.temporaryProfilePrefix).toBe('sistema-arte-print-browser-');
    expect(result.diagnostics.chrome.kioskPrinting).toBe(true);
    expect(result.diagnostics.powerShell.stdout).toBe('sent');
    expect(result.diagnostics.powerShell.error).toBeNull();
  });

  it('keeps PowerShell failure details in the diagnostic package', async () => {
    const error = new Error('Impressora nao encontrada no servidor: Loja A5');
    error.stdout = 'before failure';
    error.stderr = 'missing printer';

    const result = await printer.diagnosePrintHtml({
      html: '<html>OS</html>',
      jobName: 'diagnostico-impressao-a5',
      copies: 1,
      printerConfig: { printerName: 'Loja A5' },
      platform: 'win32',
      writeTempHtml: vi.fn(() => 'C:\\Temp\\erro.html'),
      runPowerShell: vi.fn(() => Promise.reject(error)),
      scheduleCleanup: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Impressora nao encontrada no servidor: Loja A5');
    expect(result.diagnostics.powerShell.stdout).toBe('before failure');
    expect(result.diagnostics.powerShell.stderr).toBe('missing printer');
    expect(result.diagnostics.powerShell.error).toBe('Impressora nao encontrada no servidor: Loja A5');
  });

  it('refuses direct server printing outside Windows', async () => {
    await expect(printer.printHtml({
      html: '<html>OS</html>',
      platform: 'linux',
    })).rejects.toThrow('Impressao direta disponivel apenas no Windows Server');
  });
});
