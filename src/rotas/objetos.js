'use strict';
const express = require('express');
const armazenamento = require('../services/armazenamento');

const rotas = express.Router();

/**
 * Entrega o conteúdo quando o armazenamento é local. A URL só vale se a
 * assinatura conferir e o prazo não tiver vencido, o mesmo princípio da
 * URL assinada do S3. Não existe endereço fixo e público para um arquivo.
 */
rotas.get('/objetos', (req, res, next) => {
  try {
    const { chave, exp, sig, nome } = req.query;
    if (!armazenamento.validarAssinatura(chave, exp, sig)) {
      return next(Object.assign(new Error('Link expirado ou inválido.'), { status: 403 }));
    }
    res.setHeader('Content-Disposition',
      `attachment; filename="${String(nome || 'arquivo').replace(/[^\w.\-]/g, '_')}"`);
    armazenamento.fluxoLeitura(chave)
      .on('error', () => next(Object.assign(new Error('Arquivo não encontrado.'), { status: 404 })))
      .pipe(res);
  } catch (erro) { next(erro); }
});

module.exports = rotas;
