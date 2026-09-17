'use strict';
/**
 * Carga inicial pelo terminal. Cria o administrador do sistema, uma conta de
 * exemplo por perfil e os dois projetos, com as 16 pastas e a matriz aplicada.
 *
 *   node db/seed_projetos.js
 */
const carregar = require('./seed_projetos_lib');
const { pool } = require('../src/config/db');

carregar()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(erro => { console.error(erro); process.exit(1); });
