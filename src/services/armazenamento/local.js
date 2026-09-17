'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');

const raiz = path.resolve(config.armazenamento.dirLocal);

function caminhoDe(chave) {
  const destino = path.resolve(raiz, chave);
  // impede que uma chave manipulada escape do diretório de armazenamento
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) {
    throw new Error('Chave de objeto inválida.');
  }
  return destino;
}

function assinar(chave, expiraEm) {
  return crypto
    .createHmac('sha256', config.segredoSessao)
    .update(`${chave}|${expiraEm}`)
    .digest('hex');
}

module.exports = {
  nome: 'local',

  async salvar(chave, caminhoOrigem) {
    const destino = caminhoDe(chave);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.copyFile(caminhoOrigem, destino);
    await fsp.unlink(caminhoOrigem).catch(() => {});
    return chave;
  },

  async remover(chave) {
    await fsp.unlink(caminhoDe(chave)).catch(() => {});
  },

  async existe(chave) {
    try {
      await fsp.access(caminhoDe(chave));
      return true;
    } catch {
      return false;
    }
  },

  // Equivale à URL assinada do S3: vale por poucos minutos e não pode ser forjada.
  async urlDownload(chave, nomeArquivo) {
    const expiraEm = Date.now() + config.armazenamento.minutosUrlAssinada * 60 * 1000;
    const assinatura = assinar(chave, expiraEm);
    const params = new URLSearchParams({
      chave, exp: String(expiraEm), sig: assinatura, nome: nomeArquivo || 'arquivo'
    });
    return `/objetos?${params.toString()}`;
  },

  validarAssinatura(chave, exp, sig) {
    const expiraEm = Number(exp);
    if (!Number.isFinite(expiraEm) || expiraEm < Date.now()) return false;
    const esperado = assinar(chave, expiraEm);
    const a = Buffer.from(String(sig || ''), 'utf8');
    const b = Buffer.from(esperado, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  fluxoLeitura(chave) {
    return fs.createReadStream(caminhoDe(chave));
  }
};
