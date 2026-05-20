import axios from "axios";
import { toast } from "react-hot-toast";

const api = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || "/api",
  timeout:         15000,
  withCredentials: true,
});

// IDs de toast fixos para evitar empilhamento de msgs iguais
const TOAST_403 = "global-403";
const TOAST_5XX = "global-5xx";
const TOAST_NET = "global-net";

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status  = err.response?.status;
    const message = err.response?.data?.erro || err.response?.data?.error || err.response?.data?.message;
    const url     = err.config?.url || "";

    // 401 — sessão expirada
    // Ignora a rota de handshake (/auth/me) — o AuthContext trata setUser(null)
    // e o AppRoutes redireciona via React Router sem reload duro.
    if (status === 401) {
      const isHandshake = url.includes("/auth/me") || url.includes("/auth/login");
      if (!isHandshake && !window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(err);
    }

    // 403 — sem permissão
    if (status === 403) {
      toast.error(
        message || "Você não tem permissão para executar esta ação.",
        { id: TOAST_403, duration: 4000 }
      );
      return Promise.reject(err);
    }

    // 5xx — erro no servidor
    // Suprime o toast genérico em chamadas de inicialização (auth/me, clientes seed)
    // para evitar toasts falsos no carregamento inicial com sessão expirada.
    if (status >= 500) {
      const isSilent = url.includes("/auth/me") || err.config?.skipGlobalErrorToast;
      if (!isSilent) {
        toast.error(
          message || "Erro interno do servidor. Tente novamente em instantes.",
          { id: TOAST_5XX, duration: 5000 }
        );
      }
      return Promise.reject(err);
    }

    // Sem resposta (rede/timeout)
    if (!err.response) {
      toast.error(
        "Sem conexão com o servidor. Verifique sua internet.",
        { id: TOAST_NET, duration: 5000 }
      );
    }

    return Promise.reject(err);
  }
);

export default api;
