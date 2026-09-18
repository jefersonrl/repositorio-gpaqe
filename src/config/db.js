'use strict';
const mysql = require('mysql2/promise');
const config = require('./index');

const pool = mysql.createPool({
  ...config.banco,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: false,
  dateStrings: false
});

// Banco em nuvem cai e volta: o plano gratuito do Aiven desliga por inatividade,
// e a rede oscila. Sem este ouvinte, um erro de conexão sobe como exceção não
// tratada e derruba a aplicação inteira, em vez de apenas falhar a requisição.
pool.on('error', (erro) => {
  console.error('Erro na conexão com o banco:', erro.code || erro.message);
});

// Toda consulta usa instrução preparada. Nunca concatenar valor em SQL.
async function consultar(sql, params = []) {
  const [linhas] = await pool.execute(sql, params);
  return linhas;
}

async function umaLinha(sql, params = []) {
  const linhas = await consultar(sql, params);
  return linhas[0] || null;
}

async function executar(sql, params = []) {
  const [resultado] = await pool.execute(sql, params);
  return resultado;
}

async function comTransacao(fn) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const retorno = await fn({
      consultar: async (sql, p = []) => (await conexao.execute(sql, p))[0],
      umaLinha: async (sql, p = []) => ((await conexao.execute(sql, p))[0] || [])[0] || null,
      executar: async (sql, p = []) => (await conexao.execute(sql, p))[0]
    });
    await conexao.commit();
    return retorno;
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
}

module.exports = { pool, consultar, umaLinha, executar, comTransacao };
