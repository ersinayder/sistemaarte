import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Apenas dados públicos do usuário em memória (sem token)
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Valida sessão via cookie no mount
  useEffect(() => {
    api.get("/auth/me")
      .then(r => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    // O cookie HttpOnly já foi setado pelo backend automaticamente
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  }, []);

  const switchUser = useCallback(async () => {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  }, []);

  const permissions = useMemo(
    () => (Array.isArray(user?.permissions) ? user.permissions : []),
    [user?.permissions]
  );
  const profile = useMemo(() => user?.profile || ({
    key: user?.profile_key || user?.role,
    name: user?.profile_name || user?.role,
  }), [user?.profile, user?.profile_key, user?.profile_name, user?.role]);
  const can = useCallback((permission) => {
    if (!permission) return false;
    return permissions.includes("*") || permissions.includes(permission);
  }, [permissions]);
  const canAny = useCallback((required) => {
    if (!Array.isArray(required) || required.length === 0) return false;
    return required.some((permission) => can(permission));
  }, [can]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchUser, permissions, profile, can, canAny }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
