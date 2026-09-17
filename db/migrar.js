'use strict';
/**
 * Prepara o banco em um ambiente onde não há acesso ao terminal do MySQL,
 * que é o caso das hospedagens gratuitas. É seguro rodar mais de uma vez:
 * o que já existe é preservado.
 *
 *   node db/migrar.js            cria as tabelas e carrega perfis e modelo
 *   node db/migrar.js --projetos carrega também os dois projetos de exemplo
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

const arquivo = (nome) => fs.readFileSync(path.join(__dirname, nome), 'utf8');

async function migrar({ comProjetos = false } = {}) {
  const conexao = await mysql.createConnection({ ...config.banco, multipleStatements: true });
  let projetosExistentes = 0;
  try {
    const [tabelas] = await conexao.query(
      `SELECT COUNT(*) AS total FROM information_schema.tables
        WHERE table_schema = ? AND table_name = 'permissao'`,
      [config.banco.database]
    );
    if (tabelas[0].total > 0) {
      console.log('Estrutura já existe. Nada foi alterado.');
    } else {
      console.log('Criando as tabelas...');
      await conexao.query(arquivo('schema.sql'));
      console.log('Carregando perfis, modelo de pastas e matriz RACI...');
      await conexao.query(arquivo('seed.sql'));
      console.log('Banco preparado.');
    }

    const [projetos] = await conexao.query('SELECT COUNT(*) AS total FROM projeto');
    projetosExistentes = projetos[0].total;
  } finally {
    await conexao.end();
  }

  if (comProjetos) {
    if (projetosExistentes > 0) {
      console.log('Já existem projetos. A carga de exemplo foi pulada.');
    } else {
      console.log('Carregando os projetos de exemplo...');
      await require('./seed_projetos_lib')();
    }
  }
}

if (require.main === module) {
  migrar({ comProjetos: process.argv.includes('--projetos') })
    .then(() => process.exit(0))
    .catch(erro => { console.error(erro); process.exit(1); });
}

module.exports = migrar;
