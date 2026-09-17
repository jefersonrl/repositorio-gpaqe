'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { pool } = require('./config/db');
const { carregarUsuario } = require('./middlewares/auth');
const csrf = require('./middlewares/csrf');
const { naoEncontrado, tratarErro } = require('./middlewares/erros');

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(methodOverride('_metodo'));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

app.use(session({
  name: 'gpaqe.sid',
  secret: config.segredoSessao,
  resave: false,
  saveUninitialized: false,
  store: new MySQLStore({ createDatabaseTable: true, clearExpired: true }, pool),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.ambiente === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(flash());
app.use(carregarUsuario);
app.use(csrf);

app.use((req, res, next) => {
  res.locals.sucesso = req.flash('sucesso');
  res.locals.erro = req.flash('erro');
  res.locals.caminhoAtual = req.path;
  res.locals.modoDemonstracao = config.modoDemonstracao;
  res.locals.tamanho = function (bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  };
  next();
});

// Usada pela hospedagem para conferir se a aplicação está no ar, e por um
// serviço de ping quando o plano gratuito hiberna por inatividade.
app.get('/saude', async (req, res) => {
  try {
    await require('./config/db').consultar('SELECT 1');
    res.json({ situacao: 'ok', banco: 'ok' });
  } catch (erro) {
    res.status(503).json({ situacao: 'degradado', banco: 'indisponivel' });
  }
});

app.use(require('./rotas/publico'));
app.use(require('./rotas/autenticacao'));
app.use(require('./rotas/convites'));
app.use(require('./rotas/objetos'));
app.use(require('./rotas/painel'));
app.use(require('./rotas/projetos'));
app.use(require('./rotas/pastas'));
app.use(require('./rotas/arquivos'));

app.use(naoEncontrado);
app.use(tratarErro);

module.exports = app;
