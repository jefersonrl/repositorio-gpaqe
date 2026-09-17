'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { consultar, umaLinha, executar, comTransacao } = require('../config/db');
const armazenamento = require('./armazenamento');
const auditoria = require('./auditoria');
const config = require('../config');

function hashDoArquivo(caminho) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(caminho)
      .on('data', parte => hash.update(parte))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function porId(id) {
  return umaLinha(
    `SELECT a.*, pa.projeto_id, pa.nome AS pasta_nome, u.nome AS autor_nome
       FROM arquivo a
       JOIN pasta pa  ON pa.id = a.pasta_id
       JOIN usuario u ON u.id = a.criado_por
      WHERE a.id = ?`,
    [id]
  );
}

async function versoes(arquivoId) {
  return consultar(
    `SELECT v.*, u.nome AS autor_nome
       FROM versao_arquivo v
       JOIN usuario u ON u.id = v.enviado_por
      WHERE v.arquivo_id = ?
      ORDER BY v.numero DESC`,
    [arquivoId]
  );
}

async function versaoCorrente(arquivoId) {
  return umaLinha(
    'SELECT * FROM versao_arquivo WHERE arquivo_id = ? ORDER BY numero DESC LIMIT 1', [arquivoId]
  );
}

/**
 * Lista os arquivos visíveis de uma pasta. Sob o nível R* a pessoa só enxerga
 * o que ela própria enviou, conforme a definição de acesso restrito.
 */
async function listarDaPasta(pastaId, { nivel, usuarioId, incluirLixeira = false }) {
  const estados = incluirLixeira ? ['ativo', 'lixeira'] : ['ativo'];
  const marcadores = estados.map(() => '?').join(',');
  const params = [pastaId, ...estados];
  let filtroAutor = '';
  if (nivel === 'R*') {
    filtroAutor = ' AND a.criado_por = ?';
    params.push(usuarioId);
  }
  return consultar(
    `SELECT a.*, u.nome AS autor_nome,
            v.numero AS versao_numero, v.tamanho_bytes, v.tipo_mime, v.enviado_em,
            alvo.nome AS alvo_nome, alvo.id AS alvo_id
       FROM arquivo a
       JOIN usuario u ON u.id = a.criado_por
       LEFT JOIN arquivo alvo ON alvo.id = a.atalho_para
       LEFT JOIN versao_arquivo v ON v.id = (
            SELECT id FROM versao_arquivo WHERE arquivo_id = COALESCE(a.atalho_para, a.id)
             ORDER BY numero DESC LIMIT 1)
      WHERE a.pasta_id = ? AND a.estado IN (${marcadores})${filtroAutor}
      ORDER BY a.nome`,
    params
  );
}

/** Cria o arquivo e a primeira versão. O conteúdo vai para o armazenamento. */
async function criarComVersao({ pastaId, nome, descricao, arquivoTemporario, nomeOriginal, tipoMime, tamanho, comentario }, usuario) {
  const pasta = await umaLinha('SELECT * FROM pasta WHERE id = ?', [pastaId]);
  if (!pasta) throw Object.assign(new Error('Pasta não encontrada.'), { status: 404 });

  const hash = await hashDoArquivo(arquivoTemporario);
  const arquivoId = await comTransacao(async (tx) => {
    const res = await tx.executar(
      'INSERT INTO arquivo (pasta_id, nome, descricao, criado_por) VALUES (?, ?, ?, ?)',
      [pastaId, nome, descricao || null, usuario.id]
    );
    return res.insertId;
  });

  const chave = armazenamento.novaChave(pasta.projeto_id, arquivoId, nomeOriginal);
  await armazenamento.salvar(chave, arquivoTemporario);
  await executar(
    `INSERT INTO versao_arquivo
       (arquivo_id, numero, chave_objeto, nome_original, tamanho_bytes, hash_sha256, tipo_mime, comentario, enviado_por)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [arquivoId, chave, nomeOriginal, tamanho, hash, tipoMime || null, comentario || 'Versão inicial.', usuario.id]
  );

  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'envio', entidade: 'arquivo',
    entidadeId: arquivoId, projetoId: pasta.projeto_id, detalhe: `${nome} (versão 1)`
  });
  return arquivoId;
}

async function novaVersao(arquivoId, { arquivoTemporario, nomeOriginal, tipoMime, tamanho, comentario }, usuario) {
  const arquivo = await porId(arquivoId);
  if (!arquivo) throw Object.assign(new Error('Arquivo não encontrado.'), { status: 404 });
  if (arquivo.atalho_para) throw Object.assign(new Error('Atalho não recebe versão. Edite o arquivo original.'), { status: 400 });

  const hash = await hashDoArquivo(arquivoTemporario);
  const ultima = await versaoCorrente(arquivoId);
  const numero = (ultima ? ultima.numero : 0) + 1;
  const chave = armazenamento.novaChave(arquivo.projeto_id, arquivoId, nomeOriginal);
  await armazenamento.salvar(chave, arquivoTemporario);

  await executar(
    `INSERT INTO versao_arquivo
       (arquivo_id, numero, chave_objeto, nome_original, tamanho_bytes, hash_sha256, tipo_mime, comentario, enviado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [arquivoId, numero, chave, nomeOriginal, tamanho, hash, tipoMime || null, comentario || null, usuario.id]
  );
  await executar('UPDATE arquivo SET atualizado_em = NOW() WHERE id = ?', [arquivoId]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'nova_versao', entidade: 'arquivo',
    entidadeId: arquivoId, projetoId: arquivo.projeto_id, detalhe: `versão ${numero}`
  });
  return numero;
}

