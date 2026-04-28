/**
 * eventBus — pub/sub leve via CustomEvent no window.
 * Usado para comunicação entre páginas dentro da mesma SPA.
 *
 * Eventos disponíveis:
 *   'lancamento:salvo'  — disparado pelo Caixa ao criar/editar um lançamento
 */

export function emit(event, detail = {}) {
  window.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(event, handler) {
  window.addEventListener(event, handler);
  return () => window.removeEventListener(event, handler);
}
