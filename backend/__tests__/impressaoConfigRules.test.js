import { describe, expect, it } from 'vitest';

const rules = await import('../domain/impressaoConfigRules.js');
const {
  normalizarImpressaoConfig,
  validarImpressaoConfig,
  statusImpressaoConfig,
  montarDestinoImpressora,
  pickImpressaoConfig,
} = rules;

describe('impressaoConfigRules', () => {
  it('normalizes printer settings for A5 color printing', () => {
    const out = normalizarImpressaoConfig({
      printerName: '  Impressora Loja A5  ',
      printerIp: ' 192.168.0.45 ',
      paperSize: 'A4',
      color: false,
    });

    expect(out).toEqual({
      printerName: 'Impressora Loja A5',
      printerIp: '192.168.0.45',
      paperSize: 'A5',
      color: 1,
    });
  });

  it('rejects unsafe printer names before they reach PowerShell', () => {
    const result = validarImpressaoConfig(normalizarImpressaoConfig({
      printerName: "Loja'; Remove-Item C:\\*",
      printerIp: '192.168.0.45',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.printerName).toBe('Nome da impressora contem caracteres invalidos');
  });

  it('validates IPv4 printer addresses', () => {
    const result = validarImpressaoConfig(normalizarImpressaoConfig({
      printerName: 'Impressora Loja',
      printerIp: '999.168.0.45',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.printerIp).toBe('IP da impressora invalido');
  });

  it('allows saving only the IP while keeping the configuration pending', () => {
    const config = normalizarImpressaoConfig({
      printerName: '',
      printerIp: '192.168.0.45',
    });

    expect(validarImpressaoConfig(config).ok).toBe(true);
    expect(statusImpressaoConfig(config).status).toBe('Pendente');
  });

  it('builds a shared printer path from IP plus queue name', () => {
    expect(montarDestinoImpressora({
      printerName: 'Impressoraloja',
      printerIp: '192.168.0.45',
    })).toBe('\\\\192.168.0.45\\Impressoraloja');

    expect(montarDestinoImpressora({
      printerName: '\\\\ARTESERVER\\Impressoraloja',
      printerIp: '192.168.0.45',
    })).toBe('\\\\ARTESERVER\\Impressoraloja');
  });

  it('marks printing pending until a printer name is configured', () => {
    expect(statusImpressaoConfig({ printerName: '', printerIp: '192.168.0.45' })).toEqual({
      status: 'Pendente',
      missing: ['printerName'],
    });
    expect(statusImpressaoConfig({ printerName: 'Impressoraloja' })).toEqual({
      status: 'OK',
      missing: [],
    });
  });

  it('picks only public print configuration keys', () => {
    const picked = pickImpressaoConfig({
      printer_name: 'Impressoraloja',
      printer_ip: '192.168.0.45',
      paper_size: 'A5',
      color: 1,
      updatedat: '2026-06-05 12:00:00',
      secret: 'ignored',
    });

    expect(picked).toEqual({
      printerName: 'Impressoraloja',
      printerIp: '192.168.0.45',
      paperSize: 'A5',
      color: true,
      updatedat: '2026-06-05 12:00:00',
    });
  });
});
