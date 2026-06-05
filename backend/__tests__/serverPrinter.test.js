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
    expect(printer.resolvePrinterName({})).toBe('\\\\ARTESERVER\\Impressoraloja');
  });

  it('builds a Windows PrintTo script that sends one job per requested copy', () => {
    const script = printer.buildPrintScript({
      htmlPath: 'C:\\Temp\\ordem.html',
      printerName: '\\\\ARTESERVER\\Impressoraloja',
      copies: 2,
    });

    expect(script).toContain("$htmlPath = 'C:\\Temp\\ordem.html'");
    expect(script).toContain("$printerName = '\\\\ARTESERVER\\Impressoraloja'");
    expect(script).toContain('$i -lt 2');
    expect(script).toContain('-Verb PrintTo');
    expect(script).toContain('-ArgumentList $printerName');
  });

  it('prints by writing a temporary HTML file and invoking PowerShell', async () => {
    const writeTempHtml = vi.fn(() => 'C:\\Temp\\ordem.html');
    const runPowerShell = vi.fn(() => Promise.resolve({ stdout: '', stderr: '' }));

    const result = await printer.printHtml({
      html: '<html>OS</html>',
      jobName: 'ordem-OS-0042',
      copies: 2,
      env: { ORDEM_PRINTER_NAME: 'Canon Loja' },
      platform: 'win32',
      writeTempHtml,
      runPowerShell,
      scheduleCleanup: vi.fn(),
    });

    expect(writeTempHtml).toHaveBeenCalledWith('<html>OS</html>', 'ordem-OS-0042');
    expect(runPowerShell).toHaveBeenCalledWith(expect.stringContaining("$printerName = 'Canon Loja'"));
    expect(result).toEqual({ ok: true, printerName: 'Canon Loja', copies: 2 });
  });

  it('refuses direct server printing outside Windows', async () => {
    await expect(printer.printHtml({
      html: '<html>OS</html>',
      platform: 'linux',
    })).rejects.toThrow('Impressao direta disponivel apenas no Windows Server');
  });
});
