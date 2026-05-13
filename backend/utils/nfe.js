'use strict';

/**
 * utils/nfe.js – Singleton do NFEWizard.
 * O .pfx é lido do disco UMA vez e cacheado em memória.
 * Use resetNFEWizard() após upload de novo certificado.
 */

const fs   = require('fs');
const path = require('path');

let _wizard = null;

// Timeout para requisições ao SEFAZ (ms)
const SEFAZ_TIMEOUT_MS = 30_000;

function getNFEWizard() {
  if (_wizard) return _wizard;

  const certPath = process.env.NFE_CERT_PATH;
  const certPass = process.env.NFE_CERT_PASSWORD;

  if (!certPath || !certPass)
    throw new Error('NFE_CERT_PATH ou NFE_CERT_PASSWORD não configurados no .env');

  const resolvedPath = path.resolve(certPath);
  if (!fs.existsSync(resolvedPath))
    throw new Error(`Certificado não encontrado: ${resolvedPath}`);

  const NFEWizard = require('nfewizard-io');

  _wizard = new NFEWizard({
    pfx:        fs.readFileSync(resolvedPath),
    passPhrase: certPass,
    tpAmb:      process.env.NFE_AMBIENTE === 'producao' ? '1' : '2',
    cUF:        '31', // MG
    // Timeout para conexão HTTP com SEFAZ via axios
    axiosConfig: {
      timeout: SEFAZ_TIMEOUT_MS,
    },
  });

  return _wizard;
}

/**
 * Executa uma chamada ao SEFAZ com timeout garantido.
 * Uso: await callSEFAZ(() => wizard.NFeAutorizacao(...))
 */
async function callSEFAZ(fn) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout SEFAZ (${SEFAZ_TIMEOUT_MS / 1000}s) — verifique conectividade com a SEFAZ-MG`)), SEFAZ_TIMEOUT_MS + 5_000)
  );
  return Promise.race([fn(), timeout]);
}

/** Limpa o singleton – chamar após upload de novo .pfx */
function resetNFEWizard() {
  _wizard = null;
}

module.exports = { getNFEWizard, resetNFEWizard, callSEFAZ };
