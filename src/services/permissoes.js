'use strict';
const { consultar, umaLinha } = require('../config/db');

const NIVEIS = ['A', 'R', 'R*', 'C', 'I', 'X'];

// O que cada nível habilita. Reproduz a seção 6.1 do documento de arquitetura.
// "proprio" significa: apenas sobre o que o próprio usuário criou.
const CAPACIDADES = {
  'A':  { ver: true,  baixar: 'todos', enviar: true,  versionar: 'todos', organizar: 'todos', excluir: 'todos',  comentar: true,  gerir: true,  excluirDefinitivo: true },
  'R':  { ver: true,  baixar: 'todos', enviar: true,  versionar: 'todos', organizar: 'todos', excluir: 'todos',  comentar: true,  gerir: false, excluirDefinitivo: false },
  'R*': { ver: true,  baixar: 'proprio', enviar: true, versionar: 'proprio', organizar: 'proprio', excluir: 'proprio', comentar: true, gerir: false, excluirDefinitivo: false },
  'C':  { ver: true,  baixar: 'todos', enviar: false, versionar: false,   organizar: false,   excluir: false,    comentar: true,  gerir: false, excluirDefinitivo: false },
  'I':  { ver: true,  baixar: 'todos', enviar: false, versionar: false,   organizar: false,   excluir: false,    comentar: false, gerir: false, excluirDefinitivo: false },
  'X':  { ver: false, baixar: false,   enviar: false, versionar: false,   organizar: false,   excluir: false,    comentar: false, gerir: false, excluirDefinitivo: false }
};

function capacidades(nivel) {
  return CAPACIDADES[nivel] || CAPACIDADES['X'];
}

/**
 * Carrega, de uma só vez, a árvore de pastas e as permissões de um projeto.
 * Projetos têm poucas dezenas de pastas, então a resolução passa a ser
 * cálculo em memória, sem ida ao banco a cada pasta visitada.
 * projetoId nulo carrega o Nível Grupo.
 */
async function carregarContexto(projetoId) {
  const pastas = projetoId
    ? await consultar('SELECT * FROM pasta WHERE projeto_id = ? ORDER BY ordem, nome', [projetoId])
    : await consultar('SELECT * FROM pasta WHERE projeto_id IS NULL ORDER BY ordem, nome');

  const ids = pastas.map(p => p.id);
  let permissoes = [];
  if (ids.length) {
    const marcadores = ids.map(() => '?').join(',');
    permissoes = await consultar(
      `SELECT * FROM permissao
        WHERE pasta_id IN (${marcadores})
          AND (expira_em IS NULL OR expira_em > NOW())`,
      ids
    );
  }

  const porId = new Map(pastas.map(p => [p.id, p]));
  const porPasta = new Map();
  for (const perm of permissoes) {
    if (!porPasta.has(perm.pasta_id)) porPasta.set(perm.pasta_id, { perfil: new Map(), usuario: new Map() });
    const alvo = porPasta.get(perm.pasta_id);
    if (perm.usuario_id) alvo.usuario.set(perm.usuario_id, perm.nivel);
    else if (perm.perfil) alvo.perfil.set(perm.perfil, perm.nivel);
  }

  return { projetoId, pastas, porId, porPasta };
}

/**
 * Resolução de acesso, conforme a seção 6.2 do documento de arquitetura.
 * 1. administrador do sistema tem A em tudo
 * 2. sem vínculo com o projeto, o acesso é negado
 * 3. regra individual na pasta vence a regra de perfil na mesma pasta
 * 4. sem regra na pasta, sobe para a pasta pai
 * 5. sem regra até a raiz, nega
 */
function resolverNivel(contexto, pastaId, usuario, perfil) {
  if (usuario && usuario.admin_sistema) return 'A';
  if (!perfil) return 'X';

  let atual = contexto.porId.get(Number(pastaId));
  let voltas = 0;
  while (atual && voltas < 100) {
    const regras = contexto.porPasta.get(atual.id);
    if (regras) {
      if (usuario && regras.usuario.has(usuario.id)) return regras.usuario.get(usuario.id);
      if (regras.perfil.has(perfil)) return regras.perfil.get(perfil);
    }
    atual = atual.pai_id ? contexto.porId.get(atual.pai_id) : null;
    voltas += 1;
  }
  return 'X';
}