/** Atalho para a pasta canônica: referência, nunca cópia do conteúdo. */
async function criarAtalho({ pastaId, arquivoAlvoId, nome }, usuario) {
  const alvo = await porId(arquivoAlvoId);
  if (!alvo) throw Object.assign(new Error('Arquivo de origem não encontrado.'), { status: 404 });
  if (alvo.atalho_para) throw Object.assign(new Error('Não é possível criar atalho de atalho.'), { status: 400 });
  const pasta = await umaLinha('SELECT * FROM pasta WHERE id = ?', [pastaId]);

  const res = await executar(
    'INSERT INTO arquivo (pasta_id, nome, criado_por, atalho_para) VALUES (?, ?, ?, ?)',
    [pastaId, nome || alvo.nome, usuario.id, arquivoAlvoId]
  );
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'criar_atalho', entidade: 'arquivo',
    entidadeId: res.insertId, projetoId: pasta.projeto_id, detalhe: `para o arquivo ${arquivoAlvoId}`
  });
  return res.insertId;
}

async function paraLixeira(arquivoId, usuario) {
  const arquivo = await porId(arquivoId);
  await executar(
    "UPDATE arquivo SET estado = 'lixeira', excluido_em = NOW(), excluido_por = ? WHERE id = ?",
    [usuario.id, arquivoId]
  );
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'excluir', entidade: 'arquivo',
    entidadeId: arquivoId, projetoId: arquivo.projeto_id, detalhe: arquivo.nome
  });
}

async function restaurar(arquivoId, usuario) {
  const arquivo = await porId(arquivoId);
  await executar(
    "UPDATE arquivo SET estado = 'ativo', excluido_em = NULL, excluido_por = NULL WHERE id = ?", [arquivoId]
  );
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'restaurar', entidade: 'arquivo',
    entidadeId: arquivoId, projetoId: arquivo.projeto_id, detalhe: arquivo.nome
  });
}

/** Exclusão definitiva: só o Perfil 1 e só depois do prazo de carência. */
async function excluirDefinitivo(arquivoId, usuario) {
  const arquivo = await porId(arquivoId);
  if (!arquivo || arquivo.estado !== 'lixeira') {
    throw Object.assign(new Error('O arquivo precisa estar na lixeira.'), { status: 400 });
  }
  const listaVersoes = await versoes(arquivoId);
  for (const v of listaVersoes) await armazenamento.remover(v.chave_objeto);
  await executar("UPDATE arquivo SET estado = 'removido' WHERE id = ?", [arquivoId]);
  await executar('DELETE FROM versao_arquivo WHERE arquivo_id = ?', [arquivoId]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'excluir_definitivo', entidade: 'arquivo',
    entidadeId: arquivoId, projetoId: arquivo.projeto_id, detalhe: arquivo.nome
  });
}

async function lixeiraDoProjeto(projetoId) {
  return consultar(
    `SELECT a.*, pa.nome AS pasta_nome, u.nome AS excluido_por_nome,
            DATEDIFF(NOW(), a.excluido_em) AS dias_na_lixeira
       FROM arquivo a
       JOIN pasta pa ON pa.id = a.pasta_id
       LEFT JOIN usuario u ON u.id = a.excluido_por
      WHERE pa.projeto_id = ? AND a.estado = 'lixeira'
      ORDER BY a.excluido_em DESC`,
    [projetoId]
  );
}

// ------------------------------------------------------------- metadados
async function metadados(arquivoId) {
  return consultar('SELECT * FROM metadado WHERE arquivo_id = ? ORDER BY chave', [arquivoId]);
}

async function salvarMetadado(arquivoId, chave, valor, usuario) {
  const arquivo = await porId(arquivoId);
  await executar('INSERT INTO metadado (arquivo_id, chave, valor) VALUES (?, ?, ?)', [arquivoId, chave, valor]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'metadado', entidade: 'arquivo',
    entidadeId: arquivoId, projetoId: arquivo.projeto_id, detalhe: `${chave}: ${valor}`
  });
}

async function removerMetadado(id, usuario) {
  const meta = await umaLinha('SELECT * FROM metadado WHERE id = ?', [id]);
  if (!meta) return;
  await executar('DELETE FROM metadado WHERE id = ?', [id]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'remover_metadado', entidade: 'arquivo', entidadeId: meta.arquivo_id
  });
}

const DIAS_CARENCIA = config.diasCarenciaLixeira;

module.exports = {
  porId, versoes, versaoCorrente, listarDaPasta, criarComVersao, novaVersao, criarAtalho,
  paraLixeira, restaurar, excluirDefinitivo, lixeiraDoProjeto,
  metadados, salvarMetadado, removerMetadado, DIAS_CARENCIA
};
