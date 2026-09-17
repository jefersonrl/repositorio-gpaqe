-- =====================================================================
-- Dados de referência: perfis, modelo das pastas, matriz RACI do modelo
-- e Nível Grupo. Executar depois de schema.sql.
-- =====================================================================
SET NAMES utf8mb4;

INSERT INTO perfil (numero, nome, descricao) VALUES
 (1, 'Administrador/Coordenador (PI)', 'Gestão documental, validação e liberação de conteúdos. Único perfil com autoridade final em todas as pastas.'),
 (2, 'Colaborador Interno', 'Professor da pós-graduação com liderança no projeto. Leitura e escrita nas pastas de trabalho de pesquisa.'),
 (3, 'Colaborador Externo/Parceiro Internacional', 'Pesquisador de instituição parceira. Acesso restrito ao núcleo ou frente em que atua.'),
 (4, 'Consultor/Revisor Externo', 'Parecerista ou revisor. Leitura pontual dos produtos, sem edição.'),
 (5, 'Aluno de IC/Mestrado/Doutorado', 'Orientando vinculado a um núcleo ou frente. Escrita restrita à própria subpasta.');

-- ------------------------------------------------------------ modelo do projeto
INSERT INTO modelo_pasta (escopo, codigo, nome, descricao, publica, sensivel, ordem) VALUES
 ('projeto','00','00_APRESENTACAO_PUBLICA','Sobre o projeto, objetivos, equipe e cronograma geral. Sem fluxo de notícias.',1,0,0),
 ('projeto','01','01_GOVERNANCA_E_GESTAO','Plano de trabalho, cronogramas, atribuições, termos de participação e acordos.',0,0,1),
 ('projeto','02','02_FOMENTO','Proposta, orçamento, termo de outorga, relatórios para a agência e pareceres.',0,1,2),
 ('projeto','03','03_ETICA_INTEGRIDADE_E_PROTECAO_DE_DADOS','CEP e Plataforma Brasil, TCLE, LGPD e GDPR, conflitos de interesse.',0,1,3),
 ('projeto','04','04_GESTAO_DE_DADOS','Plano de gestão de dados, dicionário, metadados, bases e scripts.',0,1,4),
 ('projeto','05','05_REFERENCIAL_TEORICO_E_DOCUMENTAL','Revisões de literatura, marcos conceituais e frameworks.',0,0,5),
 ('projeto','06','06_METODOLOGIA_E_INSTRUMENTOS','Desenho metodológico, protocolos e instrumentos na versão de trabalho.',0,0,6),
 ('projeto','07','07_NUCLEOS_E_OU_FRENTES_DE_PESQUISA','Equipes temáticas, cada uma com sua própria subpasta.',0,0,7),
 ('projeto','08','08_CICLOS_E_ETAPAS_DA_PESQUISA','Painel de acompanhamento. Não guarda arquivos originais.',0,0,8),
 ('projeto','09','09_REUNIOES_E_ACOMPANHAMENTO','Atas, apresentações e encaminhamentos.',0,0,9),
 ('projeto','10','10_RESULTADOS_E_ANALISES','Resultados preliminares, análises e indicadores.',0,0,10),
 ('projeto','11','11_PRODUCAO_CIENTIFICA','Artigos, trabalhos em eventos, livros e capítulos. Pasta canônica dos relatórios científicos.',0,0,11),
 ('projeto','12','12_PRODUTOS_TECNICO_CIENTIFICOS','Modelos, matrizes de indicadores, painéis e guias. Pasta canônica dos produtos.',0,0,12),
 ('projeto','13','13_INTERNACIONALIZACAO_E_REDE','Instituições parceiras, cooperação, missões e workshops.',0,0,13),
 ('projeto','14','14_COMUNICACAO_E_DISSEMINACAO','Notícias, folders, infográficos, eventos e materiais públicos.',0,0,14),
 ('projeto','15','15_CIENCIA_ABERTA_E_PRODUTOS_FINAIS','Apenas links e DOI do que já está oficializado em 11 e 12.',0,0,15);

-- ------------------------------------------------------------ modelo do núcleo
INSERT INTO modelo_pasta (escopo, codigo, nome, descricao, publica, sensivel, ordem) VALUES
 ('nucleo','01','01_PLANEJAMENTO','Plano de trabalho e cronograma do núcleo.',0,0,0),
 ('nucleo','02','02_REUNIOES','Atas e apresentações do núcleo.',0,0,1),
 ('nucleo','03','03_DADOS','Dados em coleta e tratamento pelo núcleo.',0,0,2),
 ('nucleo','04','04_PRODUTOS','Produtos em elaboração pelo núcleo.',0,0,3),
 ('nucleo','05','05_ENTREGAS','Material concluído e entregue à coordenação.',0,0,4),
 ('nucleo','06','06_ORIENTANDOS','Subpastas individuais dos orientandos vinculados ao núcleo.',0,0,5);

