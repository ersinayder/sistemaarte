import { describe, expect, it } from 'vitest';

const rules = await import('../domain/whatsappConfigRules.js');
const utils = await import('../utils/whatsappConfig.js');

const {
  normalizarWhatsappConfig,
  validarWhatsappConfig,
  sanitizarWhatsappConfig,
  statusWhatsappConfig,
} = rules;

const { resolverWhatsappRuntime } = utils;

describe('whatsappConfigRules', () => {
  it('normalizes provider, ids, templates, and token', () => {
    const out = normalizarWhatsappConfig({
      enabled: true,
      provider: ' Meta ',
      phoneId: ' 123456 ',
      token: '  secret-token  ',
      templatePronto: ' OS_PRONTA ',
      templateConfirmacao: ' CONFIRMACAO_PEDIDO ',
    });

    expect(out.enabled).toBe(1);
    expect(out.provider).toBe('meta');
    expect(out.phoneId).toBe('123456');
    expect(out.token).toBe('secret-token');
    expect(out.templatePronto).toBe('os_pronta');
    expect(out.templateConfirmacao).toBe('confirmacao_pedido');
  });

  it('requires phone id and token when enabled', () => {
    const result = validarWhatsappConfig(normalizarWhatsappConfig({
      enabled: true,
      provider: 'meta',
      phoneId: '',
      token: '',
    }), { tokenConfigurado: false });

    expect(result.ok).toBe(false);
    expect(result.errors.phoneId).toBe('Phone Number ID e obrigatorio');
    expect(result.errors.token).toBe('Token e obrigatorio');
  });

  it('accepts blank token when an existing token is already configured', () => {
    const result = validarWhatsappConfig(normalizarWhatsappConfig({
      enabled: true,
      provider: 'meta',
      phoneId: '123456',
      token: '',
    }), { tokenConfigurado: true });

    expect(result.ok).toBe(true);
  });

  it('sanitizes config without leaking token', () => {
    const sanitized = sanitizarWhatsappConfig({
      enabled: 1,
      provider: 'meta',
      phone_id: '123456',
      token: 'secret-token',
      template_pronto: 'os_pronta',
      template_confirmacao: 'confirmacao_pedido',
      configurado: 1,
      updatedat: '2026-05-18 10:00:00',
    });

    expect(sanitized.token).toBeUndefined();
    expect(sanitized.tokenConfigurado).toBe(true);
    expect(sanitized.phoneId).toBe('123456');
    expect(sanitized.updatedat).toBe('2026-05-18 10:00:00');
  });

  it('reports status for enabled, disabled, and incomplete configs', () => {
    expect(statusWhatsappConfig({ enabled: 0 }).status).toBe('Inativo');
    expect(statusWhatsappConfig({ enabled: 1, phoneId: '123', tokenConfigurado: true }).status).toBe('OK');

    const missing = statusWhatsappConfig({ enabled: 1, phoneId: '', tokenConfigurado: false });
    expect(missing.status).toBe('Pendente');
    expect(missing.missing).toEqual(['phoneId', 'token']);
  });

  it('uses env fallback until DB config is explicitly saved', () => {
    const runtime = resolverWhatsappRuntime({
      row: { enabled: 0, provider: 'meta', phone_id: '', token: '', configurado: 0 },
      env: {
        WHATSAPP_ENABLED: 'true',
        WHATSAPP_TOKEN: 'env-token',
        WHATSAPP_PHONE_ID: 'env-phone',
      },
    });

    expect(runtime.enabled).toBe(true);
    expect(runtime.token).toBe('env-token');
    expect(runtime.phoneId).toBe('env-phone');
    expect(runtime.origem).toBe('env');
  });

  it('uses DB config after it is explicitly saved', () => {
    const runtime = resolverWhatsappRuntime({
      row: {
        enabled: 1,
        provider: 'meta',
        phone_id: 'db-phone',
        token: 'db-token',
        template_pronto: 'os_pronta_db',
        template_confirmacao: 'confirmacao_db',
        configurado: 1,
      },
      env: {
        WHATSAPP_ENABLED: 'false',
        WHATSAPP_TOKEN: 'env-token',
        WHATSAPP_PHONE_ID: 'env-phone',
      },
    });

    expect(runtime.enabled).toBe(true);
    expect(runtime.token).toBe('db-token');
    expect(runtime.phoneId).toBe('db-phone');
    expect(runtime.templatePronto).toBe('os_pronta_db');
    expect(runtime.templateConfirmacao).toBe('confirmacao_db');
    expect(runtime.origem).toBe('banco');
  });
});
