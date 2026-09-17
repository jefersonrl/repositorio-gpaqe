'use strict';
const express = require('express');
const permissoes = require('../services/permissoes');
const pastasSrv = require('../services/pastas');
const arquivosSrv = require('../services/arquivos');
const projetosSrv = require('../services/projetos');
const usuarios = require('../services/usuarios');
const { exigirLogin } = require('../middlewares/auth');
const { exigirNaPasta } = require('../middlewares/acesso');

const rotas = express.Router();

rotas.get('/pastas/:id', exigirLogin, exigirNaPasta('ver'), async (req, res, next) => {
  try {
    const { contexto, pasta, nivel, cap, perfil } = req.acesso;
    const subpastas = permissoes.subpastasVisiveis(contexto, pasta.id, req.usuario, perfil, nivel);
    const arquivos = await arquivosSrv.listarDaPasta(pasta.id, { nivel, usuarioId: req.usuario.id });
    const projeto = pasta.projeto_id ? await projetosSrv.porId(pasta.projeto_id) : null;
    res.render('pages/pasta', {
      titulo: pasta.nome,
      projeto, pasta, nivel, cap, subpastas, arquivos,
      trilha: permissoes.trilha(contexto, pasta.id),
      ehCoordenacao: nivel === 'A'
    });
  } catch (erro) { next(erro); }
});

rotas.post('/pastas/:id/subpastas', exigirLogin, exigirNaPasta('organizar'), async (req, res, next) => {
  try {
    const id = await pastasSrv.criar(
      { paiId: req.params.id, nome: req.body.nome, descricao: req.body.descricao }, req.usuario
    );
    req.flash('sucesso', 'Pasta criada.');
    res.redirect(`/pastas/${id}`);
  } catch (erro) {
    req.flash('erro', erro.message);
    res.redirect(`/pastas/${req.params.id}`);
  }
});

rotas.post('/pastas/:id/renomear', exigirLogin, exigirNaPasta('organizar'), async (req, res, next) => {
  try {
    await pastasSrv.renomear(req.params.id, req.body.nome, req.usuario);
    req.flash('sucesso', 'Pasta renomeada.');
    res.redirect(`/pastas/${req.params.id}`);
  } catch (erro) { next(erro); }
});

// --------------------------------------------------------- permissões
rotas.get('/pastas/:id/permissoes', exigirLogin, exigirNaPasta('gerir'), async (req, res, next) => {
  try {
    const { pasta, contexto } = req.acesso;
    const pessoas = pasta.projeto_id
      ? (await projetosSrv.vinculos(pasta.projeto_id))
      : (await usuarios.listar()).map(u => ({ usuario_id: u.id, nome: u.nome, email: u.email }));
    res.render('pages/permissoes', {
      titulo: `Permissões de ${pasta.nome}`,
      pasta,
      permissoes: await pastasSrv.permissoesDaPasta(pasta.id),
      niveis: permissoes.NIVEIS,
      pessoas,
      trilha: permissoes.trilha(contexto, pasta.id),
      herdado: (perfil) => permissoes.resolverNivel(contexto, pasta.id, null, perfil)
    });
  } catch (erro) { next(erro); }
});

rotas.post('/pastas/:id/permissoes/perfil', exigirLogin, exigirNaPasta('gerir'), async (req, res, next) => {
  try {
    await pastasSrv.definirPermissaoPerfil(req.params.id, req.body.perfil, req.body.nivel, req.usuario);
    req.flash('sucesso', 'Permissão do perfil atualizada.');
    res.redirect(`/pastas/${req.params.id}/permissoes`);
  } catch (erro) { next(erro); }
});

rotas.post('/pastas/:id/permissoes/usuario', exigirLogin, exigirNaPasta('gerir'), async (req, res, next) => {
  try {
    const { usuarioId, nivel, expiraEm } = req.body;
    await pastasSrv.definirPermissaoUsuario(
      req.params.id, usuarioId, nivel, expiraEm || null, req.usuario
    );
    req.flash('sucesso', 'Permissão individual registrada.');
    res.redirect(`/pastas/${req.params.id}/permissoes`);
  } catch (erro) { next(erro); }
});

rotas.post('/pastas/:id/permissoes/:permissaoId/remover', exigirLogin, exigirNaPasta('gerir'), async (req, res, next) => {
  try {
    await pastasSrv.removerPermissao(req.params.permissaoId, req.usuario);
    req.flash('sucesso', 'Regra removida.');
    res.redirect(`/pastas/${req.params.id}/permissoes`);
  } catch (erro) { next(erro); }
});

module.exports = rotas;