-- ------------------------------------------------------------ matriz RACI do modelo
-- Reproduz a seção 5 do Roteiro Técnico. X corresponde ao traço da matriz.
INSERT INTO modelo_permissao (modelo_pasta_id, perfil, nivel)
SELECT m.id, p.perfil, p.nivel FROM modelo_pasta m JOIN (
  SELECT 'projeto' esc,'00' cod,1 perfil,'A'  nivel UNION ALL SELECT 'projeto','00',2,'C' UNION ALL SELECT 'projeto','00',3,'C' UNION ALL SELECT 'projeto','00',4,'I' UNION ALL SELECT 'projeto','00',5,'I' UNION ALL
  SELECT 'projeto','01',1,'A' UNION ALL SELECT 'projeto','01',2,'I' UNION ALL SELECT 'projeto','01',3,'X' UNION ALL SELECT 'projeto','01',4,'X' UNION ALL SELECT 'projeto','01',5,'X' UNION ALL
  SELECT 'projeto','02',1,'A' UNION ALL SELECT 'projeto','02',2,'C' UNION ALL SELECT 'projeto','02',3,'X' UNION ALL SELECT 'projeto','02',4,'X' UNION ALL SELECT 'projeto','02',5,'R*' UNION ALL
  SELECT 'projeto','03',1,'A' UNION ALL SELECT 'projeto','03',2,'C' UNION ALL SELECT 'projeto','03',3,'X' UNION ALL SELECT 'projeto','03',4,'X' UNION ALL SELECT 'projeto','03',5,'I' UNION ALL
  SELECT 'projeto','04',1,'A' UNION ALL SELECT 'projeto','04',2,'R' UNION ALL SELECT 'projeto','04',3,'X' UNION ALL SELECT 'projeto','04',4,'X' UNION ALL SELECT 'projeto','04',5,'R*' UNION ALL
  SELECT 'projeto','05',1,'A' UNION ALL SELECT 'projeto','05',2,'R' UNION ALL SELECT 'projeto','05',3,'C' UNION ALL SELECT 'projeto','05',4,'I' UNION ALL SELECT 'projeto','05',5,'R' UNION ALL
  SELECT 'projeto','06',1,'A' UNION ALL SELECT 'projeto','06',2,'R' UNION ALL SELECT 'projeto','06',3,'C' UNION ALL SELECT 'projeto','06',4,'I' UNION ALL SELECT 'projeto','06',5,'I' UNION ALL
  SELECT 'projeto','07',1,'A' UNION ALL SELECT 'projeto','07',2,'R' UNION ALL SELECT 'projeto','07',3,'R*' UNION ALL SELECT 'projeto','07',4,'I' UNION ALL SELECT 'projeto','07',5,'R*' UNION ALL
  SELECT 'projeto','08',1,'A' UNION ALL SELECT 'projeto','08',2,'I' UNION ALL SELECT 'projeto','08',3,'I' UNION ALL SELECT 'projeto','08',4,'I' UNION ALL SELECT 'projeto','08',5,'I' UNION ALL
  SELECT 'projeto','09',1,'A' UNION ALL SELECT 'projeto','09',2,'R' UNION ALL SELECT 'projeto','09',3,'C' UNION ALL SELECT 'projeto','09',4,'I' UNION ALL SELECT 'projeto','09',5,'I' UNION ALL
  SELECT 'projeto','10',1,'A' UNION ALL SELECT 'projeto','10',2,'R' UNION ALL SELECT 'projeto','10',3,'C' UNION ALL SELECT 'projeto','10',4,'I' UNION ALL SELECT 'projeto','10',5,'R*' UNION ALL
  SELECT 'projeto','11',1,'A' UNION ALL SELECT 'projeto','11',2,'R' UNION ALL SELECT 'projeto','11',3,'C' UNION ALL SELECT 'projeto','11',4,'I' UNION ALL SELECT 'projeto','11',5,'I' UNION ALL
  SELECT 'projeto','12',1,'A' UNION ALL SELECT 'projeto','12',2,'R' UNION ALL SELECT 'projeto','12',3,'C' UNION ALL SELECT 'projeto','12',4,'I' UNION ALL SELECT 'projeto','12',5,'I' UNION ALL
  SELECT 'projeto','13',1,'A' UNION ALL SELECT 'projeto','13',2,'C' UNION ALL SELECT 'projeto','13',3,'R' UNION ALL SELECT 'projeto','13',4,'I' UNION ALL SELECT 'projeto','13',5,'X' UNION ALL
  SELECT 'projeto','14',1,'A' UNION ALL SELECT 'projeto','14',2,'C' UNION ALL SELECT 'projeto','14',3,'C' UNION ALL SELECT 'projeto','14',4,'I' UNION ALL SELECT 'projeto','14',5,'I' UNION ALL
  SELECT 'projeto','15',1,'A' UNION ALL SELECT 'projeto','15',2,'I' UNION ALL SELECT 'projeto','15',3,'I' UNION ALL SELECT 'projeto','15',4,'I' UNION ALL SELECT 'projeto','15',5,'I' UNION ALL
  SELECT 'nucleo','01',1,'A' UNION ALL SELECT 'nucleo','01',2,'R' UNION ALL SELECT 'nucleo','01',3,'R*' UNION ALL SELECT 'nucleo','01',4,'I' UNION ALL SELECT 'nucleo','01',5,'I' UNION ALL
  SELECT 'nucleo','02',1,'A' UNION ALL SELECT 'nucleo','02',2,'R' UNION ALL SELECT 'nucleo','02',3,'R*' UNION ALL SELECT 'nucleo','02',4,'I' UNION ALL SELECT 'nucleo','02',5,'I' UNION ALL
  SELECT 'nucleo','03',1,'A' UNION ALL SELECT 'nucleo','03',2,'R' UNION ALL SELECT 'nucleo','03',3,'R*' UNION ALL SELECT 'nucleo','03',4,'X' UNION ALL SELECT 'nucleo','03',5,'R*' UNION ALL
  SELECT 'nucleo','04',1,'A' UNION ALL SELECT 'nucleo','04',2,'R' UNION ALL SELECT 'nucleo','04',3,'R*' UNION ALL SELECT 'nucleo','04',4,'I' UNION ALL SELECT 'nucleo','04',5,'R*' UNION ALL
  SELECT 'nucleo','05',1,'A' UNION ALL SELECT 'nucleo','05',2,'R' UNION ALL SELECT 'nucleo','05',3,'C' UNION ALL SELECT 'nucleo','05',4,'I' UNION ALL SELECT 'nucleo','05',5,'I' UNION ALL
  SELECT 'nucleo','06',1,'A' UNION ALL SELECT 'nucleo','06',2,'R' UNION ALL SELECT 'nucleo','06',3,'X' UNION ALL SELECT 'nucleo','06',4,'X' UNION ALL SELECT 'nucleo','06',5,'R*'
) p ON p.esc = m.escopo AND p.cod = m.codigo;

