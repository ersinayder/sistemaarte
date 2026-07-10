import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";

process.env.JWT_SECRET = "test-users-routes";

const db = {
  getAll: vi.fn(() => []),
  getOne: vi.fn(() => null),
  run: vi.fn(() => ({ changes: 1 })),
  runInsert: vi.fn(() => 123),
  transaction: vi.fn((fn) => fn()),
};

const require = createRequire(import.meta.url);
const databasePath = require.resolve("../database.js");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: db,
};

const usersModule = await import("../routes/users.js");
const usersRouter = usersModule.default || usersModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = usersRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

function routeRequest(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: 99, role: "admin", permissions: ["usuarios.ver"] },
    ...overrides,
  };
}

function mockUser(overrides = {}) {
  return {
    id: 7,
    name: "Caixa Loja",
    username: "caixa",
    role: "caixa",
    profile_key: "caixa",
    profile_name: "Caixa",
    active: 1,
    deletedat: null,
    deletedpor: null,
    deletedreason: null,
    createdat: "2026-07-10 09:00:00",
    updatedat: "2026-07-10 10:00:00",
    access_version: 3,
    permissions_csv: "ordens.ver, usuarios.ver, ,usuarios.editar",
    password: "hash-que-nao-deve-vazar",
    ...overrides,
  };
}

