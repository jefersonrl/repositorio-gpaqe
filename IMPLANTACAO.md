# Publicar o sistema em um ambiente online de demonstração

Guia para colocar o Repositório GPAQE no ar em um endereço público, usando apenas
planos gratuitos. O objetivo é demonstrar o sistema funcionando, não operar com
dados reais de pesquisa.

Tempo estimado: de 30 a 45 minutos, sendo a maior parte espera de provisionamento.

São quatro contas, todas gratuitas e sem cartão:

| Serviço | Para que serve | Plano |
|---|---|---|
| GitHub | guardar o código, de onde a hospedagem lê | gratuito |
| Aiven | banco MySQL | gratuito, 1 GB |
| Cloudflare R2 | guardar os arquivos enviados | gratuito, 10 GB |
| Render | rodar a aplicação Node.js | gratuito, 750 horas por mês |

O R2 não é obrigatório para o sistema subir, mas sem ele os arquivos enviados
somem a cada reinício, porque o plano gratuito do Render não tem disco
permanente. Como ele é gratuito e a configuração é só de variáveis, o guia já o
inclui no caminho principal.

---

## Passo 1. Código no GitHub

O Render lê o código de um repositório Git.

1. Crie uma conta em github.com, se ainda não tiver.
2. Crie um repositório novo, pode ser privado, com o nome `repositorio-gpaqe`.
3. Descompacte o projeto no seu computador e, dentro da pasta, rode:

```bash
git init
git add .
git commit -m "Repositório digital multiprojeto do GPAQE"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/repositorio-gpaqe.git
git push -u origin main
```

O arquivo `.gitignore` já impede o envio de `node_modules`, da pasta `storage` e
do `.env`. Confira que o `.env` **não** foi para o repositório antes de seguir.

## Passo 2. Banco MySQL no Aiven

1. Crie a conta em aiven.io. Não pede cartão.
2. Em **Create service**, escolha **MySQL**.
3. Em plano, escolha **Free**. Em nuvem e região, escolha algo próximo do Brasil,
   por exemplo `aws-sa-east-1` (São Paulo) ou `aws-us-east-1`.
4. Dê um nome ao serviço e confirme. O provisionamento leva alguns minutos, até o
   estado mudar de `REBUILDING` para `RUNNING`.
5. Na tela do serviço, na aba **Overview**, copie:
   - **Service URI**, algo como
     `mysql://avnadmin:SENHA@nome-projeto.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
   - o arquivo **CA Certificate**, pelo botão de download. Abra o arquivo em um
     editor de texto, é um bloco que começa com `-----BEGIN CERTIFICATE-----`.

O plano gratuito do Aiven tem 1 GB de espaço e é desligado se ficar muito tempo
sem uso, com aviso antes. Para uma demonstração é suficiente.

## Passo 3. Armazenamento no Cloudflare R2

O R2 é compatível com o protocolo S3, então a aplicação conversa com ele sem
nenhuma mudança de código.

1. Crie a conta em cloudflare.com. O R2 aparece no menu lateral do painel.
2. Na primeira vez, o R2 pede para você ativar o serviço. O plano gratuito tem
   10 GB de armazenamento, 1 milhão de escritas e 10 milhões de leituras por mês,
   e não cobra pela saída de dados.
3. Clique em **Create bucket**, dê o nome `gpaqe-demo` e confirme. Deixe o bucket
   **privado**: o sistema entrega cada arquivo por URL assinada de curta duração,
   e um bucket aberto anularia todo o controle de acesso da matriz.
4. Anote o **endpoint da conta**, que aparece na tela do bucket, em Settings, no
   formato `https://<ID_DA_CONTA>.r2.cloudflarestorage.com`.
5. Volte para a tela inicial do R2 e clique em **Manage R2 API Tokens**, depois
   **Create API token**:
   - permissão **Object Read & Write**;
   - em **Specify bucket**, escolha apenas `gpaqe-demo`;
   - crie e copie o **Access Key ID** e o **Secret Access Key**. O segredo só
     aparece uma vez.

> Uma observação técnica que já está resolvida no código: desde a versão 3.729 a
> biblioteca da AWS passou a enviar o arquivo em pedaços com soma de verificação
> no final, e o R2 recusa esse formato. A aplicação configura o cliente para só
> calcular a soma quando a operação exige, então o envio funciona. Se você ler
> relatos de erro `Unsupported header 'x-amz-checksum-crc32'` com R2, é disso que
> se trata.

