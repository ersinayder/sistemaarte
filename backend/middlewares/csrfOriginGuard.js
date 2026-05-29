'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(value) {
  if (!value) return '';
  try {
    return new URL(String(value)).origin;
  } catch {
    return '';
  }
}

function hasBearerToken(req) {
  return /^Bearer\s+\S+/i.test(String(req.get('authorization') || ''));
}

function csrfOriginGuard({ allowedOrigins = [], requireOrigin = process.env.NODE_ENV === 'production' } = {}) {
  const allowed = new Set(
    allowedOrigins
      .map(normalizeOrigin)
      .filter(Boolean)
  );

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = normalizeOrigin(req.get('origin'));
    const referer = normalizeOrigin(req.get('referer'));
    const candidate = origin || referer;

    if (!candidate) {
      if (!requireOrigin || hasBearerToken(req)) return next();
      return res.status(403).json({ error: 'Origem da requisicao nao autorizada.' });
    }

    if (allowed.has(candidate)) return next();

    return res.status(403).json({ error: 'Origem da requisicao nao autorizada.' });
  };
}

module.exports = { csrfOriginGuard };
