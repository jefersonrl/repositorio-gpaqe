'use strict';
const express = require('express');
const usuarios = require('../services/usuarios');
const projetosSrv = require('../services/projetos');
const permissoes = require('../services/permissoes');
const buscaSrv = require('../services/busca');
const { consultar } = require('../config/db');
const { exigirLogin, exigirAdminSistema } = require('../middlewares/auth');

const rotas = express.Router();

rotas.get('/', exigirLogin, async (req, res, next) => {
  try {
    const meus = await usuarios.projetosDoUsuario(req.usuario.id);
    const todos = req.usuario.admin_sistema ? await projetosSrv.listar() : [];
    const grupo = await consultar('SELECT * FROM pasta WHERE projeto_id IS NULL AND pai_id IS NULL');
    let nivelGrupo = 'X';
    if (grupo.length) {
      const acesso = await permissoes.contextoDeAcesso(req.usuario, grupo[0].id);
      nivelGrupo = acesso ? acesso.nivel : 'X';
    }
    res.render('pages/painel', {
      titulo: 'Meus projetos',
      meus, todos,
      pastaGrupo: grupo[0] || null,
      nivelGrupo
    });
  } catch (erro) { next(erro); }
});

rotas.get('/buscar', exigirLogin, async (req, res, next) => {
  try {
    const { termo, projeto, tipo, ano } = req.query;
    const resultados = (termo || tipo || ano)
      ? await buscaSrv.buscar(req.usuario, { termo, projetoId: projeto, tipo, ano })
      : [];
    const meus = await usuarios.projetosDoUsuario(req.usuario.id);
    const tipos = await buscaSrv.valoresDeMetadado('tipo');
    res.render('pages/busca', {
      titulo: 'Busca', resultados, meus, tipos,
      filtros: { termo: termo || '', projeto: projeto || '', tipo: tipo || '', ano: ano || '' }
    });
  } catch (erro) { next(erro); }
});

// ------------------------------------------------------- administração
rotas.get('/admin/usuarios', exigirLogin, exigirAdminSistema, async (req, res, next) => {
  try {
    res.render('pages/admin_usuarios', { titulo: 'Pessoas cadastradas', lista: await usuarios.listar() });
  } catch (erro) { next(erro); }
});

rotas.post('/admin/usuarios', exigirLogin, exigirAdminSistema, async (req, res, next) => {
  try {
    const { nome, email, senha, instituicao, admin } = req.body;
    await usuarios.criar({ nome, email, senha, instituicao, adminSistema: admin === 'on' });
    req.flash('sucesso', 'Pessoa cadastrada.');
    res.redirect('/admin/usuarios');
  } catch (erro) {
    req.flash('erro', erro.code === 'ER_DUP_ENTRY' ? 'Já existe cadastro com esse e-mail.' : erro.message);
    res.redirect('/admin/usuarios');
  }
});

module.exports = rotas;
