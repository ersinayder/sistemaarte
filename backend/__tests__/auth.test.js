import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Define secret antes de importar o middleware
process.env.JWT_SECRET = 'test-secret-fase2';

// Mock do jsonwebtoken
vi.mock('jsonwebtoken');

// Importa após setar o env
const { auth } = await import('../middlewares/auth.js');

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('auth middleware', () => {
  let next;

  beforeEach(() => {
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('extração de token', () => {
    it('lê token do cookie HttpOnly', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'admin' });
      const req = { cookies: { token: 'abc' }, headers: {} };
      auth()(req, makeRes(), next);
      expect(jwt.verify).toHaveBeenCalledWith('abc', 'test-secret-fase2');
      expect(next).toHaveBeenCalledOnce();
    });

    it('lê token do header Authorization Bearer', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'admin' });
      const req = { cookies: {}, headers: { authorization: 'Bearer tok123' } };
      auth()(req, makeRes(), next);
      expect(jwt.verify).toHaveBeenCalledWith('tok123', 'test-secret-fase2');
      expect(next).toHaveBeenCalledOnce();
    });

    it('lê token do header Authorization sem Bearer', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'admin' });
      const req = { cookies: {}, headers: { authorization: 'tok456' } };
      auth()(req, makeRes(), next);
      expect(jwt.verify).toHaveBeenCalledWith('tok456', 'test-secret-fase2');
      expect(next).toHaveBeenCalledOnce();
    });

    it('retorna 401 quando nenhum token presente', () => {
      const req = { cookies: {}, headers: {} };
      const res = makeRes();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token necessário' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('verificação do token', () => {
    it('retorna 401 para token inválido', () => {
      jwt.verify.mockImplementation(() => { throw new Error('invalid'); });
      const req = { cookies: { token: 'bad' }, headers: {} };
      const res = makeRes();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido ou expirado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('seta req.user com payload do token válido', () => {
      const payload = { id: 5, role: 'admin', nome: 'Teste' };
      jwt.verify.mockReturnValue(payload);
      const req = { cookies: { token: 'valid' }, headers: {} };
      auth()(req, makeRes(), next);
      expect(req.user).toEqual(payload);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('autorização por roles', () => {
    it('permite acesso quando role está na lista', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'admin' });
      const req = { cookies: { token: 't' }, headers: {} };
      auth(['admin', 'user'])(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('retorna 403 quando role não está na lista', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'user' });
      const req = { cookies: { token: 't' }, headers: {} };
      const res = makeRes();
      auth(['admin'])(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Sem permissão' });
      expect(next).not.toHaveBeenCalled();
    });

    it('permite qualquer role autenticado quando roles vazio', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'qualquer' });
      const req = { cookies: { token: 't' }, headers: {} };
      auth([])(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('cookie tem prioridade sobre header Authorization', () => {
      jwt.verify.mockReturnValue({ id: 1, role: 'admin' });
      const req = { cookies: { token: 'cookie-tok' }, headers: { authorization: 'Bearer header-tok' } };
      auth()(req, makeRes(), next);
      expect(jwt.verify).toHaveBeenCalledWith('cookie-tok', 'test-secret-fase2');
    });
  });
});
