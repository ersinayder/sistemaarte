import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * auth.js usa require() (CJS) e lê JWT_SECRET no momento do require.
 * Estrategia: criamos um stub do middleware diretamente, testando o comportamento
 * via caixa-preta (request/response mock), sem mockar o modulo jwt.
 * Os testes de integracao do token usam jwt real com secret controlado.
 */
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-fase2';
process.env.JWT_SECRET = TEST_SECRET;

const dbMock = {
  getOne: vi.fn((_sql, params) => ({
    id: params?.[0] || 1,
    role: 'admin',
    active: 1,
  })),
};
vi.mock('../database', () => dbMock);
vi.mock('../database.js', () => dbMock);

// Importa DEPOIS de setar o env
const { auth, setSessionUserLookupForTests } = await import('../middlewares/auth.js');

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeToken(payload) {
  return jwt.sign(payload, TEST_SECRET);
}

describe('auth middleware', () => {
  let next;

  beforeEach(() => {
    next = vi.fn();
    setSessionUserLookupForTests((payload) => ({
      id: payload.id,
      role: payload.role,
      active: 1,
    }));
  });

  describe('extracao de token', () => {
    it('le token do cookie HttpOnly', () => {
      const token = makeToken({ id: 1, role: 'admin' });
      const req = { cookies: { token }, headers: {} };
      auth()(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.user.id).toBe(1);
    });

    it('le token do header Authorization Bearer', () => {
      const token = makeToken({ id: 2, role: 'user' });
      const req = { cookies: {}, headers: { authorization: `Bearer ${token}` } };
      auth()(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('le token do header Authorization sem Bearer', () => {
      const token = makeToken({ id: 3, role: 'user' });
      const req = { cookies: {}, headers: { authorization: token } };
      auth()(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('retorna 401 quando nenhum token presente', () => {
      const req = { cookies: {}, headers: {} };
      const res = makeRes();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('cookie tem prioridade sobre header Authorization', () => {
      const cookieToken = makeToken({ id: 10, role: 'admin' });
      const headerToken = makeToken({ id: 99, role: 'user' });
      const req = { cookies: { token: cookieToken }, headers: { authorization: `Bearer ${headerToken}` } };
      auth()(req, makeRes(), next);
      expect(req.user.id).toBe(10);
    });
  });

  describe('verificacao do token', () => {
    it('retorna 401 para token invalido', () => {
      const req = { cookies: { token: 'token-invalido' }, headers: {} };
      const res = makeRes();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('seta req.user com payload do token valido', () => {
      const payload = { id: 5, role: 'admin', nome: 'Teste' };
      const token = makeToken(payload);
      const req = { cookies: { token }, headers: {} };
      auth()(req, makeRes(), next);
      expect(req.user.id).toBe(5);
      expect(req.user.role).toBe('admin');
    });
  });

  describe('autorizacao por roles', () => {
    it('permite acesso quando role esta na lista', () => {
      const token = makeToken({ id: 1, role: 'admin' });
      const req = { cookies: { token }, headers: {} };
      auth(['admin', 'user'])(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('retorna 403 quando role nao esta na lista', () => {
      const token = makeToken({ id: 1, role: 'user' });
      const req = { cookies: { token }, headers: {} };
      const res = makeRes();
      auth(['admin'])(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('permite qualquer role autenticado quando roles vazio', () => {
      const token = makeToken({ id: 1, role: 'qualquer' });
      const req = { cookies: { token }, headers: {} };
      auth([])(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });
  });
});
