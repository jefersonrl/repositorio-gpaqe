'use strict';
const crypto = require('crypto');
const path = require('path');
const config = require('../../config');

const driver = config.armazenamento.driver === 's3'
  ? require('./s3')
  : require('./local');

// A chave nunca usa o nome enviado pelo usuário: evita colisão e travessia de caminho.
function novaChave(projetoId, arquivoId, nomeOriginal) {
  const data = new Date();
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const extensao = path.extname(nomeOriginal || '').toLowerCase().slice(0, 12);
  const aleatorio = crypto.randomBytes(12).toString('hex');
  return `projeto-${projetoId || 'grupo'}/${ano}/${mes}/${arquivoId}-${aleatorio}${extensao}`;
}

module.exports = { ...driver, novaChave };
