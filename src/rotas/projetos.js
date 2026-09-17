'use strict';
const express = require('express');
const projetosSrv = require('../services/projetos');
const pastasSrv = require('../services/pastas');
const arquivosSrv = require('../services/arquivos');
const convitesSrv = require('../services/convites');
const auditoriaSrv = require('../services/auditoria');
const permissoes = require('../services/permissoes');
const usuarios = require('../services/usuarios');
const { exigirLogin, exigirAdminSistema } = require('../middlewares/auth');

const rotas = express.Router();

/** Carrega o projeto e o perfil de quem está acessando. */
async function contextoProjeto(req, res, next) {
  const projeto = await projetosSrv.porId(req.params.id);
  if (!projeto) return next(Object.assign(new Error('Projeto não encontrado.'), { status: 404 }));
  const vinculo = await permissoes.perfilDoUsuario(req.usuario.id, projeto.id);
  if (!vinculo && !req.usuario.admin_sistema) {
    return next(Object.assign(new Error('Você não participa deste projeto.'), { status: 403 }));
  }
  req.projeto = projeto;
  req.perfil = vinculo ? vinculo.perfil : null;
  req.ehCoordenacao = req.usuario.admin_sistema || req.perfil === 1;
  res.locals.projeto = projeto;
  res.locals.perfil = req.perfil;
  res.locals.ehCoordenacao = req.ehCoordenacao;
  next();
}

function exigirCoordenacao(req, res, next) {
  if (!req.ehCoordenacao) {
    return next(Object.assign(new Error('Ação restrita ao Perfil 1.'), { status: 403 }));
  }
  next();
}

rotas.post('/projetos', exigirLogin, exigirAdminSistema, async (req, res, next) => {
  try {
    const id = await projetosSrv.criar(req.body, req.usuario);
    req.flash('sucesso', 'Projeto criado com a estrutura padrão de 16 pastas.');
    res.redirect(`/projetos/${id}`);
  } catch (erro) {
    req.flash('erro', erro.code === 'ER_DUP_ENTRY' ? 'Já existe projeto com essa sigla.' : erro.message);
    res.redirect('/');
  }
});

rotas.get('/projetos/:id', exigirLogin, contextoProjeto, async (req, res, next) => {
  try {
    const contexto = await permissoes.carregarContexto(req.projeto.id);
    const raizes = contexto.pastas
      .filter(p => !p.pai_id)
      .map(p => ({ ...p, nivel: permissoes.resolverNivel(contexto, p.id, req.usuario, req.perfil) }))
      .filter(p => permissoes.capacidades(p.nivel).ver);
    res.render('pages/projeto', {
      titulo: req.projeto.nome,
      raizes,
      nucleos: await projetosSrv.nucleos(req.projeto.id)
    });
  } catch (erro) { next(erro); }
});

rotas.get('/projetos/:id/pessoas', exigirLogin, contextoProjeto, async (req, res, next) => {
  try {
    res.render('pages/pessoas', {
      titulo: 'Pessoas e perfis',
      vinculos: await projetosSrv.vinculos(req.projeto.id),
      nucleos: await projetosSrv.nucleos(req.projeto.id),
      cadastradas: req.ehCoordenacao ? await usuarios.listar() : []
    });
  } catch (erro) { next(erro); }
});

rotas.post('/projetos/:id/pessoas', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    const { usuarioId, perfil, nucleoId, inicio, fim } = req.body;
    await projetosSrv.salvarVinculo(
      { projetoId: req.projeto.id, usuarioId, perfil, nucleoId, inicio, fim }, req.usuario
    );
    req.flash('sucesso', 'Vínculo salvo.');
    res.redirect(`/projetos/${req.projeto.id}/pessoas`);
  } catch (erro) { next(erro); }
});

rotas.post('/projetos/:id/pessoas/:usuarioId/encerrar', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    await projetosSrv.encerrarVinculo(req.projeto.id, req.params.usuarioId, req.usuario);
    req.flash('sucesso', 'Vínculo encerrado.');
    res.redirect(`/projetos/${req.projeto.id}/pessoas`);
  } catch (erro) { next(erro); }
});

rotas.post('/projetos/:id/nucleos', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    await projetosSrv.criarNucleo(req.projeto.id, req.body.nome, req.usuario);
    req.flash('sucesso', 'Núcleo criado com as subpastas padrão.');
    res.redirect(`/projetos/${req.projeto.id}`);
  } catch (erro) { next(erro); }
});

rotas.get('/projetos/:id/lixeira', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    res.render('pages/lixeira', {
      titulo: 'Lixeira',
      itens: await arquivosSrv.lixeiraDoProjeto(req.projeto.id),
      diasCarencia: arquivosSrv.DIAS_CARENCIA
    });
  } catch (erro) { next(erro); }
});

rotas.get('/projetos/:id/acessos', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    const dados = await pastasSrv.relatorioAcessos(req.projeto.id);
    res.render('pages/acessos', { titulo: 'Relatório de acessos', ...dados });
  } catch (erro) { next(erro); }
});

rotas.get('/projetos/:id/auditoria', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    const { de, ate, acao } = req.query;
    const registros = await auditoriaSrv.listar({ projetoId: req.projeto.id, de, ate });
    res.render('pages/auditoria', {
      titulo: 'Auditoria',
      registros: acao ? registros.filter(r => r.acao === acao) : registros,
      filtros: { de: de || '', ate: ate || '', acao: acao || '' }
    });
  } catch (erro) { next(erro); }
});

rotas.get('/projetos/:id/convites', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    const contexto = await permissoes.carregarContexto(req.projeto.id);
    res.render('pages/convites', {
      titulo: 'Convites externos',
      convites: await convitesSrv.listar(req.projeto.id),
      pastas: contexto.pastas
    });
  } catch (erro) { next(erro); }
});

rotas.post('/projetos/:id/convites', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    const convite = await convitesSrv.criar({ ...req.body, projetoId: req.projeto.id }, req.usuario);
    req.flash('sucesso', `Convite criado. Envie este endereço para a pessoa: ${convite.url}`);
    res.redirect(`/projetos/${req.projeto.id}/convites`);
  } catch (erro) { next(erro); }
});

rotas.post('/projetos/:id/convites/:conviteId/revogar', exigirLogin, contextoProjeto, exigirCoordenacao, async (req, res, next) => {
  try {
    await convitesSrv.revogar(req.params.conviteId, req.usuario);
    req.flash('sucesso', 'Convite revogado e acesso retirado.');
    res.redirect(`/projetos/${req.projeto.id}/convites`);
  } catch (erro) { next(erro); }
});

module.exports = rotas;
