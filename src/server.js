'use strict';
const app = require('./app');
const config = require('./config');

async function iniciar() {
  // Em hospedagem sem acesso ao terminal, MIGRAR_AO_SUBIR=true faz a aplicação
  // preparar o banco na primeira subida. A operação é idempotente.
  if (config.migrarAoSubir) {
    try {
      await require('../db/migrar')({ comProjetos: config.modoDemonstracao });
    } catch (erro) {
      console.error('Falha ao preparar o banco:', erro.message);
    }
  }

  app.listen(config.porta, '0.0.0.0', () => {
    console.log(`Repositório GPAQE em ${config.baseUrl} (ambiente ${config.ambiente})`);
    console.log(`Armazenamento: ${config.armazenamento.driver}`);
    if (config.modoDemonstracao) {
      console.log('Modo de demonstração ativo: a tela de entrada mostra as contas de exemplo.');
    }
  });
}

iniciar();
