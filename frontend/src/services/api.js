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
    const message = err.response?.data?.error || err.response?.data?.message;

    // 401 — sessao expirada, redireciona para login
    if (status === 401) {
      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(err);
    }

    // 403 — sem permissao
    if (status === 403) {
      toast.error(
        message || "Você não tem permissão para executar esta ação.",
        { id: TOAST_403, duration: 4000 }
      );
      return Promise.reject(err);
    }

    // 5xx — erro no servidor
    if (status >= 500) {
      toast.error(
        message || "Erro interno do servidor. Tente novamente em instantes.",
        { id: TOAST_5XX, duration: 5000 }
      );
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
