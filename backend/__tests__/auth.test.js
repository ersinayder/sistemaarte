import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

/**
 * auth.js usa require() (CJS) e lê JWT_SECRET no momento do require.
 * Estrategia: criamos um stub do middleware diretamente, testando o comportamento
 * via caixa-preta (request/response mock), sem mockar o modulo jwt.
 * Os testes de integracao do token usam jwt real com secret controlado.
 */
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-fase2';
process.env.JWT_SECRET = TEST_SECRET;
const require = createRequire(import.meta.url);

const dbMock = {
  getOne: vi.fn((_sql, params) => ({
    id: params?.[0] || 1,
    role: 'admin',
    active: 1,
  })),
};
vi.mock('../database', () => dbMock);
vi.mock('../database.js', () => dbMock);
const databasePath = require.resolve('../database.js');
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: dbMock,
};

// Importa DEPOIS de setar o env
const {
  auth,
  setSessionUserLookupForTests,
  resetSessionUserLookupForTests,
  normalizarUsuarioSessao,
} = await import('../middlewares/auth.js');

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeReq({ cookies = {}, headers = {} } = {}) {
  return { cookies, headers };
}

function makeToken(payload) {
  return jwt.sign(payload, TEST_SECRET);
}

describe('auth middleware', () => {
  let next;

  beforeEach(() => {
    next = vi.fn();
    dbMock.getOne.mockClear();
    setSessionUserLookupForTests((payload) => ({
      id: payload.id,
      name: 'Usuario Teste',
      username: 'teste',
      role: payload.role || 'admin',
      profile_key: payload.role || 'admin',
      active: 1,
      deletedat: null,
      access_version: payload.accessVersion || 1,
      profile_active: 1,
      permissions: [],
    }));
  });

  describe('extracao de token', () => {
    it('le token do cookie HttpOnly', () => {
      const token = makeToken({ id: 1, role: 'admin' });
      const req = makeReq({ cookies: { token } });
      auth()(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.user.id).toBe(1);
    });

    it('le token do header Authorization Bearer', () => {
      const token = makeToken({ id: 2, role: 'user' });
      const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
      auth()(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('le token do header Authorization sem Bearer', () => {
      const token = makeToken({ id: 3, role: 'user' });
      const req = makeReq({ headers: { authorization: token } });
      auth()(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('retorna 401 quando nenhum token presente', () => {
      const req = makeReq();
      const res = makeRes();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('cookie tem prioridade sobre header Authorization', () => {
      const cookieToken = makeToken({ id: 10, role: 'admin' });
      const headerToken = makeToken({ id: 99, role: 'user' });
      const req = makeReq({
        cookies: { token: cookieToken },
        headers: { authorization: `Bearer ${headerToken}` },
      });
      auth()(req, makeRes(), next);
      expect(req.user.id).toBe(10);
    });
  });

  describe('verificacao do token', () => {
    it('retorna 401 para token invalido', () => {
      const req = makeReq({ cookies: { token: 'token-invalido' } });
      const res = makeRes();
      auth()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro operacional do lookup para o error handler', () => {
      const token = makeToken({ id: 12, role: 'admin' });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      const error = new Error('db offline');
      setSessionUserLookupForTests(() => { throw error; });

      auth()(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('seta req.user com dados atuais do banco', () => {
      const payload = { id: 5, role: 'admin', nome: 'Teste' };
      const token = makeToken(payload);
      const req = makeReq({ cookies: { token } });
      auth()(req, makeRes(), next);
      expect(req.user).toMatchObject({
        id: 5,
        name: 'Usuario Teste',
        username: 'teste',
        role: 'admin',
      });
      expect(req.user.nome).toBeUndefined();
    });

    it('seta req.user com dados atuais do banco e permissoes efetivas', () => {
      const token = makeToken({ id: 5, role: 'admin' });
      const req = makeReq({ cookies: { token } });
      setSessionUserLookupForTests(() => ({
        id: 5,
        name: 'Operador',
        username: 'caixa',
        role: 'admin',
        profile_key: 'admin',
        active: 1,
        deletedat: null,
        access_version: 1,
        profile_active: 1,
        permissions: ['usuarios.ver', 'usuarios.editar'],
      }));

      auth(['admin'])(req, makeRes(), next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.user).toMatchObject({
        id: 5,
        name: 'Operador',
        username: 'caixa',
        role: 'admin',
        profile_key: 'admin',
        permissions: ['usuarios.ver', 'usuarios.editar'],
      });
    });
  });

  describe('autorizacao por roles', () => {
    it('permite acesso quando role esta na lista', () => {
      const token = makeToken({ id: 1, role: 'admin' });
      const req = makeReq({ cookies: { token } });
      auth(['admin', 'user'])(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('retorna 403 quando role nao esta na lista', () => {
      const token = makeToken({ id: 1, role: 'user' });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      auth(['admin'])(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('retorna 403 usando a role atual do banco quando token antigo nao tem role', () => {
      const token = makeToken({ id: 6 });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      setSessionUserLookupForTests(() => ({
        id: 6,
        name: 'Caixa',
        username: 'caixa',
        role: 'caixa',
        profile_key: 'caixa',
        active: 1,
        deletedat: null,
        access_version: 1,
        profile_active: 1,
        permissions: [],
      }));

      auth(['admin'])(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('permite qualquer role autenticado quando roles vazio', () => {
      const token = makeToken({ id: 1, role: 'qualquer' });
      const req = makeReq({ cookies: { token } });
      auth([])(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('estado atual da sessao', () => {
    it('rejeita usuario arquivado pelo estado atual do banco', () => {
      const token = makeToken({ id: 7, accessVersion: 1 });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      setSessionUserLookupForTests(() => ({
        id: 7,
        role: 'admin',
        active: 1,
        deletedat: '2026-07-09 10:00:00',
        access_version: 1,
        profile_active: 1,
        permissions: [],
      }));

      auth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Usuario arquivado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejeita perfil inativo pelo estado atual do banco', () => {
      const token = makeToken({ id: 8, accessVersion: 1 });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      setSessionUserLookupForTests(() => ({
        id: 8,
        role: 'admin',
        active: 1,
        deletedat: null,
        access_version: 1,
        profile_active: 0,
        permissions: [],
      }));

      auth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Perfil inativo' });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejeita accessVersion desatualizado', () => {
      const token = makeToken({ id: 9, accessVersion: 1 });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      setSessionUserLookupForTests(() => ({
        id: 9,
        role: 'admin',
        active: 1,
        deletedat: null,
        access_version: 2,
        profile_active: 1,
        permissions: [],
      }));

      auth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Sessao desatualizada. Entre novamente.' });
      expect(next).not.toHaveBeenCalled();
    });

    it('mantem compatibilidade com token antigo sem accessVersion', () => {
      const token = makeToken({ id: 10, role: 'admin' });
      const req = makeReq({ cookies: { token } });
      setSessionUserLookupForTests(() => ({
        id: 10,
        role: 'admin',
        active: 1,
        deletedat: null,
        access_version: 2,
        profile_active: 1,
        permissions: [],
      }));

      auth(['admin'])(req, makeRes(), next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('rejeita token antigo quando role do token diverge da role atual', () => {
      const token = makeToken({ id: 11, role: 'admin' });
      const req = makeReq({ cookies: { token } });
      const res = makeRes();
      setSessionUserLookupForTests(() => ({
        id: 11,
        role: 'caixa',
        active: 1,
        deletedat: null,
        access_version: 1,
        profile_active: 1,
        permissions: [],
      }));

      auth()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Sessao desatualizada. Entre novamente.' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('lookup padrao', () => {
    it('usa SELECT enriquecido e normaliza retorno sem expor password', () => {
      resetSessionUserLookupForTests();
      dbMock.getOne.mockReturnValueOnce({
        id: 13,
        name: 'Admin',
        username: 'admin',
        password: 'hash-nao-deve-sair',
        role: 'admin',
        profile_key: 'admin',
        active: 1,
        deletedat: null,
        access_version: 1,
        profile_name: 'Administrador',
        profile_active: 1,
        permissions_csv: 'usuarios.ver,usuarios.editar',
      });
      const token = makeToken({ id: 13, role: 'admin' });
      const req = makeReq({ cookies: { token } });

      auth(['admin'])(req, makeRes(), next);

      expect(next).toHaveBeenCalledOnce();
      const [sql, params] = dbMock.getOne.mock.calls[0];
      expect(sql).toContain('COALESCE(u.profile_key, u.role) AS profile_key');
      expect(sql).toContain('GROUP_CONCAT(pp.permission) AS permissions_csv');
      expect(sql).toContain('LEFT JOIN permission_profiles p');
      expect(params).toEqual([13]);
      expect(req.user).toMatchObject({
        id: 13,
        role: 'admin',
        profile_key: 'admin',
        permissions: ['usuarios.ver', 'usuarios.editar'],
      });
      expect(req.user).not.toHaveProperty('password');
    });
  });

  describe('normalizarUsuarioSessao', () => {
    it('normaliza permissions_csv em array publico', () => {
      expect(normalizarUsuarioSessao({
        id: 1,
        role: 'admin',
        profile_key: 'admin',
        active: 1,
        profile_name: 'Administrador',
        profile_active: 1,
        permissions_csv: 'usuarios.ver, usuarios.editar,,',
      })).toMatchObject({
        permissions: ['usuarios.ver', 'usuarios.editar'],
        profile: { key: 'admin', name: 'Administrador', active: 1 },
      });
    });

    it('usa defaults seguros quando perfil nao tem linha associada', () => {
      expect(normalizarUsuarioSessao({
        id: 2,
        role: 'caixa',
        active: 1,
        permissions_csv: '',
      })).toMatchObject({
        profile_key: 'caixa',
        profile: { key: 'caixa', name: 'caixa', active: 1 },
        profile_active: 1,
        permissions: [],
      });
    });
  });
});
