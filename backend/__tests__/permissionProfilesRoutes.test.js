import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

process.env.JWT_SECRET = "test-permission-profiles";

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

const profilesModule = await import("../routes/permissionProfiles.js");
const profilesRouter = profilesModule.default || profilesModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function businessHandler(method, path) {
  const layer = profilesRouter.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  const stack = layer?.route?.stack || [];
  return stack[stack.length - 1]?.handle;
}

function routeRequest(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: 99, role: "admin", permissions: ["usuarios.ver", "usuarios.editar"] },
    ...overrides,
  };
}

function profileRow(overrides = {}) {
  return {
    id: 2,
    key: "caixa",
    name: "Caixa",
    description: "Atendimento",
    system: 1,
    active: 1,
    createdat: "2026-07-10 09:00:00",
    updatedat: "2026-07-10 10:00:00",
    user_count: 2,
    active_user_count: 1,
    permissions_csv: "ordens.ver,usuarios.ver,caixa.ver",
    ...overrides,
  };
}

function adminProfilePermissions() {
  return {
    key: "admin",
    active: 1,
    permissions_csv: "usuarios.ver,usuarios.editar,usuarios.restaurar",
  };
}

describe("permission profiles routes", () => {
  beforeEach(() => {
    for (const fn of Object.values(db)) fn.mockReset();
    db.getAll.mockReturnValue([]);
    db.getOne.mockReturnValue(null);
    db.run.mockReturnValue({ changes: 1 });
    db.runInsert.mockReturnValue(123);
    db.transaction.mockImplementation((fn) => fn());
  });

  it("lists profiles with catalog groups and without leaking internal ids", async () => {
    db.getAll.mockReturnValueOnce([profileRow()]);

    const res = makeRes();
    await businessHandler("get", "/")(routeRequest(), res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      profiles: [
        expect.objectContaining({
          key: "caixa",
          name: "Caixa",
          system: true,
          active: true,
          user_count: 2,
          active_user_count: 1,
          permissions: ["ordens.ver", "caixa.ver", "usuarios.ver"],
        }),
      ],
      permissions: expect.arrayContaining(["usuarios.ver", "usuarios.editar"]),
      permissionGroups: expect.arrayContaining([
        expect.objectContaining({ key: "usuarios", permissions: expect.arrayContaining(["usuarios.editar"]) }),
      ]),
    }));
    expect(res.json.mock.calls[0][0].profiles[0]).not.toHaveProperty("id");
    expect(res.json.mock.calls[0][0].profiles[0]).not.toHaveProperty("permissions_csv");
  });

  it("updates a profile in a transaction and invalidates sessions for affected users", async () => {
    db.getOne
      .mockReturnValueOnce(profileRow())
      .mockReturnValueOnce(profileRow({
        name: "Caixa ajustado",
        description: "Novo escopo",
        permissions_csv: "ordens.ver,clientes.ver",
      }));
    db.getAll
      .mockReturnValueOnce([
        adminProfilePermissions(),
        { key: "caixa", active: 1, permissions_csv: "ordens.ver,usuarios.ver,caixa.ver" },
      ])
      .mockReturnValueOnce([
        { id: 1, profile_key: "admin" },
        { id: 2, profile_key: "caixa" },
      ]);

    const res = makeRes();
    await businessHandler("put", "/:key")(routeRequest({
      params: { key: "caixa" },
      body: {
        name: " Caixa ajustado ",
        description: " Novo escopo ",
        active: true,
        permissions: ["clientes.ver", "ordens.ver", "ordens.ver"],
      },
    }), res, vi.fn());

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.run).toHaveBeenCalledWith(
      "UPDATE permission_profiles SET name=?, description=?, active=?, updatedat=datetime('now','localtime') WHERE id=?",
      ["Caixa ajustado", "Novo escopo", 1, 2],
    );
    expect(db.run).toHaveBeenCalledWith("DELETE FROM profile_permissions WHERE profile_id=?", [2]);
    expect(db.run).toHaveBeenCalledWith(
      "INSERT INTO profile_permissions (profile_id, permission) VALUES (?, ?)",
      [2, "ordens.ver"],
    );
    expect(db.run).toHaveBeenCalledWith(
      "UPDATE users SET access_version=access_version+1, updatedat=datetime('now','localtime') WHERE COALESCE(profile_key, role)=? AND deletedat IS NULL",
      ["caixa"],
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it("rejects unknown permissions with a clear 400 response", async () => {
    db.getOne.mockReturnValueOnce(profileRow());

    const res = makeRes();
    await businessHandler("put", "/:key")(routeRequest({
      params: { key: "caixa" },
      body: {
        name: "Caixa",
        permissions: ["usuarios.voar"],
      },
    }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Permissao desconhecida: usuarios.voar" });
    expect(db.run).not.toHaveBeenCalled();
  });

  it("blocks removing permissions from the administrator profile", async () => {
    db.getOne.mockReturnValueOnce(profileRow({
      id: 1,
      key: "admin",
      name: "Administrador",
      description: "Acesso total",
      permissions_csv: "usuarios.ver,usuarios.editar,usuarios.restaurar",
    }));

    const res = makeRes();
    await businessHandler("put", "/:key")(routeRequest({
      params: { key: "admin" },
      body: {
        name: "Administrador",
        active: true,
        permissions: ["usuarios.ver", "usuarios.editar", "usuarios.restaurar"],
      },
    }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "O perfil Administrador deve manter todas as permissoes" });
    expect(db.run).not.toHaveBeenCalled();
  });

  it("blocks changes that would leave no active user able to manage users", async () => {
    db.getOne.mockReturnValueOnce(profileRow({ permissions_csv: "usuarios.ver,usuarios.editar,usuarios.restaurar" }));
    db.getAll
      .mockReturnValueOnce([
        { key: "caixa", active: 1, permissions_csv: "usuarios.ver,usuarios.editar,usuarios.restaurar" },
      ])
      .mockReturnValueOnce([{ id: 2, profile_key: "caixa" }]);

    const res = makeRes();
    await businessHandler("put", "/:key")(routeRequest({
      params: { key: "caixa" },
      body: {
        name: "Caixa",
        active: true,
        permissions: ["ordens.ver"],
      },
    }), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "Nao e possivel deixar o sistema sem um usuario ativo com permissao para gerenciar usuarios",
    });
    expect(db.run).not.toHaveBeenCalled();
  });

  it("restores default permissions and invalidates profile sessions", async () => {
    db.getOne
      .mockReturnValueOnce(profileRow({ permissions_csv: "ordens.ver" }))
      .mockReturnValueOnce(profileRow({
        name: "Caixa",
        description: "Atendimento, OS, clientes, produtos, propostas, caixa operacional e NF-e operacional.",
        permissions_csv: "dashboard.ver,atendimento.ver,ordens.ver",
      }));
    db.getAll
      .mockReturnValueOnce([
        adminProfilePermissions(),
        { key: "caixa", active: 1, permissions_csv: "ordens.ver" },
      ])
      .mockReturnValueOnce([{ id: 1, profile_key: "admin" }]);

    const res = makeRes();
    await businessHandler("post", "/:key/restore-defaults")(routeRequest({
      params: { key: "caixa" },
    }), res, vi.fn());

    expect(db.run).toHaveBeenCalledWith(
      "UPDATE permission_profiles SET name=?, description=?, active=1, system=1, updatedat=datetime('now','localtime') WHERE id=?",
      ["Caixa", "Atendimento, OS, clientes, produtos, propostas, caixa operacional e NF-e operacional.", 2],
    );
    expect(db.run).toHaveBeenCalledWith("DELETE FROM profile_permissions WHERE profile_id=?", [2]);
    expect(db.run).toHaveBeenCalledWith(
      "UPDATE users SET access_version=access_version+1, updatedat=datetime('now','localtime') WHERE COALESCE(profile_key, role)=? AND deletedat IS NULL",
      ["caixa"],
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});
