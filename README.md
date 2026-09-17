# Repositório Digital Multiprojeto do GPAQE

Sistema web que hospeda os repositórios dos projetos do Grupo de Pesquisa Avaliação e
Qualidade Educacional em três níveis (Grupo, Projeto e Núcleo ou Frente), aplicando a
matriz RACI definida no Roteiro Técnico diretamente na permissão de cada pasta.

A diferença em relação a um serviço pronto de armazenamento é o controle fino de acesso:
uma subpasta pode ter, para o mesmo perfil, um nível **menor** que a pasta acima. É isso
que permite reproduzir a matriz exatamente como ela foi escrita.

Pilha: HTML, CSS, Bootstrap 5, JavaScript, Node.js com Express, MySQL 8 ou MariaDB 10.6,
e armazenamento de objetos em nuvem compatível com S3, com adaptador local para
desenvolvimento.

---

## 1. Instalação

Pré-requisitos: Node.js 18 ou superior e MySQL 8 (ou MariaDB 10.6 ou superior).

```bash
npm install
cp .env.example .env      # ajuste as variáveis
```

Crie o banco e carregue os dados de referência:

```sql
CREATE DATABASE gpaqe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gpaqe'@'localhost' IDENTIFIED BY 'sua-senha';
GRANT SELECT, INSERT, UPDATE, DELETE ON gpaqe.* TO 'gpaqe'@'localhost';
```

```bash
mysql -u gpaqe -p gpaqe < db/schema.sql
mysql -u gpaqe -p gpaqe < db/seed.sql        # perfis, modelo de pastas e matriz
node db/seed_projetos.js                     # projetos e contas de demonstração
npm start
```

O sistema sobe em `http://localhost:3000`.

> O usuário de banco da aplicação não precisa de permissão para alterar estrutura.
> Use uma conta separada para rodar `schema.sql`.

### Contas de demonstração

Criadas por `db/seed_projetos.js`, todas com a senha `GpaqeTrocarEsta2026`.
Troque todas antes de qualquer uso real.

| E-mail | Perfil |
|---|---|
| coordenacao@gpaqe.exemplo | 1, e administrador do sistema |
| interno@gpaqe.exemplo | 2 |
| externo@gpaqe.exemplo | 3, vinculado ao Núcleo 01 |
| revisor@gpaqe.exemplo | 4 |
| aluno@gpaqe.exemplo | 5, vinculado ao Núcleo 01 |

## 2. Configuração

| Variável | Para que serve |
|---|---|
| `SESSION_SECRET` | assina a sessão e as URLs de download local. Obrigatória em produção |
| `STORAGE_DRIVER` | `local` no desenvolvimento, `s3` em produção |
| `STORAGE_LOCAL_DIR` | pasta do armazenamento local. Deve ficar fora do diretório público |
| `S3_*` | credenciais do armazenamento. Funciona com Amazon S3, Cloudflare R2, Google Cloud Storage, Backblaze B2 e MinIO |
| `URL_ASSINADA_MINUTOS` | validade do link de download. Padrão de dez minutos |
| `MAX_UPLOAD_MB` | tamanho máximo por arquivo |
| `DIAS_CARENCIA_LIXEIRA` | prazo antes de liberar a exclusão definitiva |
| `DB_URL` | conexão em uma única URL, como os provedores de nuvem entregam. Tem prioridade sobre `DB_HOST` e companhia |
| `DB_SSL` e `DB_SSL_CA` | TLS na conexão com o banco. Com a autoridade certificadora informada, o certificado do servidor é conferido |
| `MIGRAR_AO_SUBIR` | prepara o banco na primeira subida, para hospedagem sem acesso ao terminal |
| `MODO_DEMONSTRACAO` | mostra a tarja e a lista de contas de exemplo na tela de entrada. Nunca ligar com dados reais |

Trocar de armazenamento é só mudar `STORAGE_DRIVER`. Nenhuma linha de código muda.

Para publicar em um endereço acessível pela internet, com planos gratuitos, siga o
`IMPLANTACAO.md`. Há também `Dockerfile` e `render.yaml` prontos.

## 3. Como a permissão é resolvida

Níveis: `A` autoridade, `R` responsável, `R*` responsável restrito, `C` consultado,
`I` informado, `X` sem acesso.

Para cada pasta, nesta ordem:

1. administrador do sistema tem `A` em tudo;
2. sem vínculo vigente com o projeto, o acesso é negado;
3. regra individual na pasta vence a regra de perfil na mesma pasta;
4. sem regra na pasta, sobe para a pasta pai e repete;
5. sem regra até a raiz, nega. O padrão é negar, nunca permitir;
6. regra com prazo vencido é ignorada.

O nível `X` existe como registro, e não como ausência de registro. É ele que retira, em
uma subpasta, um acesso herdado da pasta acima.

