'use strict';

/**
 * utils/nfe.js
 * Singleton do NFEWizard para nfewizard-io v1.0.4.
 *
 * Estrutura de config descoberta lendo @nfewizard/shared/dist/index.cjs:
 *   config.dfe.pathCertificado, config.dfe.senhaCertificado, config.dfe.UF
 *   config.nfe.ambiente  (1=producao, 2=homologacao)
 *   config.nfe.versaoDF  ('4.00')
 *   config.lib.useOpenSSL = false  (usa node-forge, sem openssl do sistema)
 *   config.lib.connection.timeout
 */

const fs   = require('fs');
const path = require('path');
const { getCertificadoConfig, tpAmbAtual } = require('./nfeConfig');

let _wizard = null;

const SEFAZ_TIMEOUT_MS = 60_000;

async function getNFEWizard() {
  if (_wizard) return _wizard;

  const certConfig = getCertificadoConfig();
  const certPath = certConfig.pathCertificado;
  const certPass = certConfig.senhaCertificado;

  if (!certPath || !certPass)
    throw new Error('Certificado NF-e nao configurado. Configure na tela fiscal ou no .env.');

  const resolvedPath = path.resolve(certPath);
  if (!fs.existsSync(resolvedPath))
    throw new Error(`Certificado nao encontrado: ${resolvedPath}`);

  let nfewizardModule;
  try {
    nfewizardModule = require('nfewizard-io');
  } catch (e) {
    throw new Error(`nfewizard-io nao instalado ou com erro de import: ${e.message}`);
  }

  const NFEWizard = nfewizardModule.NFeWizard
    || nfewizardModule.default?.NFeWizard
    || nfewizardModule.default;

  if (typeof NFEWizard !== 'function')
    throw new Error(`Erro ao inicializar a lib: NFeWizard nao e uma funcao. Exports: ${Object.keys(nfewizardModule).join(', ')}`);

  let libVersion = '0.0.0';
  try { libVersion = require('nfewizard-io/package.json').version; } catch (_) {}
  console.log('[NF-e] nfewizard-io versao:', libVersion);

  const wizard = new NFEWizard();
  const tpAmb  = tpAmbAtual();

  const configObj = {
    dfe: {
      pathCertificado:  resolvedPath,
      senhaCertificado: certPass,
      UF:               'MG',
      idCSC:            process.env.NFE_ID_CSC || '',
      CSC:              process.env.NFE_CSC    || '',
    },
    nfe: {
      ambiente: tpAmb,
      versaoDF: '4.00',
    },
    lib: {
      useOpenSSL: false,
      connection: { timeout: SEFAZ_TIMEOUT_MS },
    },
  };

  try {
    await wizard.NFE_LoadEnvironment({ config: configObj });
  } catch (e) {
    throw new Error(`Erro ao inicializar a lib: ${e.message}`);
  }

  _wizard = wizard;
  console.log('[NF-e] NFEWizard singleton criado e ambiente carregado. tpAmb=',
    tpAmb === 1 ? '1(PROD)' : '2(HOMOL)');
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
