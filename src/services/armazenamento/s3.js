'use strict';
const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../../config');

const s3cfg = config.armazenamento.s3;
const cliente = new S3Client({
  region: s3cfg.region,
  endpoint: s3cfg.endpoint,
  forcePathStyle: s3cfg.forcePathStyle,
  credentials: s3cfg.accessKeyId
    ? { accessKeyId: s3cfg.accessKeyId, secretAccessKey: s3cfg.secretAccessKey }
    : undefined,
  // Desde a versão 3.729 a biblioteca da AWS envia, por padrão, o corpo em
  // pedaços com soma de verificação no final (cabeçalhos x-amz-trailer e
  // x-amz-decoded-content-length). A Amazon entende, mas Cloudflare R2,
  // Backblaze B2 e instalações antigas do MinIO recusam ou gravam o conteúdo
  // errado. Pedindo a soma apenas quando a operação exige, o envio volta a ser
  // um corpo simples, aceito por todos.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED'
});

module.exports = {
  nome: 's3',

  async salvar(chave, caminhoOrigem) {
    await cliente.send(new PutObjectCommand({
      Bucket: s3cfg.bucket,
      Key: chave,
      Body: fs.createReadStream(caminhoOrigem)
    }));
    await fs.promises.unlink(caminhoOrigem).catch(() => {});
    return chave;
  },

  async remover(chave) {
    await cliente.send(new DeleteObjectCommand({ Bucket: s3cfg.bucket, Key: chave }));
  },

  async existe(chave) {
    try {
      await cliente.send(new HeadObjectCommand({ Bucket: s3cfg.bucket, Key: chave }));
      return true;
    } catch {
      return false;
    }
  },

  async urlDownload(chave, nomeArquivo) {
    const comando = new GetObjectCommand({
      Bucket: s3cfg.bucket,
      Key: chave,
      ResponseContentDisposition:
        `attachment; filename="${String(nomeArquivo || 'arquivo').replace(/"/g, '')}"`
    });
    return getSignedUrl(cliente, comando, {
      expiresIn: config.armazenamento.minutosUrlAssinada * 60
    });
  },

  validarAssinatura() {
    // No S3 a validação é feita pelo próprio provedor.
    return false;
  },

  fluxoLeitura() {
    throw new Error('Leitura direta não se aplica ao driver S3.');
  }
};
