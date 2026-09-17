'use strict';
const { consultar } = require('../config/db');
const permissoes = require('./permissoes');

/**
 * Busca por nome, descrição e metadados. O filtro de acesso é aplicado depois
 * da consulta, pasta a pasta, para que ninguém encontre o que não pode ver.
 */
async function buscar(usuario, { termo, projetoId, tipo, ano, limite = 200 }) {
  const projetos = await consultar(
    `SELECT p.id, p.nome, p.sigla, v.perfil
       FROM vinculo v JOIN projeto p ON p.id = v.projeto_id
      WHERE v.usuario_id = ? AND v.revogado_em IS NULL AND (v.fim IS NULL OR v.fim >= CURDATE())`,
    [usuario.id]
  );
  if (!projetos.length && !usuario.admin_sistema) return [];

  const idsProjetos = usuario.admin_sistema
    ? (await consultar('SELECT id FROM projeto')).map(p => p.id)
    : projetos.map(p => p.id);
  const alvos = projetoId ? idsProjetos.filter(id => id === Number(projetoId)) : idsProjetos;
  if (!alvos.length) return [];

  const marcadores = alvos.map(() => '?').join(',');
  const params = [...alvos];
  let filtro = '';
  if (termo) {
    filtro += ` AND (a.nome LIKE ? OR a.descricao LIKE ? OR EXISTS (
                  SELECT 1 FROM metadado m WHERE m.arquivo_id = a.id AND m.valor LIKE ?))`;
    const curinga = `%${termo}%`;
    params.push(curinga, curinga, curinga);
  }
  if (tipo) { filtro += ` AND EXISTS (SELECT 1 FROM metadado m WHERE m.arquivo_id = a.id AND m.chave = 'tipo' AND m.valor = ?)`; params.push(tipo); }
  if (ano)  { filtro += ` AND EXISTS (SELECT 1 FROM metadado m WHERE m.arquivo_id = a.id AND m.chave = 'ano'  AND m.valor = ?)`; params.push(String(ano)); }

  const candidatos = await consultar(
    `SELECT a.id, a.nome, a.descricao, a.pasta_id, a.criado_por, a.atualizado_em,
            pa.nome AS pasta_nome, pa.projeto_id, pr.sigla AS projeto_sigla
       FROM arquivo a
       JOIN pasta pa   ON pa.id = a.pasta_id
       JOIN projeto pr ON pr.id = pa.projeto_id
      WHERE pa.projeto_id IN (${marcadores}) AND a.estado = 'ativo' ${filtro}
      ORDER BY a.atualizado_em DESC
      LIMIT ${Number(limite) || 200}`,
    params
  );

  const contextos = new Map();
  const perfis = new Map(projetos.map(p => [p.id, p.perfil]));
  const resultado = [];
  for (const item of candidatos) {
    if (!contextos.has(item.projeto_id)) {
      contextos.set(item.projeto_id, await permissoes.carregarContexto(item.projeto_id));
    }
    const contexto = contextos.get(item.projeto_id);
    const perfil = perfis.get(item.projeto_id) || null;
    const nivel = permissoes.resolverNivel(contexto, item.pasta_id, usuario, perfil);
    const cap = permissoes.capacidades(nivel);
    if (!cap.ver) continue;
    if (nivel === 'R*' && item.criado_por !== usuario.id && !usuario.admin_sistema) continue;
    resultado.push({ ...item, nivel });
  }
  return resultado;
}

async function valoresDeMetadado(chave) {
  return consultar(
    'SELECT DISTINCT valor FROM metadado WHERE chave = ? ORDER BY valor LIMIT 100', [chave]
  );
}

module.exports = { buscar, valoresDeMetadado };
