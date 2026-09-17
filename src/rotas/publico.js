'use strict';
const express = require('express');
const { consultar, umaLinha } = require('../config/db');
const arquivosSrv = require('../services/arquivos');
const armazenamento = require('../services/armazenamento');

const rotas = express.Router();

/**
 * Área pública: apenas pastas marcadas como públicas e o que está dentro
 * delas. Não há sessão, não há listagem de nada além disso.
 */
rotas.get('/publico', async (req, res, next) => {
  try {
    const projetos = await consultar(
      `SELECT p.id, p.nome, p.sigla, p.descricao, pa.id AS pasta_id
         FROM projeto p
         JOIN pasta pa ON pa.projeto_id = p.id AND pa.publica = 1 AND pa.pai_id IS NULL
        WHERE p.situacao = 'ativo'
        ORDER BY p.nome`
    );
    res.render('pages/publico', { titulo: 'Projetos do GPAQE', projetos });
  } catch (erro) { next(erro); }
});

rotas.get('/publico/pastas/:id', async (req, res, next) => {
  try {
    const pasta = await umaLinha('SELECT * FROM pasta WHERE id = ? AND publica = 1', [req.params.id]);
    if (!pasta) return next(Object.assign(new Error('Conteúdo não disponível.'), { status: 404 }));
    const projeto = await umaLinha('SELECT * FROM projeto WHERE id = ?', [pasta.projeto_id]);
    const arquivos = await consultar(
      `SELECT a.id, a.nome, a.descricao, v.tamanho_bytes, v.enviado_em
         FROM arquivo a
         LEFT JOIN versao_arquivo v ON v.id = (
              SELECT id FROM versao_arquivo WHERE arquivo_id = a.id ORDER BY numero DESC LIMIT 1)
        WHERE a.pasta_id = ? AND a.estado = 'ativo'
        ORDER BY a.nome`,
      [pasta.id]
    );
    res.render('pages/publico_pasta', {
      titulo: projeto.nome, projeto, pasta, arquivos
    });
  } catch (erro) { next(erro); }
});

rotas.get('/publico/arquivos/:id/baixar', async (req, res, next) => {
  try {
    const arquivo = await umaLinha(
      `SELECT a.*, pa.publica FROM arquivo a JOIN pasta pa ON pa.id = a.pasta_id
        WHERE a.id = ? AND a.estado = 'ativo'`,
      [req.params.id]
    );
    if (!arquivo || !arquivo.publica) {
      return next(Object.assign(new Error('Conteúdo não disponível.'), { status: 404 }));
    }
    const versao = await arquivosSrv.versaoCorrente(arquivo.id);
    if (!versao) return next(Object.assign(new Error('Arquivo sem conteúdo.'), { status: 404 }));
    res.redirect(await armazenamento.urlDownload(versao.chave_objeto, versao.nome_original));
  } catch (erro) { next(erro); }
});

module.exports = rotas;
