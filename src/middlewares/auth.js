'use strict';
const usuarios = require('../services/usuarios');

async function carregarUsuario(req, res, next) {
  res.locals.usuario = null;
  if (req.session && req.session.usuarioId) {
    const usuario = await usuarios.porId(req.session.usuarioId);
    if (usuario && usuario.ativo) {
      req.usuario = usuario;
      res.locals.usuario = usuario;
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

function exigirLogin(req, res, next) {
  if (!req.usuario) {
    req.session.destino = req.originalUrl;
    return res.redirect('/entrar');
  }
  next();
}

function exigirAdminSistema(req, res, next) {
  if (!req.usuario || !req.usuario.admin_sistema) {
    return next(Object.assign(new Error('Acesso restrito ao administrador do sistema.'), { status: 403 }));
  }
  next();
}

module.exports = { carregarUsuario, exigirLogin, exigirAdminSistema };
