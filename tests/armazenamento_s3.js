'use strict';
/**
 * Confere o adaptador de armazenamento S3 contra um servidor compatível.
 * Por padrão usa o servidor falso de tests/s3_falso.js, então roda sem conta
 * em nuvem. Para conferir uma conta real, por exemplo o Cloudflare R2,
 * preencha as variáveis S3_* no .env e rode este mesmo arquivo.
 *
 *   node tests/s3_falso.js &
 *   STORAGE_DRIVER=s3 S3_BUCKET=teste S3_ENDPOINT=http://localhost:9000 \
 *   S3_ACCESS_KEY_ID=chave S3_SECRET_ACCESS_KEY=segredo node tests/armazenamento_s3.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 's3';
const armazenamento = require('../src/services/armazenamento');
const config = require('../src/config');

let passou = 0, falhou = 0;
function verificar(descricao, condicao, extra = '') {
  if (condicao) { passou++; console.log(`  ok   ${descricao}`); }
  else { falhou++; console.log(`  FALHOU ${descricao} ${extra}`); }
}

(async function () {
  console.log(`\nAdaptador: ${armazenamento.nome} | endpoint: ${config.armazenamento.s3.endpoint || 'padrão da AWS'}`);
  verificar('Driver S3 está ativo', armazenamento.nome === 's3');

  const conteudo = 'coluna_a;coluna_b\n1;2\n';
  const temporario = path.join(os.tmpdir(), `teste-${Date.now()}.csv`);
  fs.writeFileSync(temporario, conteudo);

  const chave = armazenamento.novaChave(1, 99, 'base.csv');
  console.log(`  chave gerada: ${chave}`);

  await armazenamento.salvar(chave, temporario);
  verificar('Envio do objeto concluído', true);
  verificar('Arquivo temporário foi removido depois do envio', !fs.existsSync(temporario));
  verificar('Objeto existe no armazenamento', await armazenamento.existe(chave));

  const url = await armazenamento.urlDownload(chave, 'base.csv');
  verificar('URL assinada foi gerada', typeof url === 'string' && url.includes('X-Amz-Signature'));
  verificar('URL aponta para o objeto correto', url.includes(encodeURIComponent(chave).replace(/%2F/g, '/')));

  const resposta = await fetch(url);
  const baixado = await resposta.text();
  verificar('Download pela URL assinada funciona', resposta.status === 200, `status ${resposta.status}`);
  verificar('Conteúdo baixado confere com o enviado', baixado === conteudo);
  verificar('Nome original vai no cabeçalho de download',
    String(resposta.headers.get('content-disposition') || '').includes('base.csv'));

  await armazenamento.remover(chave);
  verificar('Objeto removido', !(await armazenamento.existe(chave)));

  console.log(`\nResumo: ${passou} verificações passaram, ${falhou} falharam.\n`);
  process.exit(falhou ? 1 : 0);
})().catch(erro => { console.error(erro); process.exit(1); });
