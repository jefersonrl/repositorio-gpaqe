'use strict';
/**
 * Teste de ponta a ponta pela própria interface HTTP: entra com cada perfil e
 * confere se a matriz RACI está sendo aplicada de verdade.
 *   node tests/e2e.js
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const SENHA = 'GpaqeTrocarEsta2026';

let passou = 0, falhou = 0;
function verificar(descricao, condicao, extra = '') {
  if (condicao) { passou++; console.log(`  ok   ${descricao}`); }
  else { falhou++; console.log(`  FALHOU ${descricao} ${extra}`); }
}

function criarSessao() {
  const cookies = new Map();
  async function requisitar(caminho, opcoes = {}) {
    const cabecalhos = { ...(opcoes.headers || {}) };
    if (cookies.size) {
      cabecalhos.cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const resposta = await fetch(BASE + caminho, { ...opcoes, headers: cabecalhos, redirect: 'manual' });
    const definidos = resposta.headers.getSetCookie ? resposta.headers.getSetCookie() : [];
    for (const c of definidos) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      cookies.set(par.slice(0, i), par.slice(i + 1));
    }
    return resposta;
  }
  async function obter(caminho) {
    const r = await requisitar(caminho);
    const corpo = r.status === 200 ? await r.text() : '';
    return { status: r.status, corpo, local: r.headers.get('location') };
  }
  async function token(caminho) {
    const { corpo } = await obter(caminho);
    const m = corpo.match(/name="_csrf" value="([^"]+)"/);
    return m ? m[1] : null;
  }
  async function postar(caminho, dados, paginaComToken) {
    const csrf = await token(paginaComToken || caminho);
    const corpo = new URLSearchParams({ ...dados, _csrf: csrf });
    const r = await requisitar(caminho, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: corpo.toString()
    });
    return { status: r.status, local: r.headers.get('location') };
  }
  async function enviarArquivo(caminho, campos, nomeArquivo, conteudo, paginaComToken) {
    const csrf = await token(paginaComToken);
    const form = new FormData();
    form.append('_csrf', csrf);
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    form.append('arquivo', new Blob([conteudo], { type: 'text/plain' }), nomeArquivo);
    const r = await requisitar(caminho, { method: 'POST', body: form });
    return { status: r.status, local: r.headers.get('location') };
  }
  async function entrar(email) {
    const r = await postar('/entrar', { email, senha: SENHA }, '/entrar');
    if (r.status !== 302 || r.local === '/entrar') return false;
    // confere que a sessão realmente ficou de pé, e não apenas que o
    // redirecionamento aconteceu
    const painel = await obter('/');
    return painel.status === 200 && painel.corpo.includes('Meus projetos');
  }
  return { obter, postar, enviarArquivo, entrar, requisitar, token };
}

(async function () {
  console.log('\n=== Sessões e identificação das pastas ===');
  const p1 = criarSessao();
  verificar('Perfil 1 entra no sistema', await p1.entrar('coordenacao@gpaqe.exemplo'));

  const painel = await p1.obter('/');
  const projetoId = (painel.corpo.match(/\/projetos\/(\d+)/) || [])[1];
  verificar('Painel lista projeto do usuário', Boolean(projetoId));

  const projeto = await p1.obter(`/projetos/${projetoId}`);
  const pastas = {};
  for (const m of projeto.corpo.matchAll(/\/pastas\/(\d+)">(\d\d)_([A-Z_]+)/g)) pastas[m[2]] = Number(m[1]);
  verificar('Projeto tem as 16 pastas do modelo', Object.keys(pastas).length === 16,
    `encontradas ${Object.keys(pastas).length}`);

  console.log('\n=== Matriz RACI aplicada por perfil ===');
  const p2 = criarSessao(); await p2.entrar('interno@gpaqe.exemplo');
  const p3 = criarSessao(); await p3.entrar('externo@gpaqe.exemplo');
  const p4 = criarSessao(); await p4.entrar('revisor@gpaqe.exemplo');
  const p5 = criarSessao(); await p5.entrar('aluno@gpaqe.exemplo');

  const r01_p1 = await p1.obter(`/pastas/${pastas['01']}`);
  const r01_p2 = await p2.obter(`/pastas/${pastas['01']}`);
  const r01_p3 = await p3.obter(`/pastas/${pastas['01']}`);
  const r01_p5 = await p5.obter(`/pastas/${pastas['01']}`);
  verificar('01_GOVERNANCA: Perfil 1 entra (A)', r01_p1.status === 200);
  verificar('01_GOVERNANCA: Perfil 2 entra apenas como leitor (I)',
    r01_p2.status === 200 && !r01_p2.corpo.includes('Enviar arquivo'));
  verificar('01_GOVERNANCA: Perfil 3 é barrado (X)', r01_p3.status === 403, `status ${r01_p3.status}`);
  verificar('01_GOVERNANCA: Perfil 5 é barrado (X)', r01_p5.status === 403, `status ${r01_p5.status}`);

  const r04_p2 = await p2.obter(`/pastas/${pastas['04']}`);
  const r04_p4 = await p4.obter(`/pastas/${pastas['04']}`);
  verificar('04_GESTAO_DE_DADOS: Perfil 2 pode enviar (R)',
    r04_p2.status === 200 && r04_p2.corpo.includes('Enviar arquivo'));
  verificar('04_GESTAO_DE_DADOS: Perfil 4 é barrado (X)', r04_p4.status === 403);

  const r13_p3 = await p3.obter(`/pastas/${pastas['13']}`);
  verificar('13_INTERNACIONALIZACAO: Perfil 3 pode enviar (R)',
    r13_p3.status === 200 && r13_p3.corpo.includes('Enviar arquivo'));

  console.log('\n=== Envio, versionamento e histórico ===');
  const envio = await p2.enviarArquivo(
    `/pastas/${pastas['04']}/arquivos`,
    { nome: 'Base tratada 2026' }, 'base.csv', 'coluna_a;coluna_b\n1;2\n',
    `/pastas/${pastas['04']}`
  );
  verificar('Perfil 2 envia arquivo para a pasta 04', envio.status === 302);

  const lista04 = await p2.obter(`/pastas/${pastas['04']}`);
  const arquivoId = Number((lista04.corpo.match(/\/arquivos\/(\d+)"/) || [])[1]);
  verificar('Arquivo aparece na listagem da pasta', Boolean(arquivoId));

  const novaVersao = await p2.enviarArquivo(
    `/arquivos/${arquivoId}/versoes`, { comentario: 'Correção de duas linhas' },
    'base.csv', 'coluna_a;coluna_b\n1;2\n3;4\n', `/arquivos/${arquivoId}`
  );
  verificar('Nova versão registrada', novaVersao.status === 302);
  const detalhe = await p2.obter(`/arquivos/${arquivoId}`);
  verificar('Histórico mostra as duas versões',
    (detalhe.corpo.match(/Baixar<\/a>/g) || []).length >= 2);
  verificar('Comentário da versão fica registrado', detalhe.corpo.includes('Correção de duas linhas'));

  console.log('\n=== URL assinada de download ===');
  const redir = await p2.requisitar(`/arquivos/${arquivoId}/baixar`);
  const urlAssinada = redir.headers.get('location');
  // Com o armazenamento local a URL é do próprio sistema. Com S3, R2, B2 ou
  // MinIO, é uma URL assinada do provedor, em outro endereço.
  const armazenamentoLocal = Boolean(urlAssinada && urlAssinada.startsWith('/objetos?'));
  verificar('Download responde com URL assinada',
    Boolean(urlAssinada && (armazenamentoLocal || urlAssinada.includes('X-Amz-Signature'))),
    urlAssinada || 'sem redirecionamento');

  const conteudo = armazenamentoLocal
    ? await p2.requisitar(urlAssinada)
    : await fetch(urlAssinada);
  verificar('URL assinada entrega o conteúdo', conteudo.status === 200);
  verificar('Conteúdo entregue é o da versão atual',
    (await conteudo.text()).includes('3;4'));

  if (armazenamentoLocal) {
    const adulterada = urlAssinada.replace(/sig=([0-9a-f]{4})/, 'sig=0000');
    const negada = await p2.requisitar(adulterada);
    verificar('URL com assinatura adulterada é recusada', negada.status === 403, `status ${negada.status}`);
    const vencida = urlAssinada.replace(/exp=\d+/, 'exp=1000');
    const negada2 = await p2.requisitar(vencida);
    verificar('URL vencida é recusada', negada2.status === 403);
  } else {
    console.log('  nota: adulteração e prazo da URL são conferidos pelo próprio provedor');
  }

  console.log('\n=== Acesso restrito (R*) ===');
  const envioAluno = await p5.enviarArquivo(
    `/pastas/${pastas['04']}/arquivos`, { nome: 'Coleta do orientando' },
    'coleta.csv', 'x;y\n', `/pastas/${pastas['04']}`
  );
  verificar('Perfil 5 envia na pasta 04 com R*', envioAluno.status === 302);

  const visaoAluno = await p5.obter(`/pastas/${pastas['04']}`);
  verificar('Perfil 5 vê o próprio arquivo', visaoAluno.corpo.includes('Coleta do orientando'));
  verificar('Perfil 5 não vê o arquivo do Perfil 2', !visaoAluno.corpo.includes('Base tratada 2026'));

  const visaoInterno = await p2.obter(`/pastas/${pastas['04']}`);
  verificar('Perfil 2, com R, vê os dois arquivos',
    visaoInterno.corpo.includes('Base tratada 2026') && visaoInterno.corpo.includes('Coleta do orientando'));

  const acessoDireto = await p5.obter(`/arquivos/${arquivoId}`);
  verificar('Perfil 5 não abre arquivo de outra pessoa nem pela URL direta',
    acessoDireto.status === 403, `status ${acessoDireto.status}`);

  console.log('\n=== Núcleo e visibilidade na pasta 07 ===');
  const p07_p3 = await p3.obter(`/pastas/${pastas['07']}`);
  verificar('Perfil 3 enxerga a pasta 07 (R*)', p07_p3.status === 200);
  verificar('Perfil 3 enxerga o próprio núcleo por regra individual', p07_p3.corpo.includes('Núcleo 01'));

  console.log('\n=== Busca respeita a matriz ===');
  const buscaP2 = await p2.obter('/buscar?termo=Base');
  verificar('Perfil 2 encontra o arquivo na busca', buscaP2.corpo.includes('Base tratada 2026'));
  const buscaP5 = await p5.obter('/buscar?termo=Base');
  verificar('Perfil 5 não encontra arquivo que não pode ver', !buscaP5.corpo.includes('Base tratada 2026'));
  const buscaP4 = await p4.obter('/buscar?termo=Base');
  verificar('Perfil 4 não encontra arquivo de pasta sem acesso', !buscaP4.corpo.includes('Base tratada 2026'));

  console.log('\n=== Lixeira ===');
  const excluir = await p2.postar(`/arquivos/${arquivoId}/excluir`, {}, `/arquivos/${arquivoId}`);
  verificar('Perfil 2 envia o arquivo para a lixeira', excluir.status === 302);
  const lixeira = await p1.obter(`/projetos/${projetoId}/lixeira`);
  verificar('Arquivo aparece na lixeira do projeto', lixeira.corpo.includes('Base tratada 2026'));
  const semLixeiraP2 = await p2.obter(`/projetos/${projetoId}/lixeira`);
  verificar('Perfil 2 não acessa a lixeira do projeto', semLixeiraP2.status === 403);
  const restaurar = await p1.postar(`/arquivos/${arquivoId}/restaurar`, {}, `/projetos/${projetoId}/lixeira`);
  verificar('Perfil 1 restaura o arquivo', restaurar.status === 302);

  console.log('\n=== Permissões e convites ===');
  const semGerir = await p2.obter(`/pastas/${pastas['04']}/permissoes`);
  verificar('Perfil 2 não abre a tela de permissões', semGerir.status === 403);

  const alterar = await p1.postar(`/pastas/${pastas['05']}/permissoes/perfil`,
    { perfil: '4', nivel: 'C' }, `/pastas/${pastas['05']}/permissoes`);
  verificar('Perfil 1 altera a matriz da pasta 05', alterar.status === 302);
  const p05_p4 = await p4.obter(`/pastas/${pastas['05']}`);
  verificar('Mudança na matriz vale na hora seguinte', p05_p4.status === 200);

  const convite = await p1.postar(`/projetos/${projetoId}/convites`, {
    nome: 'Parecerista convidado', email: 'parecer@exemplo.org',
    pastaId: String(pastas['11']), perfil: '4', nivel: 'C', dias: '15'
  }, `/projetos/${projetoId}/convites`);
  verificar('Convite externo criado', convite.status === 302);
  const listaConvites = await p1.obter(`/projetos/${projetoId}/convites`);
  verificar('Convite aparece como aguardando', listaConvites.corpo.includes('parecer@exemplo.org'));

  const tokenConvite = (listaConvites.corpo.match(/\/convites\/([0-9a-f]{48})/) || [])[1];
  verificar('Endereço do convite é gerado', Boolean(tokenConvite));

  const convidado = criarSessao();
  const paginaConvite = await convidado.obter(`/convites/${tokenConvite}`);
  verificar('Página do convite abre sem login', paginaConvite.status === 200);
  const aceite = await convidado.postar(`/convites/${tokenConvite}`,
    { nome: 'Parecerista convidado', senha: 'SenhaDoConvidado2026' }, `/convites/${tokenConvite}`);
  verificar('Convidado aceita e entra no sistema', aceite.local === '/');

  const pasta11 = await convidado.obter(`/pastas/${pastas['11']}`);
  verificar('Convidado acessa apenas a pasta do convite', pasta11.status === 200);
  const pasta04Convidado = await convidado.obter(`/pastas/${pastas['04']}`);
  verificar('Convidado é barrado nas demais pastas', pasta04Convidado.status === 403);

  const idConvite = (listaConvites.corpo.match(/convites\/(\d+)\/revogar/) || [])[1];
  const revogar = await p1.postar(`/projetos/${projetoId}/convites/${idConvite}/revogar`, {},
    `/projetos/${projetoId}/convites`);
  verificar('Convite revogado pela coordenação', revogar.status === 302);
  const depoisDaRevogacao = await convidado.obter(`/pastas/${pastas['11']}`);
  verificar('Acesso do convidado cai na hora da revogação',
    depoisDaRevogacao.status === 403 || depoisDaRevogacao.status === 302,
    `status ${depoisDaRevogacao.status}`);

  console.log('\n=== Auditoria ===');
  const auditoria = await p1.obter(`/projetos/${projetoId}/auditoria`);
  verificar('Auditoria registra o envio', auditoria.corpo.includes('envio'));
  verificar('Auditoria registra o download', auditoria.corpo.includes('download'));
  verificar('Auditoria registra a mudança de permissão', auditoria.corpo.includes('definir_permissao'));
  const auditoriaP2 = await p2.obter(`/projetos/${projetoId}/auditoria`);
  verificar('Perfil 2 não acessa a auditoria', auditoriaP2.status === 403);

  console.log('\n=== Sessão e proteções ===');
  const anonimo = criarSessao();
  const semLogin = await anonimo.obter(`/pastas/${pastas['04']}`);
  verificar('Sem login o sistema redireciona para a entrada',
    semLogin.status === 302 && semLogin.local === '/entrar');
  const publico = await anonimo.obter('/publico');
  verificar('Área pública abre sem login', publico.status === 200);

  const semToken = await anonimo.requisitar('/entrar', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'email=coordenacao@gpaqe.exemplo&senha=' + SENHA
  });
  verificar('POST sem token de formulário é recusado', semToken.status === 403);

  const senhaErrada = criarSessao();
  const negadoLogin = await senhaErrada.postar('/entrar', { email: 'coordenacao@gpaqe.exemplo', senha: 'errada' }, '/entrar');
  verificar('Senha errada não autentica', negadoLogin.local === '/entrar');

  console.log(`\nResumo: ${passou} verificações passaram, ${falhou} falharam.\n`);
  process.exit(falhou ? 1 : 0);
})().catch(erro => { console.error(erro); process.exit(1); });
