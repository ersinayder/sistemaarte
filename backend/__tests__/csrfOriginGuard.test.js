import { describe, expect, it, vi } from 'vitest';

const { csrfOriginGuard } = await import('../middlewares/csrfOriginGuard.js');

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeReq({ method = 'POST', origin, referer, host = 'arteemolduras.com.br', authorization } = {}) {
  const headers = { host };
  if (origin) headers.origin = origin;
  if (referer) headers.referer = referer;
  if (authorization) headers.authorization = authorization;
  return {
    method,
    protocol: 'https',
    get(name) {
      return headers[String(name).toLowerCase()];
    },
  };
}

describe('csrfOriginGuard', () => {
  it('allows safe methods without origin checks', () => {
    const req = makeReq({ method: 'GET', origin: 'https://evil.example' });
    const res = makeRes();
    const next = vi.fn();

    csrfOriginGuard({ allowedOrigins: ['https://arteemolduras.com.br'] })(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows mutating requests from the configured origin', () => {
    const req = makeReq({ origin: 'https://arteemolduras.com.br' });
    const res = makeRes();
    const next = vi.fn();

    csrfOriginGuard({ allowedOrigins: ['https://arteemolduras.com.br'] })(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects mutating production cookie requests without origin headers', () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    csrfOriginGuard({ allowedOrigins: ['https://arteemolduras.com.br'], requireOrigin: true })(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows mutating requests without browser origin headers for bearer API clients', () => {
    const req = makeReq({ authorization: 'Bearer token-api' });
    const res = makeRes();
    const next = vi.fn();

    csrfOriginGuard({ allowedOrigins: ['https://arteemolduras.com.br'], requireOrigin: true })(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects mutating requests from foreign origins', () => {
    const req = makeReq({ origin: 'https://evil.example' });
    const res = makeRes();
    const next = vi.fn();

    csrfOriginGuard({ allowedOrigins: ['https://arteemolduras.com.br'] })(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Origem da requisicao nao autorizada.' });
  });

  it('rejects mutating requests with a foreign referer when origin is absent', () => {
    const req = makeReq({ referer: 'https://evil.example/form.html' });
    const res = makeRes();
    const next = vi.fn();

    csrfOriginGuard({ allowedOrigins: ['https://arteemolduras.com.br'] })(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
