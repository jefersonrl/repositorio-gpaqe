'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const usuarios = require('../services/usuarios');
const auditoria = require('../services/auditoria');
const { exigirLogin } = require('../middlewares/auth');

const rotas = express.Router();

const limiteLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas. Espere alguns minutos antes de tentar de novo.',
  standardHeaders: true,
  legacyHeaders: false
});

rotas.get('/entrar', (req, res) => {
  if (req.usuario) return res.redirect('/');
  res.render('pages/entrar', { titulo: 'Entrar' });
});

rotas.post('/entrar', limiteLogin, async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    const usuario = await usuarios.porEmail(email);
    const ok = await usuarios.conferirSenha(usuario, senha || '');
    if (!ok) {
      await auditoria.registrar({
        acao: 'login_negado', entidade: 'usuario', detalhe: String(email || '').slice(0, 120), ip: req.ip
      });
      req.flash('erro', 'E-mail ou senha inválidos.');
      return res.redirect('/entrar');
    }
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.usuarioId = usuario.id;
      const destino = req.session.destino || '/';
      delete req.session.destino;
      // Grava a sessão antes de responder. Sem isso, com banco remoto ou lento,
      // a próxima página pode chegar antes da sessão estar salva, e a pessoa
      // volta para a tela de entrada logo depois de acertar a senha.
      req.session.save(erroSessao => {
        if (erroSessao) return next(erroSessao);
        auditoria.registrar({
          usuarioId: usuario.id, acao: 'login', entidade: 'usuario', entidadeId: usuario.id, ip: req.ip
        }).catch(() => {});
        res.redirect(destino);
      });
    });
  } catch (erro) { next(erro); }
});

rotas.post('/sair', exigirLogin, (req, res) => {
  const id = req.usuario.id;
  req.session.destroy(() => {
    auditoria.registrar({ usuarioId: id, acao: 'logout', entidade: 'usuario', entidadeId: id }).catch(() => {});
    res.redirect('/entrar');
  });
});

rotas.get('/conta', exigirLogin, (req, res) => {
  res.render('pages/conta', { titulo: 'Minha conta' });
});

rotas.post('/conta/senha', exigirLogin, async (req, res, next) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const ok = await usuarios.conferirSenha(req.usuario, senhaAtual || '');
    if (!ok) {
      req.flash('erro', 'A senha atual não confere.');
      return res.redirect('/conta');
    }
    await usuarios.trocarSenha(req.usuario.id, novaSenha);
    await auditoria.registrar({
      usuarioId: req.usuario.id, acao: 'trocar_senha', entidade: 'usuario', entidadeId: req.usuario.id
    });
    req.flash('sucesso', 'Senha alterada.');
    res.redirect('/conta');
  } catch (erro) { next(erro); }
});

module.exports = rotas;
