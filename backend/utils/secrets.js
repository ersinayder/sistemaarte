'use strict';

const crypto = require('crypto');

const SECRET_PREFIX = 'enc:v1:';

function isEncryptedSecret(value) {
  return String(value || '').startsWith(SECRET_PREFIX);
}

function encryptionKey() {
  const raw = process.env.NFE_SECRET_KEY || process.env.CONFIG_SECRET_KEY;
  if (!raw || String(raw).length < 16) {
    throw new Error('Chave de criptografia ausente. Defina NFE_SECRET_KEY ou CONFIG_SECRET_KEY.');
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encryptSecret(value) {
  const text = String(value ?? '');
  if (!text || isEncryptedSecret(text)) return text;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SECRET_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function encryptSecretIfPossible(value) {
  try {
    return encryptSecret(value);
  } catch {
    return String(value ?? '');
  }
}

function decryptSecret(value) {
  const stored = String(value ?? '');
  if (!stored || !isEncryptedSecret(stored)) return stored;

  const encoded = stored.slice(SECRET_PREFIX.length);
  const [ivRaw, tagRaw, encryptedRaw] = encoded.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Segredo criptografado em formato invalido.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivRaw, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = {
  SECRET_PREFIX,
  decryptSecret,
  encryptSecret,
  encryptSecretIfPossible,
  isEncryptedSecret,
};
