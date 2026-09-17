'use strict';
const crypto = require('crypto');
const { consultar, umaLinha, executar } = require('../config/db');
const usuarios = require('./usuarios');
const auditoria = require('./auditoria');
const config = require('../config');

/**
 * Convite externo com prazo, previsto como RF16. O acesso nasce com data de
 * expiração, e a permissão vencida deixa de valer sozinha, sem depender de
 * alguém lembrar de revogar.
 */
async function criar({ nome, email, projetoId, pastaId, perfil, nivel, dias }, autor) {
  const token = crypto.randomBytes(24).toString('hex');
  const prazo = Math.max(1, Math.min(Number(dias) || 30, 365));
  const res = await executar(
    `INSERT INTO convite (email, nome, projeto_id, pasta_id, perfil, nivel, token, expira_em, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)`,
    [String(email).trim().toLowerCase(), nome, projetoId, pastaId, perfil, nivel, token, prazo, autor.id]
  );
  await auditoria.registrar({
    usuarioId: autor.id, acao: 'criar_convite', entidade: 'convite',
    entidadeId: res.insertId, projetoId, detalhe: `${email} por ${prazo} dias`
  });
  return { id: res.insertId, token, url: `${config.baseUrl}/convites/${token}` };
}

async function porToken(token) {
  return umaLinha(
    `SELECT c.*, p.nome AS projeto_nome, pa.nome AS pasta_nome
       FROM convite c
       JOIN projeto p ON p.id = c.projeto_id
       JOIN pasta pa  ON pa.id = c.pasta_id
      WHERE c.token = ?`,
    [token]
  );
}

async function aceitar(token, { nome, senha }) {
  const convite = await porToken(token);
  if (!convite) throw Object.assign(new Error('Convite não encontrado.'), { status: 404 });
  if (convite.revogado_em) throw Object.assign(new Error('Convite revogado.'), { status: 400 });
  if (convite.aceito_em) throw Object.assign(new Error('Convite já utilizado.'), { status: 400 });
  if (new Date(convite.expira_em) < new Date()) throw Object.assign(new Error('Convite vencido.'), { status: 400 });

  let usuario = await usuarios.porEmail(convite.email);
  if (!usuario) {
    const id = await usuarios.criar({ nome: nome || convite.nome, email: convite.email, senha });
    usuario = await usuarios.porId(id);
  }

  await executar(
    `INSERT INTO vinculo (usuario_id, projeto_id, perfil, inicio, fim)
     VALUES (?, ?, ?, CURDATE(), DATE(?))
     ON DUPLICATE KEY UPDATE fim = GREATEST(IFNULL(fim, DATE(?)), DATE(?))`,
    [usuario.id, convite.projeto_id, convite.perfil, convite.expira_em, convite.expira_em, convite.expira_em]
  );
  await executar(
    `INSERT INTO permissao (pasta_id, usuario_id, nivel, expira_em, concedida_por)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nivel = VALUES(nivel), expira_em = VALUES(expira_em)`,
    [convite.pasta_id, usuario.id, convite.nivel, convite.expira_em, convite.criado_por]
  );
  await executar('UPDATE convite SET aceito_em = NOW(), usuario_id = ? WHERE id = ?', [usuario.id, convite.id]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'aceitar_convite', entidade: 'convite',
    entidadeId: convite.id, projetoId: convite.projeto_id
  });
  return usuario;
}

async function revogar(id, autor) {
  const convite = await umaLinha('SELECT * FROM convite WHERE id = ?', [id]);
  if (!convite) return;
  await executar('UPDATE convite SET revogado_em = NOW() WHERE id = ?', [id]);
  if (convite.usuario_id) {
    await executar('DELETE FROM permissao WHERE pasta_id = ? AND usuario_id = ?',
      [convite.pasta_id, convite.usuario_id]);
    // o vínculo nasceu deste convite, então a revogação o encerra na hora
    await executar(
      'UPDATE vinculo SET fim = CURDATE(), revogado_em = NOW() WHERE projeto_id = ? AND usuario_id = ?',
      [convite.projeto_id, convite.usuario_id]
    );
  }
  await auditoria.registrar({
    usuarioId: autor.id, acao: 'revogar_convite', entidade: 'convite',
    entidadeId: id, projetoId: convite.projeto_id, detalhe: convite.email
  });
}

async function listar(projetoId) {
  return consultar(
    `SELECT c.*, pa.nome AS pasta_nome, u.nome AS autor_nome,
            (c.revogado_em IS NOT NULL) AS revogado,
            (c.expira_em < NOW()) AS vencido
       FROM convite c
       JOIN pasta pa  ON pa.id = c.pasta_id
       JOIN usuario u ON u.id = c.criado_por
      WHERE c.projeto_id = ?
      ORDER BY c.criado_em DESC`,
    [projetoId]
  );
}

module.exports = { criar, porToken, aceitar, revogar, listar };
