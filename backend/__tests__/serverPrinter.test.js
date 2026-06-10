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
    expect(script).toContain('copies = $copies');
    expect(script).toContain('scaling = 92');
    expect(script).toContain('sistema-arte-print-browser-profile');
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

  it('refuses direct server printing outside Windows', async () => {
    await expect(printer.printHtml({
      html: '<html>OS</html>',
      platform: 'linux',
    })).rejects.toThrow('Impressao direta disponivel apenas no Windows Server');
  });
});
