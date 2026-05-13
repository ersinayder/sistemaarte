'use strict';

const fs   = require('fs');
const path = require('path');

let _wizard = null;

const SEFAZ_TIMEOUT_MS = 30_000;

async function getNFEWizard() {
  if (_wizard) return _wizard;

  const certPath = process.env.NFE_CERT_PATH;
  const certPass = process.env.NFE_CERT_PASSWORD;

  if (!certPath || !certPass)
    throw new Error('NFE_CERT_PATH ou NFE_CERT_PASSWORD nao configurados no .env');

  const resolvedPath = path.resolve(certPath);
  if (!fs.existsSync(resolvedPath))
    throw new Error(`Certificado nao encontrado: ${resolvedPath}`);

  let NFEWizard;
  try {
    NFEWizard = require('nfewizard-io');
  } catch (e) {
    throw new Error(`nfewizard-io nao instalado ou com erro de import: ${e.message}`);
  }

  if (NFEWizard && NFEWizard.default) NFEWizard = NFEWizard.default;

  const wizard = new NFEWizard();

  await wizard.NFE_LoadEnvironment({
    pfx:        fs.readFileSync(resolvedPath),
    passPhrase: certPass,
    tpAmb:      process.env.NFE_AMBIENTE === 'producao' ? '1' : '2',
    cUF:        '31',
    axiosConfig: { timeout: SEFAZ_TIMEOUT_MS },
  });

  _wizard = wizard;
  console.log('[NF-e] NFEWizard singleton criado e ambiente carregado. tpAmb=',
    process.env.NFE_AMBIENTE === 'producao' ? '1(PROD)' : '2(HOMOL)');
  return _wizard;
}

async function callSEFAZ(fn) {
  const GUARD = SEFAZ_TIMEOUT_MS + 5_000;
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Timeout SEFAZ (${SEFAZ_TIMEOUT_MS / 1000}s) - sem resposta da SEFAZ-MG`)),
      GUARD
    )
  );
  return Promise.race([fn(), timeout]);
}

function resetNFEWizard() {
  _wizard = null;
  console.log('[NF-e] Singleton resetado.');
}

module.exports = { getNFEWizard, resetNFEWizard, callSEFAZ };
