const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const { auth } = require('../middlewares/auth');

// Diretório derivado da var de ambiente — nunca hardcode
const certDir = () => {
  const certPath = process.env.NFE_CERT_PATH;
  if (!certPath) throw new Error('NFE_CERT_PATH não configurado');
  return path.resolve(certPath, '..');
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try { cb(null, certDir()); }
    catch (e) { cb(e); }
  },
  filename: (_req, _file, cb) => cb(null, 'certificado.pfx'),
});

const upload = multer({
  storage,
  limits: { fileSize: 512 * 1024 }, // 512 KB — pfx A1 tem ~3-10 KB
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.pfx$/i))
      return cb(new Error('Apenas arquivos .pfx são aceitos'));
    cb(null, true);
  },
});

/**
 * POST /api/certificado
 * Faz upload do certificado A1 (.pfx) e reinicia o singleton NFEWizard.
 * Requer role admin.
 */
router.post('/', auth(['admin']), upload.single('certificado'), (req, res, next) => {
  try {
    // Reinicia o singleton para forçar releitura do novo .pfx
    const { resetNFEWizard } = require('../utils/nfe');
    resetNFEWizard();
    res.json({ ok: true, mensagem: 'Certificado atualizado com sucesso' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
