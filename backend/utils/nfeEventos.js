'use strict';

const { getNFEWizard, callSEFAZ } = require('./nfe');

async function transmitirCcePayload(payload) {
  const wizard = await getNFEWizard();
  return callSEFAZ(() => wizard.NFE_CartaDeCorrecao(payload));
}

async function transmitirCancelamentoPayload(payload) {
  const wizard = await getNFEWizard();
  return callSEFAZ(() => wizard.NFE_Cancelamento(payload));
}

module.exports = {
  transmitirCcePayload,
  transmitirCancelamentoPayload,
};
