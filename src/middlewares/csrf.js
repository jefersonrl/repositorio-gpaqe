'use strict';
const crypto = require('crypto');

const METODOS_PROTEGIDOS = ['POST', 'PUT', 'DELETE', 'PATCH'];

function conferir(req) {
  const enviado = (req.body && req.body._csrf) || req.get('x-csrf-token');
  return enviado && req.session && enviado === req.session.csrf;
}

/**
 * Token contra requisição forjada, guardado na sessão e enviado em cada
 * formulário. Em envio de arquivo o corpo só é lido pelo multer, então a
 * conferência desses casos acontece logo depois, com verificarEnvio.
 */
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;

  if (!METODOS_PROTEGIDOS.includes(req.method)) return next();

  const ehMultipart = String(req.get('content-type') || '').startsWith('multipart/form-data');
  if (ehMultipart) return next();

  if (!conferir(req)) {
    return next(Object.assign(new Error('Sessão expirada. Recarregue a página e tente de novo.'), { status: 403 }));
  }
  next();
}

/** Usar logo depois do multer nas rotas de envio de arquivo. */
function verificarEnvio(req, res, next) {
  if (!conferir(req)) {
    return next(Object.assign(new Error('Sessão expirada. Recarregue a página e tente de novo.'), { status: 403 }));
  }
  next();
}

module.exports = csrf;
module.exports.verificarEnvio = verificarEnvio;
