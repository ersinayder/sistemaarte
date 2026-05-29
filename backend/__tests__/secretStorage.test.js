import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('secret storage helpers', () => {
  beforeEach(() => {
    process.env.CONFIG_SECRET_KEY = 'test-config-secret-key-with-enough-length';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.NFE_SECRET_KEY;
    delete process.env.CONFIG_SECRET_KEY;
  });

  it('encrypts certificate passwords before persistence and decrypts them for runtime use', async () => {
    const { decryptSecret, encryptSecret, isEncryptedSecret } = await import('../utils/secrets.js');

    const encrypted = encryptSecret('SENHA_TESTE_UNICA');

    expect(encrypted).not.toContain('SENHA_TESTE_UNICA');
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(decryptSecret(encrypted)).toBe('SENHA_TESTE_UNICA');
  });

  it('keeps legacy plaintext readable so existing installations can migrate safely', async () => {
    const { decryptSecret, isEncryptedSecret } = await import('../utils/secrets.js');

    expect(isEncryptedSecret('senha-legada')).toBe(false);
    expect(decryptSecret('senha-legada')).toBe('senha-legada');
  });

  it('does not encrypt certificate passwords with JWT_SECRET as a fallback key', async () => {
    delete process.env.CONFIG_SECRET_KEY;
    process.env.JWT_SECRET = 'rotatable-jwt-secret-with-enough-length';
    const { encryptSecret, encryptSecretIfPossible } = await import('../utils/secrets.js');

    expect(() => encryptSecret('SENHA_TESTE_UNICA')).toThrow(/CONFIG_SECRET_KEY|NFE_SECRET_KEY/);
    expect(encryptSecretIfPossible('SENHA_TESTE_UNICA')).toBe('SENHA_TESTE_UNICA');
  });
});
