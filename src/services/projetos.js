'use strict';
const { consultar, umaLinha, executar, comTransacao } = require('../config/db');
const auditoria = require('./auditoria');

async function listar() {
  return consultar('SELECT * FROM projeto ORDER BY nome');
}

async function porId(id) {
  return umaLinha('SELECT * FROM projeto WHERE id = ?', [id]);
}

/**
 * Cria o projeto e replica a estrutura padrão guardada em modelo_pasta,
 * aplicando a matriz de modelo_permissao. É o requisito RF06: a estrutura
 * e a matriz vivem em dados, não em código, e a coordenação pode revisá-las
 * sem precisar de desenvolvedor.
 */
async function criar({ nome, sigla, descricao }, usuario) {
  const projetoId = await comTransacao(async (tx) => {
    const res = await tx.executar(
      'INSERT INTO projeto (nome, sigla, descricao) VALUES (?, ?, ?)',
      [nome, sigla, descricao || null]
    );
    const id = res.insertId;

    const modelos = await tx.consultar(
      "SELECT * FROM modelo_pasta WHERE escopo = 'projeto' ORDER BY ordem"
    );
    for (const m of modelos) {
      const pastaRes = await tx.executar(
        `INSERT INTO pasta (projeto_id, pai_id, nome, codigo, descricao, publica, sensivel, ordem, criada_por)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [id, m.nome, m.codigo, m.descricao, m.publica, m.sensivel, m.ordem, usuario.id]
      );
      const permissoes = await tx.consultar(
        'SELECT perfil, nivel FROM modelo_permissao WHERE modelo_pasta_id = ?', [m.id]
      );
      for (const p of permissoes) {
        await tx.executar(
          'INSERT INTO permissao (pasta_id, perfil, nivel, concedida_por) VALUES (?, ?, ?, ?)',
          [pastaRes.insertId, p.perfil, p.nivel, usuario.id]
        );
      }
    }

    // quem cria o projeto entra como Perfil 1
    await tx.executar(
      'INSERT INTO vinculo (usuario_id, projeto_id, perfil, inicio) VALUES (?, ?, 1, CURDATE())',
      [usuario.id, id]
    );
    return id;
  });

  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'criar_projeto', entidade: 'projeto',
    entidadeId: projetoId, projetoId, detalhe: `${sigla} ${nome}`
  });
  return projetoId;
}

/** Pasta 07 do projeto, onde vivem os núcleos e frentes. */
async function pastaDeNucleos(projetoId) {
  return umaLinha(
    "SELECT * FROM pasta WHERE projeto_id = ? AND codigo = '07' AND pai_id IS NULL", [projetoId]
  );
}

/**
 * Cria um núcleo ou frente: registra o núcleo, cria a pasta dentro da 07 e
 * replica as subpastas padrão com a matriz do escopo núcleo.
 */
async function criarNucleo(projetoId, nome, usuario) {
  const pasta07 = await pastaDeNucleos(projetoId);
  if (!pasta07) throw Object.assign(new Error('Projeto sem a pasta 07.'), { status: 400 });

  const nucleoId = await comTransacao(async (tx) => {
    const res = await tx.executar('INSERT INTO nucleo (projeto_id, nome) VALUES (?, ?)', [projetoId, nome]);
    const id = res.insertId;

    const ordemRes = await tx.consultar(
      'SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM pasta WHERE pai_id = ?', [pasta07.id]
    );
    const pastaNucleo = await tx.executar(
      `INSERT INTO pasta (projeto_id, pai_id, nucleo_id, nome, descricao, ordem, criada_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projetoId, pasta07.id, id, nome, `Núcleo ou frente ${nome}.`, ordemRes[0].proxima, usuario.id]
    );

    const modelos = await tx.consultar("SELECT * FROM modelo_pasta WHERE escopo = 'nucleo' ORDER BY ordem");
    for (const m of modelos) {
      const sub = await tx.executar(
        `INSERT INTO pasta (projeto_id, pai_id, nucleo_id, nome, codigo, descricao, ordem, criada_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projetoId, pastaNucleo.insertId, id, m.nome, m.codigo, m.descricao, m.ordem, usuario.id]
      );
      const permissoes = await tx.consultar(
        'SELECT perfil, nivel FROM modelo_permissao WHERE modelo_pasta_id = ?', [m.id]
      );
      for (const p of permissoes) {
        await tx.executar(
          'INSERT INTO permissao (pasta_id, perfil, nivel, concedida_por) VALUES (?, ?, ?, ?)',
          [sub.insertId, p.perfil, p.nivel, usuario.id]
        );
      }
    }
    return id;
  });

  await auditoria.registrar({
    usuarioId: usuario.id, acao: 'criar_nucleo', entidade: 'nucleo',
    entidadeId: nucleoId, projetoId, detalhe: nome
  });
  return nucleoId;
}

async function nucleos(projetoId) {
  return consultar('SELECT * FROM nucleo WHERE projeto_id = ? ORDER BY nome', [projetoId]);
}

async function raizes(projetoId) {
  return consultar(
    'SELECT * FROM pasta WHERE projeto_id = ? AND pai_id IS NULL ORDER BY ordem, nome', [projetoId]
  );
}

// ----------------------------------------------------------------- pessoas
async function vinculos(projetoId) {
  return consultar(
    `SELECT v.*, u.nome, u.email, u.instituicao, pf.nome AS perfil_nome, n.nome AS nucleo_nome
       FROM vinculo v
       JOIN usuario u  ON u.id = v.usuario_id
       JOIN perfil  pf ON pf.numero = v.perfil
       LEFT JOIN nucleo n ON n.id = v.nucleo_id
      WHERE v.projeto_id = ?
      ORDER BY v.revogado_em IS NOT NULL, v.perfil, u.nome`,
    [projetoId]
  );
}

async function salvarVinculo({ projetoId, usuarioId, perfil, nucleoId, inicio, fim }, autor) {
  await executar(
    `INSERT INTO vinculo (usuario_id, projeto_id, perfil, nucleo_id, inicio, fim)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE perfil = VALUES(perfil), nucleo_id = VALUES(nucleo_id),
                             inicio = VALUES(inicio), fim = VALUES(fim), revogado_em = NULL`,
    [usuarioId, projetoId, perfil, nucleoId || null, inicio || new Date().toISOString().slice(0, 10), fim || null]
  );
  await auditoria.registrar({
    usuarioId: autor.id, acao: 'definir_vinculo', entidade: 'usuario',
    entidadeId: usuarioId, projetoId, detalhe: `perfil ${perfil}`
  });
}

async function encerrarVinculo(projetoId, usuarioId, autor) {
  await executar(
    'UPDATE vinculo SET fim = CURDATE(), revogado_em = NOW() WHERE projeto_id = ? AND usuario_id = ?',
    [projetoId, usuarioId]
  );
  await auditoria.registrar({
    usuarioId: autor.id, acao: 'encerrar_vinculo', entidade: 'usuario',
    entidadeId: usuarioId, projetoId
  });
}

module.exports = {
  listar, porId, criar, criarNucleo, nucleos, raizes, pastaDeNucleos,
  vinculos, salvarVinculo, encerrarVinculo
};
