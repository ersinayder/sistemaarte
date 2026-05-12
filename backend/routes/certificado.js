'use strict';
const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const { auth }             = require('../middlewares/auth');
const { resetNFEWizard }   = require('../utils/nfe');

// Diretório de destino vem do env para não hardcodar paths do Windows
const CERT_DIR = process.env.NFE_CERT_PATH
  ? path.resolve(path.dirname(process.env.NFE_CERT_PATH))
  : path.join(__dirname, '..', 'certs');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const fs = require('fs');
    fs.mkdirSync(CERT_DIR, { recursive: true });
    cb(null, CERT_DIR);
  },
  filename: (_req, _file, cb) => cb(null, 'certificado.pfx'),
});

const upload = multer({
  storage,
  limits:     { fileSize: 512 * 1024 }, // pfx A1 tem ~3-10 KB
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.pfx$/i))
      return cb(new Error('Apenas arquivos .pfx são aceitos'));
    cb(null, true);
  },
});

// POST /api/certificado  (admin only)
router.post('/', auth(['admin']), upload.single('certificado'), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
  resetNFEWizard(); // força reload na próxima emissão
  res.json({ ok: true, mensagem: 'Certificado atualizado com sucesso' });
});

module.exports = router;
