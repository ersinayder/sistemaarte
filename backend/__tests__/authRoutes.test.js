import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-rbac-routes";
process.env.JWT_SECRET = TEST_SECRET;

const dbMock = {
  getOne: vi.fn(),
};

vi.mock("../database", () => dbMock);
vi.mock("../database.js", () => dbMock);
const require = createRequire(import.meta.url);
const databasePath = require.resolve("../database.js");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: dbMock,
};

const authRoutesModule = await import("../routes/auth.js");
const router = authRoutesModule.default || authRoutesModule;

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

function getRouteHandler(method, routePath) {
  const layer = router.stack.find((entry) => entry.route?.path === routePath && entry.route.methods?.[method]);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe("auth routes", () => {
  beforeEach(() => {
    dbMock.getOne.mockReset();
  });

  it("returns public user permissions and signs a minimal token on login", () => {
    const passwordHash = bcrypt.hashSync("senha-segura", 10);
    dbMock.getOne.mockReturnValue({
      id: 1,
      name: "Administrador",
      username: "admin",
      password: passwordHash,
      role: "admin",
      profile_key: "admin",
      active: 1,
      deletedat: null,
      access_version: 4,
      profile_name: "Administrador",
      profile_active: 1,
      permissions_csv: "usuarios.ver,usuarios.editar",
    });
    const req = { body: { username: "admin", password: "senha-segura" } };
    const res = makeRes();

    getRouteHandler("post", "/login")(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith("token", expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.json).toHaveBeenCalledWith({
      user: expect.objectContaining({
        id: 1,
        name: "Administrador",
        username: "admin",
        role: "admin",
        profile_key: "admin",
        permissions: ["usuarios.ver", "usuarios.editar"],
      }),
    });
    expect(res.json.mock.calls[0][0].user).not.toHaveProperty("password");

    const token = res.cookie.mock.calls[0][1];
    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded).toMatchObject({ id: 1, accessVersion: 4 });
    expect(decoded).not.toHaveProperty("permissions");
    expect(decoded).not.toHaveProperty("role");
  });
});
