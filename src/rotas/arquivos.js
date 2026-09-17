'use strict';
const express = require('express');
const arquivosSrv = require('../services/arquivos');
const permissoes = require('../services/permissoes');
const armazenamento = require('../services/armazenamento');
const auditoria = require('../services/auditoria');
const upload = require('../middlewares/upload');
const { exigirLogin } = require('../middlewares/auth');
const { exigirNaPasta } = require('../middlewares/acesso');
const { verificarEnvio } = require('../middlewares/csrf');

const rotas = express.Router();

/** Acesso ao arquivo passa pelo nível resolvido na pasta que o contém. */
async function acessoAoArquivo(req, res, next) {
  const arquivo = await arquivosSrv.porId(req.params.id);
  if (!arquivo) return next(Object.assign(new Error('Arquivo não encontrado.'), { status: 404 }));
  const acesso = await permissoes.contextoDeAcesso(req.usuario, arquivo.pasta_id);
  if (!acesso || !acesso.cap.ver) {
    return next(Object.assign(new Error('Você não tem acesso a este arquivo.'), { status: 403 }));
  }
  // sob R* a pessoa só enxerga o que ela mesma enviou
  if (acesso.nivel === 'R*' && arquivo.criado_por !== req.usuario.id && !req.usuario.admin_sistema) {
    return next(Object.assign(new Error('Você não tem acesso a este arquivo.'), { status: 403 }));
  }
  req.arquivo = arquivo;
  req.acesso = acesso;
  next();
}

function permite(cap, chave, arquivo, usuario) {
  const valor = cap[chave];
  if (valor === 'todos') return true;
  if (valor === 'proprio') return arquivo.criado_por === usuario.id;
  return Boolean(valor);
}

rotas.post('/pastas/:id/arquivos', exigirLogin, exigirNaPasta('enviar'), upload.single('arquivo'), verificarEnvio, async (req, res, next) => {
  try {
    if (!req.file) {
      req.flash('erro', 'Selecione um arquivo.');
      return res.redirect(`/pastas/${req.params.id}`);
    }
    await arquivosSrv.criarComVersao({
      pastaId: req.params.id,
      nome: (req.body.nome || req.file.originalname).slice(0, 255),
      descricao: req.body.descricao,
      arquivoTemporario: req.file.path,
      nomeOriginal: req.file.originalname,
      tipoMime: req.file.mimetype,
      tamanho: req.file.size,
      comentario: req.body.comentario
    }, req.usuario);
    req.flash('sucesso', 'Arquivo enviado.');
    res.redirect(`/pastas/${req.params.id}`);
  } catch (erro) { next(erro); }
});

rotas.get('/arquivos/:id', exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    const alvoId = req.arquivo.atalho_para || req.arquivo.id;
    res.render('pages/arquivo', {
      titulo: req.arquivo.nome,
      arquivo: req.arquivo,
      versoes: await arquivosSrv.versoes(alvoId),
      metadados: await arquivosSrv.metadados(req.arquivo.id),
      nivel: req.acesso.nivel,
      cap: req.acesso.cap,
      podeBaixar: permite(req.acesso.cap, 'baixar', req.arquivo, req.usuario),
      podeVersionar: permite(req.acesso.cap, 'versionar', req.arquivo, req.usuario),
      podeExcluir: permite(req.acesso.cap, 'excluir', req.arquivo, req.usuario)
    });
  } catch (erro) { next(erro); }
});

rotas.get(['/arquivos/:id/baixar', '/arquivos/:id/baixar/:versao'], exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    if (!permite(req.acesso.cap, 'baixar', req.arquivo, req.usuario)) {
      return next(Object.assign(new Error('Você não pode baixar este arquivo.'), { status: 403 }));
    }
    const alvoId = req.arquivo.atalho_para || req.arquivo.id;
    const lista = await arquivosSrv.versoes(alvoId);
    const versao = req.params.versao
      ? lista.find(v => String(v.numero) === String(req.params.versao))
      : lista[0];
    if (!versao) return next(Object.assign(new Error('Versão não encontrada.'), { status: 404 }));

    await auditoria.registrar({
      usuarioId: req.usuario.id, acao: 'download', entidade: 'arquivo',
      entidadeId: req.arquivo.id, projetoId: req.arquivo.projeto_id,
      detalhe: `versão ${versao.numero}`, ip: req.ip
    });
    const url = await armazenamento.urlDownload(versao.chave_objeto, versao.nome_original);
    res.redirect(url);
  } catch (erro) { next(erro); }
});

