'use strict';

function naoEncontrado(req, res, next) {
  next(Object.assign(new Error('Página não encontrada.'), { status: 404 }));
}

function tratarErro(erro, req, res, next) { // eslint-disable-line no-unused-vars
  const status = erro.status || 500;
  if (status >= 500) console.error(erro);
  res.status(status);
  if (req.accepts('html')) {
    return res.render('pages/erro', {
      titulo: `Erro ${status}`,
      status,
      mensagem: status >= 500 ? 'Ocorreu um erro inesperado.' : erro.message
    });
  }
  res.json({ erro: status >= 500 ? 'Erro inesperado.' : erro.message });
}

module.exports = { naoEncontrado, tratarErro };
