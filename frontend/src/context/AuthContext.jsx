import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
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

  const isAdmin   = user?.role === "admin";
  const isCaixa   = user?.role === "caixa"   || user?.role === "admin";
  const isOficina = user?.role === "oficina" || user?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchUser, isAdmin, isCaixa, isOficina }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
