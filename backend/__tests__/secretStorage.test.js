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

  describe('SEC-07: cryptographic purpose segregation and backward compatibility', () => {
    it('encrypts and decrypts with nfe purpose correctly', async () => {
      const { decryptSecret, encryptSecret } = await import('../utils/secrets.js');
      const encrypted = encryptSecret('senha_nfe_123', 'nfe');
      expect(decryptSecret(encrypted, 'nfe')).toBe('senha_nfe_123');
    });

    it('produces different ciphertexts and keys for different purposes', async () => {
      const { decryptSecret, encryptSecret } = await import('../utils/secrets.js');
      const encryptedConfig = encryptSecret('segredo_compartilhado', 'config');
      const encryptedNfe = encryptSecret('segredo_compartilhado', 'nfe');

      expect(encryptedConfig).not.toBe(encryptedNfe);
      expect(decryptSecret(encryptedConfig, 'config')).toBe('segredo_compartilhado');
      expect(decryptSecret(encryptedNfe, 'nfe')).toBe('segredo_compartilhado');
    });

    it('decrypts legacy ciphertext encrypted without purpose prefix via fallback', async () => {
      const crypto = await import('crypto');
      const { decryptSecret, SECRET_PREFIX } = await import('../utils/secrets.js');

      // Create a ciphertext encrypted using the legacy single-hash key
      const legacyKey = crypto.createHash('sha256').update(process.env.CONFIG_SECRET_KEY).digest();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
      const enc = Buffer.concat([cipher.update('legado_sem_proposito', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const legacyCiphertext = `${SECRET_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;

      // decryptSecret with 'config' or 'nfe' should fallback and still decrypt legacy data
      expect(decryptSecret(legacyCiphertext, 'config')).toBe('legado_sem_proposito');
      expect(decryptSecret(legacyCiphertext, 'nfe')).toBe('legado_sem_proposito');
    });
  });
});
