'use strict';
const app = require('./app');
const config = require('./config');

// Falha de rede ou banco fora do ar não deve derrubar o processo: a aplicação
// continua respondendo, /saude passa a indicar banco indisponível, e o serviço
// volta ao normal sozinho quando o banco retorna.
const ERROS_DE_CONEXAO = [
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN',
  'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR'
];

process.on('unhandledRejection', (motivo) => {
  console.error('Promessa rejeitada sem tratamento:', (motivo && (motivo.code || motivo.message)) || motivo);
});

process.on('uncaughtException', (erro) => {
  if (ERROS_DE_CONEXAO.includes(erro.code)) {
    console.error('Falha de conexão, a aplicação continua no ar:', erro.code);
    return;
  }
  console.error('Erro não tratado, encerrando:', erro);
  process.exit(1);
});

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
