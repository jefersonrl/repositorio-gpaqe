'use strict';
const bcrypt = require('bcryptjs');
const { consultar, umaLinha, executar } = require('../config/db');

const MIN_SENHA = 12;

async function porEmail(email) {
  return umaLinha('SELECT * FROM usuario WHERE email = ?', [String(email || '').trim().toLowerCase()]);
}

async function porId(id) {
  return umaLinha('SELECT * FROM usuario WHERE id = ?', [id]);
}

async function criar({ nome, email, senha, instituicao, origem = 'local', adminSistema = false }) {
  if (senha && senha.length < MIN_SENHA) {
    throw Object.assign(new Error(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`), { status: 400 });
  }
  const hash = senha ? await bcrypt.hash(senha, 12) : null;
  const resultado = await executar(
    `INSERT INTO usuario (nome, email, senha_hash, origem, instituicao, admin_sistema)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nome, String(email).trim().toLowerCase(), hash, origem, instituicao || null, adminSistema ? 1 : 0]
  );
  return resultado.insertId;
}

async function conferirSenha(usuario, senha) {
  if (!usuario || !usuario.senha_hash || !usuario.ativo) return false;
  return bcrypt.compare(senha, usuario.senha_hash);
}

async function trocarSenha(usuarioId, novaSenha) {
  if (!novaSenha || novaSenha.length < MIN_SENHA) {
    throw Object.assign(new Error(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`), { status: 400 });
  }
  const hash = await bcrypt.hash(novaSenha, 12);
  await executar('UPDATE usuario SET senha_hash = ? WHERE id = ?', [hash, usuarioId]);
}

async function listar() {
  return consultar('SELECT id, nome, email, instituicao, admin_sistema, ativo FROM usuario ORDER BY nome');
}

/** Projetos em que a pessoa tem vínculo vigente. */
async function projetosDoUsuario(usuarioId) {
  return consultar(
    `SELECT p.*, v.perfil, v.nucleo_id, pf.nome AS perfil_nome, n.nome AS nucleo_nome
       FROM vinculo v
       JOIN projeto p  ON p.id = v.projeto_id
       JOIN perfil  pf ON pf.numero = v.perfil
       LEFT JOIN nucleo n ON n.id = v.nucleo_id
      WHERE v.usuario_id = ? AND v.revogado_em IS NULL AND (v.fim IS NULL OR v.fim >= CURDATE())
      ORDER BY p.nome`,
    [usuarioId]
  );
}

module.exports = { MIN_SENHA, porEmail, porId, criar, conferirSenha, trocarSenha, listar, projetosDoUsuario };
