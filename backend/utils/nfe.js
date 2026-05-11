/**
 * utils/nfe.js — Singleton do NFEWizard.
 * O .pfx é lido do disco UMA vez e cacheado em memória.
 * Use resetNFEWizard() após upload de novo certificado.
 */
const fs   = require('fs');
const path = require('path');

let _wizard = null;

function getNFEWizard() {
  if (_wizard) return _wizard;

  const certPath = process.env.NFE_CERT_PATH;
  const certPass = process.env.NFE_CERT_PASSWORD;

  if (!certPath || !certPass)
    throw new Error('NFE_CERT_PATH ou NFE_CERT_PASSWORD não configurados no .env');

  // Resolve caminhos com barras mistas (Windows Server)
  const resolvedPath = path.resolve(certPath);
  if (!fs.existsSync(resolvedPath))
    throw new Error(`Certificado não encontrado: ${resolvedPath}`);

  // Importação lazy — nfewizard-io só é carregado quando necessário
  const NFEWizard = require('nfewizard-io');

  _wizard = new NFEWizard({
    pfx:        fs.readFileSync(resolvedPath),
    passPhrase: certPass,
    tpAmb:      process.env.NFE_AMBIENTE === 'producao' ? '1' : '2',
    cUF:        '31', // MG
  });

  return _wizard;
}

/** Limpa o singleton — chamar após upload de novo .pfx */
function resetNFEWizard() {
  _wizard = null;
}

module.exports = { getNFEWizard, resetNFEWizard };
