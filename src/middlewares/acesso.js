'use strict';
const permissoes = require('../services/permissoes');

/**
 * Confere o nível do usuário na pasta antes de qualquer controlador rodar.
 * Nenhuma verificação de permissão fica apenas na interface.
 */
function exigirNaPasta(capacidade, origem = 'params', campo = 'id') {
  return async function (req, res, next) {
    try {
      const pastaId = Number(req[origem][campo]);
      if (!pastaId) return next(Object.assign(new Error('Pasta não informada.'), { status: 400 }));

      const acesso = await permissoes.contextoDeAcesso(req.usuario, pastaId);
      if (!acesso) return next(Object.assign(new Error('Pasta não encontrada.'), { status: 404 }));

      const valor = acesso.cap[capacidade];
      // "proprio" é decidido depois, no controlador, conforme o autor do item
      if (!valor) {
        return next(Object.assign(new Error('Você não tem acesso a esta pasta.'), { status: 403 }));
      }
      req.acesso = acesso;
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

module.exports = { exigirNaPasta };
