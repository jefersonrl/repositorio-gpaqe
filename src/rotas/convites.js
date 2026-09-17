'use strict';
const express = require('express');
const convitesSrv = require('../services/convites');
const usuariosSrv = require('../services/usuarios');

const rotas = express.Router();

rotas.get('/convites/:token', async (req, res, next) => {
  try {
    const convite = await convitesSrv.porToken(req.params.token);
    if (!convite) return next(Object.assign(new Error('Convite não encontrado.'), { status: 404 }));
    const jaCadastrado = Boolean(await usuariosSrv.porEmail(convite.email));
    res.render('pages/convite', {
      titulo: 'Convite de acesso',
      convite,
      jaCadastrado,
      vencido: new Date(convite.expira_em) < new Date(),
      minSenha: usuariosSrv.MIN_SENHA
    });
  } catch (erro) { next(erro); }
});

rotas.post('/convites/:token', async (req, res, next) => {
  try {
    const usuario = await convitesSrv.aceitar(req.params.token, req.body);
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.usuarioId = usuario.id;
      // grava antes de responder, pelo mesmo motivo da tela de entrada
      req.session.save(erroSessao => {
        if (erroSessao) return next(erroSessao);
        res.redirect('/');
      });
    });
  } catch (erro) {
    req.flash('erro', erro.message);
    res.redirect(`/convites/${req.params.token}`);
  }
});

module.exports = rotas;
