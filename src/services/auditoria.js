'use strict';
const { executar, consultar } = require('../config/db');

/** O log é somente inserção. Nenhuma tela do sistema edita ou apaga registro. */
async function registrar({ usuarioId, acao, entidade, entidadeId, projetoId, detalhe, ip }) {
  await executar(
    `INSERT INTO log_auditoria (usuario_id, acao, entidade, entidade_id, projeto_id, detalhe, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [usuarioId || null, acao, entidade, entidadeId || null, projetoId || null,
     detalhe ? String(detalhe).slice(0, 400) : null, ip || null]
  );
}

async function listar({ projetoId, usuarioId, entidade, entidadeId, de, ate, limite = 200 }) {
  const condicoes = [];
  const params = [];
  if (projetoId)  { condicoes.push('l.projeto_id = ?');  params.push(projetoId); }
  if (usuarioId)  { condicoes.push('l.usuario_id = ?');  params.push(usuarioId); }
  if (entidade)   { condicoes.push('l.entidade = ?');    params.push(entidade); }
  if (entidadeId) { condicoes.push('l.entidade_id = ?'); params.push(entidadeId); }
  if (de)         { condicoes.push('l.ocorrido_em >= ?'); params.push(de + ' 00:00:00'); }
  if (ate)        { condicoes.push('l.ocorrido_em <= ?'); params.push(ate + ' 23:59:59'); }
  const onde = condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : '';
  return consultar(
    `SELECT l.*, u.nome AS usuario_nome, p.sigla AS projeto_sigla
       FROM log_auditoria l
       LEFT JOIN usuario u ON u.id = l.usuario_id
       LEFT JOIN projeto p ON p.id = l.projeto_id
       ${onde}
      ORDER BY l.ocorrido_em DESC
      LIMIT ${Number(limite) || 200}`,
    params
  );
}

module.exports = { registrar, listar };
