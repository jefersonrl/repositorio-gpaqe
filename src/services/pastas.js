'use strict';
const { consultar, umaLinha, executar } = require('../config/db');
const auditoria = require('./auditoria');

async function porId(id) {
  return umaLinha('SELECT * FROM pasta WHERE id = ?', [id]);
}

async function criar({ paiId, nome, descricao }, usuario) {
  const pai = await porId(paiId);
  if (!pai) throw Object.assign(new Error('Pasta de destino não encontrada.'), { status: 404 });
  const existente = await umaLinha('SELECT id FROM pasta WHERE pai_id = ? AND nome = ?', [paiId, nome]);
  if (existente) throw Object.assign(new Error('Já existe uma pasta com esse nome aqui.'), { status: 400 });

  const ordem = await umaLinha('SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM pasta WHERE pai_id = ?', [paiId]);
  const res = await executar(
    `INSERT INTO pasta (projeto_id, pai_id, nucleo_id, nome, descricao, sensivel, ordem, criada_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [pai.projeto_id, paiId, pai.nucleo_id, nome, descricao || null, pai.sensivel, ordem.proxima, usuario.id]
  );
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'criar_pasta', entidade: 'pasta',
    entidadeId: res.insertId, projetoId: pai.projeto_id, detalhe: nome
  });
  return res.insertId;
}

async function renomear(pastaId, nome, usuario) {
  const pasta = await porId(pastaId);
  await executar('UPDATE pasta SET nome = ? WHERE id = ?', [nome, pastaId]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'renomear_pasta', entidade: 'pasta',
    entidadeId: pastaId, projetoId: pasta.projeto_id, detalhe: `${pasta.nome} para ${nome}`
  });
}

/** Evita mover uma pasta para dentro dela mesma ou de uma descendente. */
async function ehDescendente(pastaId, possivelAncestral) {
  let atual = await porId(pastaId);
  let voltas = 0;
  while (atual && atual.pai_id && voltas < 100) {
    if (atual.pai_id === Number(possivelAncestral)) return true;
    atual = await porId(atual.pai_id);
    voltas += 1;
  }
  return false;
}

async function mover(pastaId, novoPaiId, usuario) {
  if (Number(pastaId) === Number(novoPaiId) || await ehDescendente(novoPaiId, pastaId)) {
    throw Object.assign(new Error('Não é possível mover uma pasta para dentro dela mesma.'), { status: 400 });
  }
  const destino = await porId(novoPaiId);
  const pasta = await porId(pastaId);
  if (!destino || !pasta) throw Object.assign(new Error('Pasta não encontrada.'), { status: 404 });
  if (destino.projeto_id !== pasta.projeto_id) {
    throw Object.assign(new Error('Não é possível mover pasta entre projetos.'), { status: 400 });
  }
  await executar('UPDATE pasta SET pai_id = ? WHERE id = ?', [novoPaiId, pastaId]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'mover_pasta', entidade: 'pasta',
    entidadeId: pastaId, projetoId: pasta.projeto_id, detalhe: `para ${destino.nome}`
  });
}

// ------------------------------------------------------------- permissões
async function permissoesDaPasta(pastaId) {
  return consultar(
    `SELECT p.*, u.nome AS usuario_nome, u.email AS usuario_email, pf.nome AS perfil_nome
       FROM permissao p
       LEFT JOIN usuario u  ON u.id = p.usuario_id
       LEFT JOIN perfil  pf ON pf.numero = p.perfil
      WHERE p.pasta_id = ?
      ORDER BY p.perfil IS NULL, p.perfil, u.nome`,
    [pastaId]
  );
}

async function definirPermissaoPerfil(pastaId, perfil, nivel, usuario) {
  const pasta = await porId(pastaId);
  await executar(
    `INSERT INTO permissao (pasta_id, perfil, nivel, concedida_por) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nivel = VALUES(nivel), concedida_por = VALUES(concedida_por)`,
    [pastaId, perfil, nivel, usuario.id]
  );
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'definir_permissao', entidade: 'pasta',
    entidadeId: pastaId, projetoId: pasta.projeto_id, detalhe: `perfil ${perfil} para ${nivel}`
  });
}

async function definirPermissaoUsuario(pastaId, usuarioAlvoId, nivel, expiraEm, usuario) {
  const pasta = await porId(pastaId);
  await executar(
    `INSERT INTO permissao (pasta_id, usuario_id, nivel, expira_em, concedida_por) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nivel = VALUES(nivel), expira_em = VALUES(expira_em),
                             concedida_por = VALUES(concedida_por)`,
    [pastaId, usuarioAlvoId, nivel, expiraEm || null, usuario.id]
  );
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'definir_permissao_individual', entidade: 'pasta',
    entidadeId: pastaId, projetoId: pasta.projeto_id,
    detalhe: `usuário ${usuarioAlvoId} para ${nivel}${expiraEm ? ' até ' + expiraEm : ''}`
  });
}

async function removerPermissao(permissaoId, usuario) {
  const perm = await umaLinha('SELECT * FROM permissao WHERE id = ?', [permissaoId]);
  if (!perm) return;
  const pasta = await porId(perm.pasta_id);
  await executar('DELETE FROM permissao WHERE id = ?', [permissaoId]);
  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'remover_permissao', entidade: 'pasta',
    entidadeId: perm.pasta_id, projetoId: pasta ? pasta.projeto_id : null, detalhe: `nível ${perm.nivel}`
  });
}

/** RF20: quem tem acesso a quê, para a revisão periódica prevista na governança. */
async function relatorioAcessos(projetoId) {
  const porPerfil = await consultar(
    `SELECT pa.id AS pasta_id, pa.nome AS pasta, pa.codigo, p.perfil, pf.nome AS perfil_nome, p.nivel
       FROM permissao p
       JOIN pasta  pa ON pa.id = p.pasta_id
       JOIN perfil pf ON pf.numero = p.perfil
      WHERE pa.projeto_id = ? AND p.perfil IS NOT NULL
      ORDER BY pa.ordem, pa.nome, p.perfil`,
    [projetoId]
  );
  const individuais = await consultar(
    `SELECT pa.nome AS pasta, u.nome AS usuario, u.email, p.nivel, p.expira_em,
            c.nome AS concedida_por_nome
       FROM permissao p
       JOIN pasta pa  ON pa.id = p.pasta_id
       JOIN usuario u ON u.id = p.usuario_id
       LEFT JOIN usuario c ON c.id = p.concedida_por
      WHERE pa.projeto_id = ? AND p.usuario_id IS NOT NULL
      ORDER BY u.nome, pa.nome`,
    [projetoId]
  );
  const pessoas = await consultar(
    `SELECT u.nome, u.email, u.instituicao, v.perfil, pf.nome AS perfil_nome,
            n.nome AS nucleo_nome, v.inicio, v.fim
       FROM vinculo v
       JOIN usuario u  ON u.id = v.usuario_id
       JOIN perfil  pf ON pf.numero = v.perfil
       LEFT JOIN nucleo n ON n.id = v.nucleo_id
      WHERE v.projeto_id = ?
      ORDER BY v.perfil, u.nome`,
    [projetoId]
  );
  return { porPerfil, individuais, pessoas };
}

module.exports = {
  porId, criar, renomear, mover, permissoesDaPasta,
  definirPermissaoPerfil, definirPermissaoUsuario, removerPermissao, relatorioAcessos
};
