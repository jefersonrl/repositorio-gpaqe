'use strict';
/**
 * Biblioteca da carga inicial. Rode db/seed_projetos.js pelo terminal, ou
 * db/migrar.js --projetos em hospedagem sem acesso ao terminal do banco.
 *
 * Cria o administrador do sistema, uma conta de exemplo por perfil e os dois
 * projetos em andamento, já com as 16 pastas e a matriz RACI aplicada.
 * As senhas são de demonstração e devem ser trocadas.
 */
const usuarios = require('../src/services/usuarios');
const projetos = require('../src/services/projetos');
const { umaLinha, executar } = require('../src/config/db');

const SENHA_PADRAO = process.env.SENHA_DEMONSTRACAO || 'GpaqeTrocarEsta2026';

async function garantirUsuario(dados) {
  const existente = await usuarios.porEmail(dados.email);
  if (existente) return existente.id;
  return usuarios.criar({ ...dados, senha: SENHA_PADRAO });
}

async function principal() {
  const adminId = await garantirUsuario({
    nome: 'Coordenação do GPAQE', email: 'coordenacao@gpaqe.exemplo',
    instituicao: 'GPAQE', adminSistema: true
  });
  const admin = await usuarios.porId(adminId);

  const pessoas = {
    interno: await garantirUsuario({ nome: 'Docente Interno (exemplo)', email: 'interno@gpaqe.exemplo', instituicao: 'Pós-graduação' }),
    externo: await garantirUsuario({ nome: 'Parceiro Internacional (exemplo)', email: 'externo@gpaqe.exemplo', instituicao: 'Universidade parceira' }),
    revisor: await garantirUsuario({ nome: 'Revisor Externo (exemplo)', email: 'revisor@gpaqe.exemplo', instituicao: 'Parecerista' }),
    aluno:   await garantirUsuario({ nome: 'Orientando (exemplo)', email: 'aluno@gpaqe.exemplo', instituicao: 'Pós-graduação' })
  };

  const definicoes = [
    { sigla: 'PROJ1', nome: 'Internacionalização da Pós-Graduação em Educação',
      descricao: 'Projeto em rede nacional e internacional sobre internacionalização da pós-graduação em Educação.' },
    { sigla: 'PROJ2', nome: 'Maturidade Digital',
      descricao: 'Projeto sobre maturidade digital, com indicadores e instrumentos próprios.' }
  ];

  for (const def of definicoes) {
    const jaExiste = await umaLinha('SELECT id FROM projeto WHERE sigla = ?', [def.sigla]);
    if (jaExiste) {
      console.log(`Projeto ${def.sigla} já existe, pulando.`);
      continue;
    }
    const projetoId = await projetos.criar(def, admin);
    const nucleoId = await projetos.criarNucleo(projetoId, 'Núcleo 01', admin);

    await projetos.salvarVinculo({ projetoId, usuarioId: pessoas.interno, perfil: 2 }, admin);
    await projetos.salvarVinculo({ projetoId, usuarioId: pessoas.externo, perfil: 3, nucleoId }, admin);
    await projetos.salvarVinculo({ projetoId, usuarioId: pessoas.revisor, perfil: 4 }, admin);
    await projetos.salvarVinculo({ projetoId, usuarioId: pessoas.aluno,   perfil: 5, nucleoId }, admin);

    // O parceiro externo recebe a pasta do seu núcleo, e o orientando a própria
    // subpasta. É assim que o acesso restrito sai do papel.
    const pastaNucleo = await umaLinha(
      'SELECT id FROM pasta WHERE projeto_id = ? AND nucleo_id = ? AND codigo IS NULL', [projetoId, nucleoId]
    );
    await executar(
      "INSERT INTO permissao (pasta_id, usuario_id, nivel, concedida_por) VALUES (?, ?, 'R', ?)",
      [pastaNucleo.id, pessoas.externo, admin.id]
    );

    const pastaOrientandos = await umaLinha(
      "SELECT id FROM pasta WHERE projeto_id = ? AND nucleo_id = ? AND codigo = '06'", [projetoId, nucleoId]
    );
    const sub = await executar(
      'INSERT INTO pasta (projeto_id, pai_id, nucleo_id, nome, descricao, criada_por) VALUES (?, ?, ?, ?, ?, ?)',
      [projetoId, pastaOrientandos.id, nucleoId, 'Orientando (exemplo)', 'Subpasta individual do orientando.', admin.id]
    );
    await executar(
      "INSERT INTO permissao (pasta_id, usuario_id, nivel, concedida_por) VALUES (?, ?, 'R', ?)",
      [sub.insertId, pessoas.aluno, admin.id]
    );

    console.log(`Projeto ${def.sigla} criado com 16 pastas, núcleo e acessos de exemplo.`);
  }

  console.log(`\nContas de demonstração, todas com a senha ${SENHA_PADRAO}:`);
  console.log('  coordenacao@gpaqe.exemplo  Perfil 1 e administrador do sistema');
  console.log('  interno@gpaqe.exemplo      Perfil 2');
  console.log('  externo@gpaqe.exemplo      Perfil 3');
  console.log('  revisor@gpaqe.exemplo      Perfil 4');
  console.log('  aluno@gpaqe.exemplo        Perfil 5');
}

module.exports = principal;
module.exports.SENHA_PADRAO = SENHA_PADRAO;