-- ------------------------------------------------------------ Nível Grupo
INSERT INTO pasta (projeto_id, pai_id, nome, codigo, descricao, ordem)
VALUES (NULL, NULL, '00_RECURSOS_COMPARTILHADOS_DO_GRUPO', '00',
        'Espaço único do GPAQE, comum a todos os projetos.', 0);
SET @grupo := LAST_INSERT_ID();

INSERT INTO pasta (projeto_id, pai_id, nome, descricao, ordem) VALUES
 (NULL, @grupo, 'Instrumentos_Validados_Oficiais', 'Versão oficial dos instrumentos usados por mais de um projeto.', 0),
 (NULL, @grupo, 'Modelos_Termos_e_Acordos_de_Cooperacao', 'Modelos de termos e acordos do grupo.', 1),
 (NULL, @grupo, 'Governanca_e_Politicas_do_GPAQE', 'Roteiro técnico, matriz RACI e políticas do grupo.', 2),
 (NULL, @grupo, 'Identidade_Visual_e_Materiais_Institucionais', 'Marca, modelos de apresentação e material institucional.', 3);

INSERT INTO permissao (pasta_id, perfil, nivel, concedida_por)
SELECT p.id, x.perfil, x.nivel, NULL
FROM pasta p
JOIN (SELECT 1 perfil,'A' nivel UNION ALL SELECT 2,'C' UNION ALL SELECT 3,'I'
      UNION ALL SELECT 4,'I' UNION ALL SELECT 5,'I') x
WHERE p.projeto_id IS NULL;
