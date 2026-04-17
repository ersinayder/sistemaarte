import axios from "axios";

const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || "/api",
  timeout:         15000,
  withCredentials: true, // envia/recebe cookies HttpOnly automaticamente
});

// Não precisa mais injetar token manualmente — o browser envia o cookie.
// Mantemos o interceptor de 401 para logout automático.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Evita redirect em loop na própria página de login
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