describe("users routes", () => {
  beforeEach(() => {
    for (const fn of Object.values(db)) fn.mockReset();
    db.getAll.mockReturnValue([]);
    db.getOne.mockReturnValue(null);
    db.run.mockReturnValue({ changes: 1 });
    db.runInsert.mockReturnValue(123);
    db.transaction.mockImplementation((fn) => fn());
  });

  it("lists public users with permissions and status, role, and query filters", async () => {
    db.getAll.mockReturnValueOnce([
      mockUser({
        id: 1,
        name: "Administrador",
        username: "admin",
        role: "admin",
        profile_key: "admin",
        profile_name: "Administrador",
        permissions_csv: "usuarios.ver,usuarios.criar",
      }),
    ]);

    const res = makeRes();
    await businessHandler("get", "/")(routeRequest({
      query: { status: "all", role: "admin", q: "adm" },
    }), res, vi.fn());

    const [sql, params] = db.getAll.mock.calls[0];
    expect(sql).not.toMatch(/password/i);
    expect(sql).toContain("COALESCE(u.profile_key, u.role) AS profile_key");
    expect(sql).toContain("GROUP_CONCAT(pp.permission) AS permissions_csv");
    expect(sql).toContain("u.role=?");
    expect(sql).toContain("(u.name LIKE ? OR u.username LIKE ?)");
    expect(sql).not.toContain("u.active=1 AND u.deletedat IS NULL");
    expect(params).toEqual(["admin", "%adm%", "%adm%"]);

    expect(res.json).toHaveBeenCalledWith({
      users: [
        expect.objectContaining({
          id: 1,
          username: "admin",
          role: "admin",
          profile_key: "admin",
          profile_name: "Administrador",
          permissions: ["usuarios.ver", "usuarios.criar"],
        }),
      ],
      meta: {
        total: 1,
        filters: { status: "all", role: "admin", q: "adm" },
      },
    });
    expect(res.json.mock.calls[0][0].users[0]).not.toHaveProperty("password");
    expect(res.json.mock.calls[0][0].users[0]).not.toHaveProperty("permissions_csv");
  });

  it("uses active user filtering by default", async () => {
    await businessHandler("get", "/")(routeRequest(), makeRes(), vi.fn());

    expect(db.getAll.mock.calls[0][0]).toContain("u.active=1 AND u.deletedat IS NULL");
    expect(db.getAll.mock.calls[0][1]).toEqual([]);
  });

  it("falls back to active status when an unknown status filter is received", async () => {
    const res = makeRes();

    await businessHandler("get", "/")(routeRequest({
      query: { status: "estranho" },
    }), res, vi.fn());

    expect(db.getAll.mock.calls[0][0]).toContain("u.active=1 AND u.deletedat IS NULL");
    expect(res.json.mock.calls[0][0].meta.filters.status).toBe("active");
  });

  it("creates a user with profile_key matching role and a hashed password", async () => {
    const res = makeRes();

    await businessHandler("post", "/")(routeRequest({
      body: {
        name: "Nova Caixa",
        username: "nova.caixa",
        password: "senhaSegura123",
        role: "caixa",
      },
    }), res, vi.fn());

    const [sql, params] = db.runInsert.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO users\s+\(name,username,password,role,profile_key\)/);
    expect(params[0]).toBe("Nova Caixa");
    expect(params[1]).toBe("nova.caixa");
    expect(params[3]).toBe("caixa");
    expect(params[4]).toBe("caixa");
    expect(params[2]).not.toBe("senhaSegura123");
    expect(bcrypt.compareSync("senhaSegura123", params[2])).toBe(true);
    expect(res.json).toHaveBeenCalledWith({
      id: 123,
      name: "Nova Caixa",
      username: "nova.caixa",
      role: "caixa",
      profile_key: "caixa",
    });
  });

  it("updates role, active, username, and password while incrementing access_version", async () => {
    db.getOne
      .mockReturnValueOnce(mockUser({ id: 8, role: "caixa", username: "old.caixa", active: 1 }))
      .mockReturnValueOnce({ total: 2 });

    const res = makeRes();
    await businessHandler("put", "/:id")(routeRequest({
      params: { id: "8" },
      body: {
        name: "Caixa Atualizada",
        username: "nova.caixa",
        role: "oficina",
        active: 0,
        password: "outraSenha123",
      },
    }), res, vi.fn());

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain("profile_key=?");
    expect(sql).toContain("access_version=access_version+1");
    expect(sql).toContain("updatedat=datetime('now','localtime')");
    expect(params[0]).toBe("Caixa Atualizada");
    expect(params[1]).toBe("nova.caixa");
    expect(params[2]).toBe("oficina");
    expect(params[3]).toBe("oficina");
    expect(params[4]).toBe(0);
    expect(bcrypt.compareSync("outraSenha123", params[5])).toBe(true);
    expect(params[6]).toBe("8");
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("blocks changing or deactivating the last active admin", async () => {
    db.getOne
      .mockReturnValueOnce(mockUser({ id: 1, role: "admin", active: 1, deletedat: null }))
      .mockReturnValueOnce({ total: 1 });

    const res = makeRes();
    await businessHandler("put", "/:id")(routeRequest({
      params: { id: "1" },
      user: { id: 99, role: "admin" },
      body: { name: "Admin", username: "admin", role: "caixa", active: 1 },
    }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Nao e possivel remover o ultimo administrador ativo" });
    expect(db.run).not.toHaveBeenCalled();
  });

  it("archives a user with audit fields and increments access_version", async () => {
    db.getOne
      .mockReturnValueOnce(mockUser({ id: 8, role: "caixa", active: 1 }))
      .mockReturnValueOnce({ total: 2 });

    const res = makeRes();
    await businessHandler("post", "/:id/archive")(routeRequest({
      params: { id: "8" },
      body: { reason: "Saiu da loja" },
      user: { id: 42, role: "admin" },
    }), res, vi.fn());

    expect(db.run).toHaveBeenCalledWith(
      "UPDATE users SET active=0, deletedat=datetime('now','localtime'), deletedpor=?, deletedreason=?, updatedat=datetime('now','localtime'), access_version=access_version+1 WHERE id=?",
      [42, "Saiu da loja", "8"],
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("restores a user by clearing archive fields and incrementing access_version", async () => {
    db.getOne.mockReturnValueOnce(mockUser({ id: 8, active: 0, deletedat: "2026-07-10 08:00:00" }));

    const res = makeRes();
    await businessHandler("post", "/:id/restore")(routeRequest({
      params: { id: "8" },
      user: { id: 42, role: "admin" },
    }), res, vi.fn());

    expect(db.run).toHaveBeenCalledWith(
      "UPDATE users SET active=1, deletedat=NULL, deletedpor=NULL, deletedreason=NULL, updatedat=datetime('now','localtime'), access_version=access_version+1 WHERE id=?",
      ["8"],
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("resets another user's password with a hash and increments access_version", async () => {
    db.getOne.mockReturnValueOnce(mockUser({ id: 8 }));

    const res = makeRes();
    await businessHandler("post", "/:id/reset-password")(routeRequest({
      params: { id: "8" },
      body: { password: "novaSenha123" },
      user: { id: 42, role: "admin" },
    }), res, vi.fn());

    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toBe("UPDATE users SET password=?, updatedat=datetime('now','localtime'), access_version=access_version+1 WHERE id=?");
    expect(bcrypt.compareSync("novaSenha123", params[0])).toBe(true);
    expect(params[1]).toBe("8");
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("blocks self archive, reset, and permanent delete with domain errors", async () => {
    db.getOne.mockReturnValue(mockUser({ id: 42, role: "admin", active: 1 }));

    for (const [method, path, body, error] of [
      ["post", "/:id/archive", { reason: "teste" }, "Voce nao pode arquivar seu proprio usuario"],
      ["post", "/:id/reset-password", { password: "novaSenha123" }, "Voce nao pode resetar sua propria senha por esta tela"],
      ["delete", "/:id", {}, "Voce nao pode excluir permanentemente seu proprio usuario"],
    ]) {
      const res = makeRes();
      await businessHandler(method, path)(routeRequest({
        params: { id: "42" },
        body,
        user: { id: 42, role: "admin" },
      }), res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error });
    }
    expect(db.run).not.toHaveBeenCalled();
  });

  it("returns delete-check allowed=false with blockers from historical references", async () => {
    db.getOne.mockImplementation((sql) => {
      if (sql.includes("FROM ordens WHERE criadopor")) return { total: 2 };
      if (sql.includes("FROM statuslog WHERE usuarioid")) return { total: 1 };
      return { total: 0 };
    });

    const res = makeRes();
    await businessHandler("get", "/:id/delete-check")(routeRequest({
      params: { id: "8" },
    }), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith({
      allowed: false,
      blockers: [
        { table: "ordens", column: "criadopor", label: "OS criadas", total: 2 },
        { table: "statuslog", column: "usuarioid", label: "mudancas de status", total: 1 },
      ],
    });
  });

  it("blocks permanent deletion with 409 when historical references exist", async () => {
    db.getOne.mockImplementation((sql) => {
      if (sql.includes("FROM users WHERE id")) return mockUser({ id: 8, role: "caixa", active: 0 });
      if (sql.includes("role='admin'")) return { total: 2 };
      if (sql.includes("FROM lancamentos WHERE criadopor")) return { total: 3 };
      return { total: 0 };
    });

    const res = makeRes();
    await businessHandler("delete", "/:id")(routeRequest({
      params: { id: "8" },
      user: { id: 42, role: "admin" },
    }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "Usuario possui historico e nao pode ser excluido permanentemente",
      blockers: [
        { table: "lancamentos", column: "criadopor", label: "lancamentos criados", total: 3 },
      ],
    });
    expect(db.run).not.toHaveBeenCalled();
  });

  it("permanently deletes only users without blockers", async () => {
    db.getOne.mockImplementation((sql) => {
      if (sql.includes("FROM users WHERE id")) return mockUser({ id: 8, role: "caixa", active: 0 });
      if (sql.includes("role='admin'")) return { total: 2 };
      return { total: 0 };
    });

    const res = makeRes();
    await businessHandler("delete", "/:id")(routeRequest({
      params: { id: "8" },
      user: { id: 42, role: "admin" },
    }), res, vi.fn());

    expect(db.run).toHaveBeenCalledWith("DELETE FROM users WHERE id=?", ["8"]);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
