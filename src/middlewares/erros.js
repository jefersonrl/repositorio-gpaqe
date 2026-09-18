'use strict';

function naoEncontrado(req, res, next) {
  next(Object.assign(new Error('Página não encontrada.'), { status: 404 }));
}

function tratarErro(erro, req, res, next) {
  const status = erro.status || 500;
  if (status >= 500) console.error(erro);

  // Se a resposta já começou a ser enviada, não dá para trocar o conteúdo.
  // Sem esta saída, a tentativa de renderizar a página de erro lança
  // ERR_HTTP_HEADERS_SENT fora do fluxo e derruba o processo.
  if (res.headersSent) return next(erro);

  const mensagem = status >= 500 ? 'Ocorreu um erro inesperado.' : erro.message;
  res.status(status);

  if (!req.accepts('html')) {
    return res.json({ erro: mensagem });
  }

  // A renderização vai pela função de retorno: se a própria página de erro
  // falhar, por exemplo por falta de banco, ainda respondemos em texto.
  res.render('pages/erro', { titulo: `Erro ${status}`, status, mensagem }, (erroRender, html) => {
    if (erroRender) {
      console.error('Falha ao renderizar a página de erro:', erroRender.message);
      return res.type('text/plain').send(mensagem);
    }
    res.send(html);
  });
}

module.exports = { naoEncontrado, tratarErro };