## Passo 4. Aplicação no Render

1. Crie a conta em render.com e conecte sua conta do GitHub.
2. Clique em **New**, depois **Web Service**, e escolha o repositório
   `repositorio-gpaqe`.
3. Preencha:
   - **Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Instance Type**: Free
   - **Health Check Path**: `/saude`
4. Em **Environment Variables**, cadastre:

| Nome | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | qualquer texto longo e aleatório, com 40 caracteres ou mais |
| `DB_URL` | a Service URI copiada do Aiven |
| `DB_SSL_CA` | o conteúdo do certificado, colado inteiro, com as quebras de linha |
| `BASE_URL` | o endereço que o Render vai gerar, por exemplo `https://repositorio-gpaqe.onrender.com` |
| `MIGRAR_AO_SUBIR` | `true` |
| `MODO_DEMONSTRACAO` | `true` |
| `MAX_UPLOAD_MB` | `25` |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | `gpaqe-demo` |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | `https://<ID_DA_CONTA>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | o Access Key ID do token do R2 |
| `S3_SECRET_ACCESS_KEY` | o Secret Access Key do token do R2 |
| `S3_FORCE_PATH_STYLE` | `true` |

5. Clique em **Create Web Service** e acompanhe o log.

Na primeira subida a aplicação cria as tabelas, carrega os perfis, o modelo das
16 pastas e a matriz RACI, e em seguida cria os dois projetos com as contas de
exemplo. O log mostra cada etapa. Depois disso, o endereço já abre a tela de
entrada, com a lista de contas de demonstração visível.

> O `BASE_URL` você só conhece depois de criar o serviço. Se precisar, crie com um
> valor qualquer, veja o endereço gerado e corrija a variável em seguida, o que
> dispara uma nova implantação.

## Passo 5. Conferir

Abra o endereço e verifique:

- a tela de entrada mostra a tarja de demonstração e as cinco contas;
- entrando como `coordenacao@gpaqe.exemplo`, os dois projetos aparecem, cada um
  com as 16 pastas;
- entrando como `externo@gpaqe.exemplo`, a pasta 01 não abre, e a 07 mostra apenas
  o Núcleo 01;
- `/saude` responde `{"situacao":"ok","banco":"ok"}`;
- entrando como coordenação, envie um arquivo qualquer em uma pasta e baixe de
  volta. Se o download funciona, o R2 está certo. No painel do Cloudflare, o
  bucket deve mostrar o objeto, com nome gerado pelo sistema, nunca o nome
  original do arquivo.

## O que muda no plano gratuito

**A aplicação hiberna.** Sem acesso por 15 minutos, o Render desliga o serviço, e
a primeira visita seguinte demora cerca de um minuto para responder. Avise a
pessoa, ou abra o endereço alguns minutos antes da conversa.

Se quiser evitar a hibernação durante um período de demonstração, configure um
serviço gratuito de monitoramento, por exemplo UptimeRobot, para consultar
`https://SEU-ENDERECO/saude` a cada 10 minutos. Isso consome as 750 horas mensais
do plano, que dão para manter um único serviço no ar o mês inteiro.

**Os arquivos ficam no R2, não no Render.** Por isso eles sobrevivem aos
reinícios e à hibernação. Se você preferir pular o passo 3 e usar
`STORAGE_DRIVER=local`, saiba que o plano gratuito do Render não tem disco
permanente: o banco continua intacto, mas o conteúdo dos arquivos se perde a cada
reinício, e o arquivo aparece na listagem sem conseguir baixar.

**O banco tem 1 GB.** Mais que suficiente para demonstração.

## Antes de usar com dados reais

Este guia produz um ambiente de demonstração. Para uso real, mude:

- `MODO_DEMONSTRACAO=false`, e apague as contas de exemplo;
- crie um bucket separado do de demonstração, e um token de acesso próprio;
- troque todas as senhas, a começar pela da coordenação;
- `MIGRAR_AO_SUBIR=false` depois da primeira carga, para que a aplicação não
  tenha motivo para tocar na estrutura do banco;
- saia do plano gratuito, para ter disco permanente, backup e ausência de
  hibernação;
- programe a cópia diária do banco e teste a restauração;
- reveja as pendências institucionais antes de colocar qualquer documento real,
  principalmente as de titularidade da conta e de proteção de dados.
