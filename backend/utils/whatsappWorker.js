const {
  listarAvisosElegiveis,
  tentarClaimAviso,
  marcarAguardandoConexao,
  marcarErroTemporario,
  marcarEnviado,
} = require('./whatsappQueue');

function createWhatsappWorker({ provider, intervalMs = 15000, batchSize = 5, logger = console }) {
  let timer = null;
  let running = false;

  async function processAviso(aviso) {
    if (!tentarClaimAviso(aviso.id)) return;

    const status = await provider.getStatus();
    if (!status.connected) {
      marcarAguardandoConexao(aviso.id, `Sessao WhatsApp desconectada: ${status.state}`);
      return;
    }

    try {
      const result = await provider.sendText({
        phone: aviso.telefone_snapshot,
        text: aviso.mensagem_snapshot,
      });
      marcarEnviado(aviso.id, result.messageId || null);
    } catch (err) {
      marcarErroTemporario(aviso.id, err, Number(aviso.tentativas || 0) + 1);
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const avisos = listarAvisosElegiveis(batchSize);
      for (const aviso of avisos) {
        await processAviso(aviso);
      }
    } catch (err) {
      logger.error('[WhatsAppWorker] Falha no ciclo:', err.message);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, intervalMs);
    timer.unref?.();
    void tick();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { start, stop, tick };
}

module.exports = { createWhatsappWorker };