O `R*` é sempre uma regra individual. Sob esse nível a pessoa enxerga apenas o que ela
mesma enviou, e enxerga as subpastas em que recebeu regra própria. É assim que o parceiro
externo chega ao seu núcleo e o orientando à sua subpasta, sem ver o material dos demais.

| Nível | Ver | Baixar | Enviar | Organizar | Excluir | Comentar | Gerir acesso |
|---|---|---|---|---|---|---|---|
| A | sim | tudo | sim | sim | sim | sim | sim |
| R | sim | tudo | sim | sim | para a lixeira | sim | não |
| R* | sim | só o próprio | sim | só o próprio | só o próprio | sim | não |
| C | sim | tudo | não | não | não | sim | não |
| I | sim | tudo | não | não | não | não | não |
| X | não | não | não | não | não | não | não |

## 4. Estrutura de pastas e matriz vivem em dados

As 16 pastas do projeto, as subpastas do núcleo e a matriz do modelo estão nas tabelas
`modelo_pasta` e `modelo_permissao`, carregadas por `db/seed.sql`. Criar um projeto
replica esse modelo. Revisar a matriz do grupo é alterar esses registros, sem tocar no
código e sem depender de desenvolvedor.

Quando a coordenação fechar as pendências P09 a P18 do documento de pendências, a
mudança entra por ali.

## 5. Organização do código

```
src/
  config/        configuração e conexão com o banco
  middlewares/   sessão, autorização por pasta, token de formulário, recebimento de arquivo
  services/      regras de negócio, incluindo o motor de permissão
    armazenamento/  adaptadores local e S3
  rotas/         rotas HTTP
  views/         páginas em EJS com Bootstrap
  public/        css e js servidos ao navegador
db/              schema.sql, seed.sql e carga dos projetos
tests/           teste de ponta a ponta
```

Nenhuma verificação de permissão fica apenas na interface. Toda rota passa pelo filtro de
sessão e pelo filtro de autorização antes do controlador.

## 6. Testes

Com o servidor no ar:

```bash
npm run teste
```

O teste sobe do zero: banco vazio, migração na subida e 54 verificações.
Ele entra com os cinco perfis e confere, entre outras coisas, que a matriz é aplicada
pasta a pasta, que o acesso restrito esconde o material dos outros, que a URL de download
expira e não pode ser forjada, que a busca não revela o que a pessoa não pode ver, e que a
revogação de convite corta o acesso na hora.

Para conferir o armazenamento em nuvem sem precisar de conta, há um servidor de
objetos falso que responde no protocolo S3:

```bash
npm run s3:falso &
STORAGE_DRIVER=s3 S3_BUCKET=teste S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY_ID=chave S3_SECRET_ACCESS_KEY=segredo npm run teste:s3
```

As mesmas variáveis apontadas para uma conta real conferem o Cloudflare R2, o
Amazon S3, o Backblaze B2 ou o MinIO.

## 7. Segurança

- senha com bcrypt, mínimo de doze caracteres, limite de tentativas de login;
- sessão em cookie `HttpOnly`, `SameSite` e `Secure` em produção, guardada no banco;
- token contra requisição forjada em todos os formulários;
- todas as consultas com instrução preparada;
- arquivo entregue apenas por URL assinada de curta duração, nunca por endereço fixo;
- bucket sempre privado. Nenhum objeto tem endereço público;
- nome do objeto gerado pelo sistema, com proteção contra caminho manipulado;
- pastas sensíveis (02, 03 e 04) marcadas no modelo, com aviso na tela e registro de
  cada download;
- log de auditoria somente de inserção, sem tela de edição ou exclusão.

## 8. O que ainda não está implementado

Estes pontos estão previstos no documento de arquitetura e ficaram para as próximas fases:

- extração do texto de PDF e DOCX para busca dentro do conteúdo (fase 3);
- painel de acompanhamento da pasta 08 (fase 3);
- exportação do acervo de um projeto (fase 3);
- entrada por conta Google, prevista como RF02;
- envio direto do navegador para o S3 por URL assinada. Hoje o arquivo passa pelo
  servidor, o que é mais simples e funciona igual nos dois armazenamentos;
- verificação antivírus no recebimento, que depende de serviço externo;
- rotina automática de limpeza da lixeira após o prazo de carência.

## 9. Antes de usar com dados reais

- trocar todas as senhas de demonstração e remover as contas de exemplo;
- definir `SESSION_SECRET` e publicar apenas por HTTPS;
- configurar `STORAGE_DRIVER=s3` com versionamento ativo no bucket;
- programar a cópia diária do banco e testar a restauração;
- conferir a matriz carregada em `modelo_permissao` com a versão aprovada pela coordenação.
