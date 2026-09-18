-- =====================================================================
-- Repositório Digital Multiprojeto do GPAQE
-- Esquema do banco de dados (MySQL 8 e MariaDB 10.6 ou superior)
-- =====================================================================
SET NAMES utf8mb4;

DROP TABLE IF EXISTS log_auditoria;
DROP TABLE IF EXISTS convite;
DROP TABLE IF EXISTS metadado;
DROP TABLE IF EXISTS permissao;
DROP TABLE IF EXISTS versao_arquivo;
DROP TABLE IF EXISTS arquivo;
DROP TABLE IF EXISTS pasta;
DROP TABLE IF EXISTS vinculo;
DROP TABLE IF EXISTS nucleo;
DROP TABLE IF EXISTS projeto;
DROP TABLE IF EXISTS usuario;
DROP TABLE IF EXISTS modelo_permissao;
DROP TABLE IF EXISTS modelo_pasta;
DROP TABLE IF EXISTS perfil;

-- ---------------------------------------------------------------- perfis
CREATE TABLE perfil (
  numero        TINYINT PRIMARY KEY,
  nome          VARCHAR(80)  NOT NULL,
  descricao     VARCHAR(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- pessoas
CREATE TABLE usuario (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  senha_hash    VARCHAR(255) NULL,
  origem        ENUM('local','google') NOT NULL DEFAULT 'local',
  instituicao   VARCHAR(150) NULL,
  admin_sistema TINYINT(1) NOT NULL DEFAULT 0,
  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- projetos
CREATE TABLE projeto (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(200) NOT NULL,
  sigla         VARCHAR(30)  NOT NULL UNIQUE,
  descricao     TEXT NULL,
  situacao      ENUM('ativo','encerrado') NOT NULL DEFAULT 'ativo',
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE nucleo (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  projeto_id    INT NOT NULL,
  nome          VARCHAR(150) NOT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_nucleo_projeto FOREIGN KEY (projeto_id) REFERENCES projeto(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vinculo (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT NOT NULL,
  projeto_id    INT NOT NULL,
  perfil        TINYINT NOT NULL,
  nucleo_id     INT NULL,
  inicio        DATE NOT NULL,
  fim           DATE NULL,
  revogado_em   DATETIME NULL,
  UNIQUE KEY uk_vinculo (usuario_id, projeto_id),
  CONSTRAINT fk_vinculo_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
  CONSTRAINT fk_vinculo_projeto FOREIGN KEY (projeto_id) REFERENCES projeto(id) ON DELETE CASCADE,
  CONSTRAINT fk_vinculo_nucleo  FOREIGN KEY (nucleo_id)  REFERENCES nucleo(id)  ON DELETE SET NULL,
  CONSTRAINT fk_vinculo_perfil  FOREIGN KEY (perfil)     REFERENCES perfil(numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- árvore
-- projeto_id nulo identifica o Nível Grupo, comum a todos os projetos.
CREATE TABLE pasta (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  projeto_id    INT NULL,
  pai_id        INT NULL,
  nucleo_id     INT NULL,
  nome          VARCHAR(200) NOT NULL,
  codigo        VARCHAR(10) NULL,
  descricao     VARCHAR(400) NULL,
  publica       TINYINT(1) NOT NULL DEFAULT 0,
  sensivel      TINYINT(1) NOT NULL DEFAULT 0,
  ordem         INT NOT NULL DEFAULT 0,
  criada_por    INT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pasta_autor   FOREIGN KEY (criada_por) REFERENCES usuario(id) ON DELETE SET NULL,
  CONSTRAINT fk_pasta_projeto FOREIGN KEY (projeto_id) REFERENCES projeto(id) ON DELETE CASCADE,
  CONSTRAINT fk_pasta_pai     FOREIGN KEY (pai_id)     REFERENCES pasta(id)   ON DELETE CASCADE,
  CONSTRAINT fk_pasta_nucleo  FOREIGN KEY (nucleo_id)  REFERENCES nucleo(id)  ON DELETE SET NULL,
  INDEX ix_pasta_pai (pai_id),
  INDEX ix_pasta_projeto (projeto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- arquivos
CREATE TABLE arquivo (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  pasta_id      INT NOT NULL,
  nome          VARCHAR(255) NOT NULL,
  descricao     VARCHAR(500) NULL,
  criado_por    INT NOT NULL,
  atalho_para   INT NULL,
  estado        ENUM('ativo','lixeira','removido') NOT NULL DEFAULT 'ativo',
  excluido_em   DATETIME NULL,
  excluido_por  INT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_arquivo_pasta   FOREIGN KEY (pasta_id)    REFERENCES pasta(id)   ON DELETE CASCADE,
  CONSTRAINT fk_arquivo_autor   FOREIGN KEY (criado_por)  REFERENCES usuario(id),
  CONSTRAINT fk_arquivo_atalho  FOREIGN KEY (atalho_para) REFERENCES arquivo(id) ON DELETE CASCADE,
  INDEX ix_arquivo_pasta (pasta_id, estado),
  INDEX ix_arquivo_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE versao_arquivo (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  arquivo_id    INT NOT NULL,
  numero        INT NOT NULL,
  chave_objeto  VARCHAR(400) NOT NULL,
  nome_original VARCHAR(255) NOT NULL,
  tamanho_bytes BIGINT NOT NULL,
  hash_sha256   CHAR(64) NOT NULL,
  tipo_mime     VARCHAR(150) NULL,
  comentario    VARCHAR(300) NULL,
  enviado_por   INT NOT NULL,
  enviado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_versao (arquivo_id, numero),
  CONSTRAINT fk_versao_arquivo FOREIGN KEY (arquivo_id)  REFERENCES arquivo(id) ON DELETE CASCADE,
  CONSTRAINT fk_versao_autor   FOREIGN KEY (enviado_por) REFERENCES usuario(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- permissões
-- perfil preenchido: regra vale para todos daquele perfil no projeto.
-- usuario_id preenchido: regra individual, usada no acesso restrito (R*).
-- As colunas geradas garantem unicidade mesmo com valores nulos.
CREATE TABLE permissao (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  pasta_id      INT NOT NULL,
  perfil        TINYINT NULL,
  usuario_id    INT NULL,
  nivel         ENUM('A','R','R*','C','I','X') NOT NULL,
  expira_em     DATETIME NULL,
  concedida_por INT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  perfil_k      TINYINT AS (IFNULL(perfil, 0))     STORED,
  usuario_k     INT     AS (IFNULL(usuario_id, 0)) STORED,
  UNIQUE KEY uk_permissao (pasta_id, perfil_k, usuario_k),
  CONSTRAINT fk_perm_pasta   FOREIGN KEY (pasta_id)   REFERENCES pasta(id)   ON DELETE CASCADE,
  -- Sem ON DELETE CASCADE de propósito: o MySQL não aceita ação em cascata
  -- sobre a coluna que serve de base para uma coluna gerada STORED, e usuario_id
  -- é a base de usuario_k. Na prática o sistema nunca apaga usuário, apenas
  -- encerra o vínculo, então a restrição não atrapalha.
  CONSTRAINT fk_perm_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  CONSTRAINT fk_perm_perfil  FOREIGN KEY (perfil)     REFERENCES perfil(numero),
  INDEX ix_perm_pasta (pasta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- metadados
CREATE TABLE metadado (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  arquivo_id    INT NULL,
  pasta_id      INT NULL,
  chave         VARCHAR(60)  NOT NULL,
  valor         VARCHAR(300) NOT NULL,
  CONSTRAINT fk_meta_arquivo FOREIGN KEY (arquivo_id) REFERENCES arquivo(id) ON DELETE CASCADE,
  CONSTRAINT fk_meta_pasta   FOREIGN KEY (pasta_id)   REFERENCES pasta(id)   ON DELETE CASCADE,
  INDEX ix_meta_chave (chave, valor),
  INDEX ix_meta_arquivo (arquivo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- convites
CREATE TABLE convite (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(150) NOT NULL,
  nome          VARCHAR(150) NOT NULL,
  projeto_id    INT NOT NULL,
  pasta_id      INT NOT NULL,
  perfil        TINYINT NOT NULL,
  nivel         ENUM('A','R','R*','C','I') NOT NULL DEFAULT 'C',
  token         CHAR(48) NOT NULL UNIQUE,
  expira_em     DATETIME NOT NULL,
  criado_por    INT NOT NULL,
  aceito_em     DATETIME NULL,
  revogado_em   DATETIME NULL,
  usuario_id    INT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_convite_projeto FOREIGN KEY (projeto_id) REFERENCES projeto(id) ON DELETE CASCADE,
  CONSTRAINT fk_convite_pasta   FOREIGN KEY (pasta_id)   REFERENCES pasta(id)   ON DELETE CASCADE,
  CONSTRAINT fk_convite_autor   FOREIGN KEY (criado_por) REFERENCES usuario(id),
  CONSTRAINT fk_convite_usuario FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- auditoria
CREATE TABLE log_auditoria (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT NULL,
  acao          VARCHAR(40)  NOT NULL,
  entidade      VARCHAR(30)  NOT NULL,
  entidade_id   INT NULL,
  projeto_id    INT NULL,
  detalhe       VARCHAR(400) NULL,
  ip            VARCHAR(45)  NULL,
  ocorrido_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_log_entidade (entidade, entidade_id),
  INDEX ix_log_data (ocorrido_em),
  INDEX ix_log_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------- modelos
-- Estrutura padrão replicada a cada novo projeto e a cada novo núcleo.
CREATE TABLE modelo_pasta (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  escopo        ENUM('projeto','nucleo') NOT NULL,
  codigo        VARCHAR(10) NULL,
  nome          VARCHAR(200) NOT NULL,
  descricao     VARCHAR(400) NULL,
  publica       TINYINT(1) NOT NULL DEFAULT 0,
  sensivel      TINYINT(1) NOT NULL DEFAULT 0,
  ordem         INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE modelo_permissao (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  modelo_pasta_id  INT NOT NULL,
  perfil           TINYINT NOT NULL,
  nivel            ENUM('A','R','R*','C','I','X') NOT NULL,
  UNIQUE KEY uk_modelo_perm (modelo_pasta_id, perfil),
  CONSTRAINT fk_mperm_modelo FOREIGN KEY (modelo_pasta_id) REFERENCES modelo_pasta(id) ON DELETE CASCADE,
  CONSTRAINT fk_mperm_perfil FOREIGN KEY (perfil)          REFERENCES perfil(numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
