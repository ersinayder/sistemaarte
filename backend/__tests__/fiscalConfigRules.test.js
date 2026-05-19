import { describe, it, expect } from 'vitest';

const rules = await import('../domain/fiscalConfigRules.js');
const {
  normalizarFiscalConfig,
  validarFiscalConfig,
  statusFiscalConfig,
  normalizarAutXml,
  validarAutXml,
  formatarAutXmlParaNFe,
} = rules;

describe('fiscalConfigRules', () => {
  it('normalizes and validates a good fiscal config', () => {
    const config = normalizarFiscalConfig({
      ambiente: '2',
      serie: ' 1 ',
      proximoNumero: '42',
    });

    expect(config).toEqual({ ambiente: 2, serie: '1', proximoNumero: 42 });
    expect(validarFiscalConfig(config)).toEqual({ ok: true, errors: {} });
    expect(statusFiscalConfig(config, { certificadoConfigurado: true })).toEqual({
      status: 'OK',
      missing: [],
    });
  });

  it('defaults ambiente and serie when omitted', () => {
    const config = normalizarFiscalConfig({});

    expect(config.ambiente).toBe(2);
    expect(config.serie).toBe('1');
    expect(config.proximoNumero).toBeUndefined();
  });

  it('returns fiscal status Pendente when required runtime fields are missing', () => {
    const status = statusFiscalConfig({ ambiente: 2, serie: '1' }, { certificadoConfigurado: false });

    expect(status.status).toBe('Pendente');
    expect(status.missing).toContain('proximoNumero');
    expect(status.missing).toContain('certificadoConfigurado');
  });

  it('rejects invalid ambiente, serie, and proximoNumero', () => {
    const result = validarFiscalConfig(normalizarFiscalConfig({
      ambiente: '3',
      serie: '12A',
      proximoNumero: '1000000000',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.ambiente).toBe('Ambiente deve ser 1 ou 2');
    expect(result.errors.serie).toBe('Serie deve conter de 1 a 3 digitos');
    expect(result.errors.proximoNumero).toBe('Proximo numero deve ser inteiro entre 1 e 999999999');
  });

  it('keeps non numeric values invalid after normalization', () => {
    const result = validarFiscalConfig(normalizarFiscalConfig({
      ambiente: 'homologacao',
      serie: '1234',
      proximoNumero: 'abc',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors.ambiente).toBe('Ambiente deve ser 1 ou 2');
    expect(result.errors.serie).toBe('Serie deve conter de 1 a 3 digitos');
    expect(result.errors.proximoNumero).toBe('Proximo numero deve ser inteiro entre 1 e 999999999');
  });

  it('normalizes autXML and accepts CPF/CNPJ documents', () => {
    const cpf = normalizarAutXml({
      nome: ' Contador CPF ',
      documento: '123.456.789-09',
    });
    const cnpj = normalizarAutXml({
      nome: ' Contador CNPJ ',
      documento: '07.500.718/0001-96',
      tipo: '',
      ativo: '0',
    });

    expect(cpf).toEqual({
      nome: 'Contador CPF',
      documento: '12345678909',
      tipo: 'contador',
      ativo: 1,
    });
    expect(cnpj).toEqual({
      nome: 'Contador CNPJ',
      documento: '07500718000196',
      tipo: 'contador',
      ativo: 0,
    });
    expect(validarAutXml(cpf)).toEqual({ ok: true, errors: {} });
    expect(validarAutXml({ ...cnpj, ativo: 1 })).toEqual({ ok: true, errors: {} });
  });

  it('formats active autXML records to CPF/CNPJ keys', () => {
    const formatted = formatarAutXmlParaNFe([
      normalizarAutXml({ nome: 'CPF', documento: '123.456.789-09' }),
      normalizarAutXml({ nome: 'CNPJ', documento: '07.500.718/0001-96' }),
    ]);

    expect(formatted).toEqual([
      { CPF: '12345678909' },
      { CNPJ: '07500718000196' },
    ]);
  });

  it('rejects invalid autXML document and emitente duplicate', () => {
    const invalid = validarAutXml(normalizarAutXml({
      nome: 'Documento ruim',
      documento: '123',
    }));
    const duplicate = validarAutXml(normalizarAutXml({
      nome: 'Emitente',
      documento: '07.500.718/0001-96',
    }), { emitenteDocumento: '07500718000196' });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.documento).toBe('Documento deve ser CPF com 11 digitos ou CNPJ com 14 digitos');
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errors.documento).toBe('AutXML nao pode ser igual ao documento do emitente');
  });

  it('enforces active autXML limit of 10', () => {
    const novoAtivo = normalizarAutXml({ nome: 'Novo contador', documento: '123.456.789-09' });
    const inactiveEdit = normalizarAutXml({ nome: 'Inativo', documento: '123.456.789-09', ativo: 0 });
    const currentActiveEdit = normalizarAutXml({ nome: 'Ja ativo', documento: '123.456.789-09' });

    expect(validarAutXml(novoAtivo, { ativosCount: 10 }).ok).toBe(false);
    expect(validarAutXml(inactiveEdit, { ativosCount: 10 }).ok).toBe(true);
    expect(validarAutXml(currentActiveEdit, { ativosCount: 10, currentAtivo: true }).ok).toBe(true);
    expect(validarAutXml(novoAtivo, { ativosCount: 10, ignoreLimit: true }).ok).toBe(true);
  });

  it('filters inactive, invalid, destinatario, and limits formatted autXML to 10', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      nome: `Contador ${index}`,
      documento: `07500718000${String(index).padStart(3, '0')}`,
      ativo: 1,
    }));

    const formatted = formatarAutXmlParaNFe([
      normalizarAutXml({ nome: 'Destinatario', documento: '123.456.789-09' }),
      normalizarAutXml({ nome: 'Inativo', documento: '111.222.333-44', ativo: 0 }),
      normalizarAutXml({ nome: 'Invalido', documento: '123' }),
      ...many,
    ], '12345678909');

    expect(formatted).toHaveLength(10);
    expect(formatted).not.toContainEqual({ CPF: '12345678909' });
    expect(formatted).not.toContainEqual({ CPF: '11122233344' });
    expect(formatted[0]).toEqual({ CNPJ: '07500718000000' });
  });
});
