const { getOne } = require('../database');
const {
  montarDestinoImpressora,
  pickImpressaoConfig,
  statusImpressaoConfig,
} = require('../domain/impressaoConfigRules');

const SEL_IMPRESSAO = `
  SELECT printer_name, printer_ip, paper_size, color, updatedat
  FROM impressao_config
  WHERE id = 1
`;

function getImpressaoConfig() {
  const row = getOne(SEL_IMPRESSAO) || {};
  const config = pickImpressaoConfig(row);
  return {
    ...config,
    destino: montarDestinoImpressora(config),
    status: statusImpressaoConfig(config),
  };
}

module.exports = {
  getImpressaoConfig,
};
