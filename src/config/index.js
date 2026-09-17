'use strict';
require('dotenv').config();

const bool = (v, padrao = false) =>
  v === undefined ? padrao : ['1', 'true', 'sim', 'yes'].includes(String(v).toLowerCase());

/**
 * Em hospedagem em nuvem o banco costuma ser entregue como uma única URL.
 * Quando DB_URL existe, ela tem prioridade sobre as variáveis separadas.
 */
function bancoPelaUrl(url) {
  if (!url) return null;
  const u = new URL(url);
  const modoSsl = (u.searchParams.get('ssl-mode') || u.searchParams.get('sslmode') || '').toUpperCase();
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
    exigeSsl: ['REQUIRED', 'REQUIRE', 'VERIFY_CA', 'VERIFY_IDENTITY'].includes(modoSsl)
  };
}

const doUrl = bancoPelaUrl(process.env.DB_URL);

const config = {
  ambiente: process.env.NODE_ENV || 'development',
  porta: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  segredoSessao: process.env.SESSION_SECRET || 'segredo-de-desenvolvimento',

  banco: {
    host: doUrl ? doUrl.host : (process.env.DB_HOST || '127.0.0.1'),
    port: doUrl ? doUrl.port : Number(process.env.DB_PORT || 3306),
    user: doUrl ? doUrl.user : (process.env.DB_USER || 'root'),
    password: doUrl ? doUrl.password : (process.env.DB_PASSWORD || ''),
    database: doUrl ? doUrl.database : (process.env.DB_NAME || 'gpaqe'),
    charset: 'utf8mb4',
    // TLS: com DB_SSL_CA o certificado do servidor é conferido de verdade.
    // Sem a autoridade certificadora, a conexão continua cifrada, porém o
    // certificado não é verificado. Em produção, sempre informe a CA.
    ssl: (bool(process.env.DB_SSL) || (doUrl && doUrl.exigeSsl))
      ? {
          minVersion: 'TLSv1.2',
          ca: process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined,
          rejectUnauthorized: Boolean(process.env.DB_SSL_CA)
        }
      : undefined
  },

  modoDemonstracao: bool(process.env.MODO_DEMONSTRACAO),
  migrarAoSubir: bool(process.env.MIGRAR_AO_SUBIR),

  armazenamento: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    dirLocal: process.env.STORAGE_LOCAL_DIR || './storage',
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 500),
    minutosUrlAssinada: Number(process.env.URL_ASSINADA_MINUTOS || 10),
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true)
    }
  },

  diasCarenciaLixeira: Number(process.env.DIAS_CARENCIA_LIXEIRA || 30)
};

if (config.ambiente === 'production' && config.segredoSessao === 'segredo-de-desenvolvimento') {
  throw new Error('Defina SESSION_SECRET antes de rodar em produção.');
}

module.exports = config;
