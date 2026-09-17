'use strict';
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

// O arquivo chega a um diretório temporário e só depois vai para o
// armazenamento. O nome é gerado pelo sistema, nunca o enviado pelo usuário.
const armazenamentoTemporario = multer.diskStorage({
  destination: (req, arquivo, cb) => cb(null, os.tmpdir()),
  filename: (req, arquivo, cb) =>
    cb(null, `upload-${crypto.randomBytes(12).toString('hex')}${path.extname(arquivo.originalname).slice(0, 12)}`)
});

const upload = multer({
  storage: armazenamentoTemporario,
  limits: { fileSize: config.armazenamento.maxUploadMb * 1024 * 1024 }
});

module.exports = upload;
