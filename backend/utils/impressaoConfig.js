const { getOne } = require('../database');
const {
  montarDestinoImpressora,
  pickImpressaoConfig,
  statusImpressaoConfig,
} = require('../domain/impressaoConfigRules');
const { isAgenteOnline } = require('../domain/printQueueRules');

const SEL_IMPRESSAO = `
  SELECT printer_name, printer_ip, paper_size, color, direct_print_enabled, agent_mode, agent_last_seen, updatedat
  FROM impressao_config
  WHERE id = 1
`;

function getImpressaoConfig() {
  const row = getOne(SEL_IMPRESSAO) || {};
  const config = pickImpressaoConfig(row);
  const online = isAgenteOnline(row);
  return {
    ...config,
    agent_mode: row.agent_mode !== undefined ? Number(row.agent_mode) : 1,
    agent_last_seen: row.agent_last_seen ?? null,
    agentLastSeen: row.agent_last_seen ?? null,
    agentOnline: online,
    isAgenteOnline: online,
    destino: montarDestinoImpressora(config),
    status: statusImpressaoConfig(config),
  };
}

module.exports = {
  getImpressaoConfig,
};