rotas.post('/arquivos/:id/versoes', exigirLogin, acessoAoArquivo, upload.single('arquivo'), verificarEnvio, async (req, res, next) => {
  try {
    if (!permite(req.acesso.cap, 'versionar', req.arquivo, req.usuario)) {
      return next(Object.assign(new Error('Você não pode alterar este arquivo.'), { status: 403 }));
    }
    if (!req.file) {
      req.flash('erro', 'Selecione o arquivo da nova versão.');
      return res.redirect(`/arquivos/${req.arquivo.id}`);
    }
    await arquivosSrv.novaVersao(req.arquivo.id, {
      arquivoTemporario: req.file.path,
      nomeOriginal: req.file.originalname,
      tipoMime: req.file.mimetype,
      tamanho: req.file.size,
      comentario: req.body.comentario
    }, req.usuario);
    req.flash('sucesso', 'Nova versão registrada.');
    res.redirect(`/arquivos/${req.arquivo.id}`);
  } catch (erro) { next(erro); }
});

rotas.post('/arquivos/:id/excluir', exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    if (!permite(req.acesso.cap, 'excluir', req.arquivo, req.usuario)) {
      return next(Object.assign(new Error('Você não pode excluir este arquivo.'), { status: 403 }));
    }
    await arquivosSrv.paraLixeira(req.arquivo.id, req.usuario);
    req.flash('sucesso', 'Arquivo enviado para a lixeira.');
    res.redirect(`/pastas/${req.arquivo.pasta_id}`);
  } catch (erro) { next(erro); }
});

rotas.post('/arquivos/:id/restaurar', exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    if (req.acesso.nivel !== 'A') {
      return next(Object.assign(new Error('Só o Perfil 1 restaura arquivo.'), { status: 403 }));
    }
    await arquivosSrv.restaurar(req.arquivo.id, req.usuario);
    req.flash('sucesso', 'Arquivo restaurado.');
    res.redirect(`/projetos/${req.arquivo.projeto_id}/lixeira`);
  } catch (erro) { next(erro); }
});

rotas.post('/arquivos/:id/definitivo', exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    if (!req.acesso.cap.excluirDefinitivo) {
      return next(Object.assign(new Error('Só o Perfil 1 exclui em definitivo.'), { status: 403 }));
    }
    await arquivosSrv.excluirDefinitivo(req.arquivo.id, req.usuario);
    req.flash('sucesso', 'Arquivo removido em definitivo.');
    res.redirect(`/projetos/${req.arquivo.projeto_id}/lixeira`);
  } catch (erro) { next(erro); }
});

rotas.post('/arquivos/:id/metadados', exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    if (!permite(req.acesso.cap, 'versionar', req.arquivo, req.usuario)) {
      return next(Object.assign(new Error('Você não pode editar este arquivo.'), { status: 403 }));
    }
    await arquivosSrv.salvarMetadado(req.arquivo.id, req.body.chave, req.body.valor, req.usuario);
    res.redirect(`/arquivos/${req.arquivo.id}`);
  } catch (erro) { next(erro); }
});

rotas.post('/arquivos/:id/metadados/:metaId/remover', exigirLogin, acessoAoArquivo, async (req, res, next) => {
  try {
    await arquivosSrv.removerMetadado(req.params.metaId, req.usuario);
    res.redirect(`/arquivos/${req.arquivo.id}`);
  } catch (erro) { next(erro); }
});

/** Atalho para a pasta canônica: exige escrita no destino e leitura na origem. */
rotas.post('/pastas/:id/atalhos', exigirLogin, exigirNaPasta('organizar'), async (req, res, next) => {
  try {
    const origem = await arquivosSrv.porId(req.body.arquivoId);
    if (!origem) throw Object.assign(new Error('Arquivo de origem não encontrado.'), { status: 404 });
    const acessoOrigem = await permissoes.contextoDeAcesso(req.usuario, origem.pasta_id);
    if (!acessoOrigem || !acessoOrigem.cap.ver) {
      throw Object.assign(new Error('Você não tem acesso ao arquivo de origem.'), { status: 403 });
    }
    await arquivosSrv.criarAtalho(
      { pastaId: req.params.id, arquivoAlvoId: origem.id, nome: req.body.nome }, req.usuario
    );
    req.flash('sucesso', 'Atalho criado. O conteúdo continua na pasta canônica.');
    res.redirect(`/pastas/${req.params.id}`);
  } catch (erro) {
    req.flash('erro', erro.message);
    res.redirect(`/pastas/${req.params.id}`);
  }
});

module.exports = rotas;
