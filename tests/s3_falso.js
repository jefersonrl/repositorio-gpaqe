'use strict';
/**
 * Servidor de objetos mínimo, compatível com o protocolo S3 no que a aplicação
 * usa: PUT, GET, HEAD e DELETE de objeto, no estilo de caminho. Serve para
 * conferir o adaptador S3 sem depender de conta em nuvem, e para registrar
 * quais cabeçalhos a biblioteca da AWS envia, que é onde costumam aparecer as
 * incompatibilidades com Cloudflare R2, Backblaze B2 e MinIO antigo.
 *
 *   node tests/s3_falso.js
 */
const http = require('http');
const objetos = new Map();
const cabecalhosVistos = new Set();

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const chave = decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ''));

  for (const nome of Object.keys(req.headers)) {
    if (nome.startsWith('x-amz-')) cabecalhosVistos.add(nome);
  }

  if (req.method === 'PUT') {
    const partes = [];
    req.on('data', p => partes.push(p));
    req.on('end', () => {
      objetos.set(chave, Buffer.concat(partes));
      res.writeHead(200, { ETag: '"falso"' });
      res.end();
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const conteudo = objetos.get(chave);
    if (!conteudo) { res.writeHead(404); return res.end(); }
    const assinado = url.searchParams.has('X-Amz-Signature');
    res.writeHead(200, {
      'content-length': conteudo.length,
      'content-disposition': url.searchParams.get('response-content-disposition') || '',
      'x-assinatura-recebida': assinado ? 'sim' : 'nao'
    });
    return res.end(req.method === 'HEAD' ? undefined : conteudo);
  }

  if (req.method === 'DELETE') {
    objetos.delete(chave);
    res.writeHead(204);
    return res.end();
  }

  res.writeHead(405);
  res.end();
});

servidor.listen(9000, () => console.log('S3 falso em http://localhost:9000'));

process.on('SIGTERM', () => {
  console.log('cabeçalhos x-amz recebidos:', [...cabecalhosVistos].sort().join(', '));
  process.exit(0);
});

module.exports = { objetos, cabecalhosVistos };