/** Existe regra individual explícita para o usuário nesta pasta. */
function temRegraIndividual(contexto, pastaId, usuarioId) {
  const regras = contexto.porPasta.get(Number(pastaId));
  return Boolean(regras && regras.usuario.has(Number(usuarioId)));
}

/**
 * Perfil do usuário no projeto da pasta. No Nível Grupo, vale o melhor perfil
 * que a pessoa tenha em qualquer projeto ativo, já que a pasta é comum a todos.
 */
async function perfilDoUsuario(usuarioId, projetoId) {
  if (projetoId) {
    const v = await umaLinha(
      `SELECT perfil, nucleo_id FROM vinculo
        WHERE usuario_id = ? AND projeto_id = ? AND revogado_em IS NULL
          AND (fim IS NULL OR fim >= CURDATE())`,
      [usuarioId, projetoId]
    );
    return v ? { perfil: v.perfil, nucleoId: v.nucleo_id } : null;
  }
  const v = await umaLinha(
    `SELECT MIN(perfil) AS perfil FROM vinculo
      WHERE usuario_id = ? AND revogado_em IS NULL
        AND (fim IS NULL OR fim >= CURDATE())`,
    [usuarioId]
  );
  return v && v.perfil ? { perfil: v.perfil, nucleoId: null } : null;
}

/** Sobe do nó até a raiz para descobrir a que projeto a pasta pertence. */
async function projetoDaPasta(pastaId) {
  const pasta = await umaLinha('SELECT id, projeto_id, pai_id FROM pasta WHERE id = ?', [pastaId]);
  if (!pasta) return { pasta: null, projetoId: null };
  return { pasta, projetoId: pasta.projeto_id };
}

/** Prepara tudo o que uma requisição precisa para decidir sobre uma pasta. */
async function contextoDeAcesso(usuario, pastaId) {
  const { pasta, projetoId } = await projetoDaPasta(pastaId);
  if (!pasta) return null;
  const vinculo = usuario ? await perfilDoUsuario(usuario.id, projetoId) : null;
  const contexto = await carregarContexto(projetoId);
  const perfil = vinculo ? vinculo.perfil : null;
  const nivel = resolverNivel(contexto, pasta.id, usuario, perfil);
  return {
    pasta: contexto.porId.get(pasta.id) || pasta,
    projetoId,
    perfil,
    nucleoId: vinculo ? vinculo.nucleoId : null,
    contexto,
    nivel,
    cap: capacidades(nivel)
  };
}

/** Caminho da pasta até a raiz, para a trilha de navegação. */
function trilha(contexto, pastaId) {
  const itens = [];
  let atual = contexto.porId.get(Number(pastaId));
  while (atual) {
    itens.unshift(atual);
    atual = atual.pai_id ? contexto.porId.get(atual.pai_id) : null;
  }
  return itens;
}

/**
 * Subpastas visíveis. Sob um nível R* o usuário só enxerga o que criou ou
 * aquilo em que recebeu regra individual, que é como o parceiro externo
 * chega ao seu núcleo e o orientando à sua própria subpasta.
 */
function subpastasVisiveis(contexto, pastaId, usuario, perfil, nivelPai) {
  const filhas = contexto.pastas.filter(p => p.pai_id === Number(pastaId));
  return filhas.filter(filha => {
    const nivel = resolverNivel(contexto, filha.id, usuario, perfil);
    if (!capacidades(nivel).ver) return false;
    if (nivelPai === 'R*' && !(usuario && usuario.admin_sistema)) {
      return temRegraIndividual(contexto, filha.id, usuario.id) || filha.criada_por === usuario.id;
    }
    return true;
  }).map(filha => ({ ...filha, nivel: resolverNivel(contexto, filha.id, usuario, perfil) }));
}

module.exports = {
  NIVEIS,
  capacidades,
  carregarContexto,
  resolverNivel,
  temRegraIndividual,
  perfilDoUsuario,
  contextoDeAcesso,
  trilha,
  subpastasVisiveis
};
