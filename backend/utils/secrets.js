'use strict';

const crypto = require('crypto');

const SECRET_PREFIX = 'enc:v1:';

function isEncryptedSecret(value) {
  return String(value || '').startsWith(SECRET_PREFIX);
}

function resolveRawKey(purpose = 'config') {
  if (purpose === 'nfe') {
    return process.env.NFE_SECRET_KEY || process.env.CONFIG_SECRET_KEY;
  }
  return process.env.CONFIG_SECRET_KEY || process.env.NFE_SECRET_KEY;
}

function deriveKey(rawKey, purpose = 'config') {
  if (!rawKey || String(rawKey).length < 16) {
    throw new Error('Chave de criptografia ausente. Defina NFE_SECRET_KEY ou CONFIG_SECRET_KEY.');
  }
  // Derivação com propósito segregado (SEC-07)
  return crypto.createHash('sha256').update(`${purpose}:${String(rawKey)}`).digest();
}

function deriveLegacyKey(rawKey) {
  if (!rawKey || String(rawKey).length < 16) return null;
  return crypto.createHash('sha256').update(String(rawKey)).digest();
}

function encryptSecret(value, purpose = 'config') {
  const text = String(value ?? '');
  if (!text || isEncryptedSecret(text)) return text;

  const rawKey = resolveRawKey(purpose);
  const key = deriveKey(rawKey, purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function encryptSecretIfPossible(value, purpose = 'config') {
  try {
    return encryptSecret(value, purpose);
  } catch {
    return String(value ?? '');
  }
}

function decryptSecret(value, purpose = 'config') {
  const stored = String(value ?? '');
  if (!stored || !isEncryptedSecret(stored)) return stored;

  const encoded = stored.slice(SECRET_PREFIX.length);
  const [ivRaw, tagRaw, encryptedRaw] = encoded.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Segredo criptografado em formato invalido.');
  }

  const tryDecrypt = (keyBuffer) => {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyBuffer,
      Buffer.from(ivRaw, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  };

  const rawKey = resolveRawKey(purpose);
  if (!rawKey || String(rawKey).length < 16) {
    throw new Error('Chave de criptografia ausente. Defina NFE_SECRET_KEY ou CONFIG_SECRET_KEY.');
  }

  // 1. Tenta descriptografar com a chave segregada pelo propósito
  try {
    const key = deriveKey(rawKey, purpose);
    return tryDecrypt(key);
  } catch (err) {
    // 2. Fallback de compatibilidade retroativa: tenta com a chave legada (sem prefixo de propósito)
    const legacyKey = deriveLegacyKey(rawKey);
    if (legacyKey) {
      try {
        return tryDecrypt(legacyKey);
      } catch {
        // Ignora erro de fallback e relança o erro original
      }
    }
    throw err;
  }
}

module.exports = {
  SECRET_PREFIX,
  decryptSecret,
  encryptSecret,
  encryptSecretIfPossible,
  isEncryptedSecret,
};
