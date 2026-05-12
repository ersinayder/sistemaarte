/**
 * Singleton wrapper para nfewizard-io.
 * Carrega o .pfx uma única vez e reutiliza a instância.
 * Para forçar reload (ex: novo certificado), chame resetNFEWizard().
 */
const NFEWizard = require('nfewizard-io');
const fs        = require('fs');
const path      = require('path');

let _wizard = null;

function getNFEWizard() {
  if (_wizard) return _wizard;

  const certPath = process.env.NFE_CERT_PATH;
  const certPass = process.env.NFE_CERT_PASSWORD;
  if (!certPath || !certPass)
    throw new Error('NFE_CERT_PATH ou NFE_CERT_PASSWORD não configurados no .env');

  const resolvedPath = path.resolve(certPath);
  if (!fs.existsSync(resolvedPath))
    throw new Error(`Certificado não encontrado: ${resolvedPath}`);

  _wizard = new NFEWizard({
    pfx:        fs.readFileSync(resolvedPath),
    passPhrase: certPass,
    tpAmb:      process.env.NFE_AMBIENTE === 'producao' ? '1' : '2',
    cUF:        '31', // MG
  });

  return _wizard;
}

function resetNFEWizard() {
  _wizard = null;
}

module.exports = { getNFEWizard, resetNFEWizard };
