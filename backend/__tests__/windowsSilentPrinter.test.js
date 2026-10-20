import { describe, expect, it } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printerModule = await import('../../services/print-agent/windowsSilentPrinter.js');

describe('windowsSilentPrinter', () => {
  it('detects an installed browser path on Windows', () => {
    if (process.platform === 'win32') {
      const browser = printerModule.getBrowserPath();
      expect(browser).toBeTruthy();
      expect(browser).toMatch(/(msedge|chrome)\.exe$/i);
    }
  });

  it('detects SumatraPDF.exe in the agent directory', () => {
    const agentDir = path.resolve(__dirname, '../../services/print-agent');
    const sumatra = printerModule.getSumatraPath(agentDir);
    expect(sumatra).toBeTruthy();
    expect(sumatra).toMatch(/SumatraPDF\.exe$/i);
  });

  it('normalizes job name safely', () => {
    expect(printerModule.safeJobName('OS #1234 (teste/cópia)')).toBe('OS-1234-teste-copia');
    expect(printerModule.safeJobName('')).toBe('documento');
  });
});
