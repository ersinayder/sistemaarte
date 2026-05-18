# Tela de Configuracoes Administrativas

Data: 2026-05-18

## Objetivo

Criar uma tela de Configuracoes do sistema, acessivel somente para usuarios `admin`, para centralizar os dados operacionais da instalacao e reduzir dependencia de ajustes manuais em `.env`.

A primeira prioridade e permitir que os dados da empresa e os ajustes fiscais usados na NF-e sejam configurados pela interface, mantendo uma migracao segura: valores salvos no banco tem prioridade, e o `.env` continua como fallback enquanto campos ainda nao foram preenchidos.

## Direcao de produto

O sistema continua como uma empresa por instalacao. Essa decisao mantem o produto simples, funcional e seguro antes da venda comercial. O desenho deve, porem, facilitar instancias futuras por cliente, com configuracoes salvas de forma estruturada no banco e sem acoplar a empresa atual diretamente ao codigo.

A tela deve parecer uma central administrativa madura, nao uma tela tecnica. Ela deve ser bonita, clara e facil de usar, com menu interno de secoes, estados de configuracao e mensagens que ajudem o admin a entender o que falta antes de emitir NF-e ou operar em producao.

## Estrutura geral da tela

Rota sugerida: `/configuracoes`

Acesso:

- Permitido somente para `admin`.
- `caixa` e `oficina` nao acessam a rota.
- A entrada deve aparecer no menu lateral apenas para `admin`.

Layout:

- Titulo geral: `Configuracoes`.
- Menu interno lateral ou abas persistentes para as secoes.
- Conteudo principal a direita.
- Cada secao salva suas proprias alteracoes.
- Indicadores por secao: `OK`, `Atencao` ou `Pendente`.
- Acoes claras: salvar, cancelar alteracoes, testar quando aplicavel.

Secoes da primeira versao:

1. Empresa
2. Fiscal
3. WhatsApp
4. Backups
5. Seguranca
6. Sistema

## Aba Empresa

Guarda os dados oficiais da empresa e os dados usados em documentos fiscais.

Campos:

- Razao social
- Nome fantasia
- CNPJ
- Inscricao estadual
- CRT/regime tributario
- Telefone
- E-mail
- Logradouro
- Numero
- Bairro
- Municipio
- Codigo IBGE do municipio
- UF
- CEP
- Logo da empresa na Etapa 3, apos a base fiscal estar validada

Uso dos dados:

- Emitente da NF-e.
- DANFE.
- Cabecalhos e documentos gerados pelo sistema.
- Futuras telas comerciais ou impressos.

Regra de migracao:

- A emissao de NF-e deve buscar primeiro os dados da configuracao salva no banco.
- Se algum campo obrigatorio ainda nao existir no banco, o sistema pode usar o `.env` como fallback.
- A interface deve avisar quando a NF-e ainda depende de fallback do `.env`.

## Aba Fiscal

Centraliza configuracoes sensiveis de NF-e.

Campos e recursos:

- Ambiente da NF-e: homologacao ou producao.
- Upload do certificado digital `.pfx`.
- Troca da senha do certificado.
- Status do certificado: configurado, ausente, vencido ou invalido quando for possivel detectar.
- Serie da NF-e.
- Proximo numero da NF-e.
- Lista de contadores ou escritorios autorizados a baixar XML pela tag `autXML`.

Senha do certificado:

- A senha pode ser digitada pela tela.
- A senha nao deve ser retornada pela API.
- A tela nao deve permitir visualizar a senha atual.
- Deve haver apenas a acao de trocar senha/certificado.

Certificado:

- O `.pfx` deve ser armazenado em diretorio seguro fora do versionamento.
- O caminho salvo na configuracao deve ser usado pela NF-e antes do fallback do `.env`.
- A troca de certificado deve validar o novo arquivo antes de substituir a configuracao ativa. Se a validacao falhar, a configuracao anterior permanece ativa.

Numeracao:

- A tela deve exibir a serie atual e o proximo numero previsto.
- Alterar o proximo numero e uma acao sensivel e deve exigir confirmacao clara.
- O sistema nao deve diminuir numeracao sem confirmacao explicita.
- A regra fiscal de numeros consumidos por rejeicao nao deve ser alterada neste projeto sem uma decisao separada.

Contadores autorizados para XML:

- Lista simples com nome/apelido, CPF/CNPJ, tipo e ativo/inativo.
- Tipo sugerido: contador, escritorio contabil ou outro.
- Limite de 10 documentos ativos, seguindo o limite da NF-e para `autXML`.
- Nao permitir documento igual ao CNPJ do emitente.
- Na emissao, nao incluir documento igual ao CPF/CNPJ do destinatario da nota.
- Essa lista e opcional; se vazia, a NF-e continua sendo emitida normalmente.

## Aba WhatsApp

Centraliza parametros da integracao de notificacoes.

Campos e recursos:

- Ativar/desativar WhatsApp.
- Configuracoes da Evolution API necessarias para envio.
- Mensagens padrao por evento, como confirmacao de OS, OS pronta e entrega.
- Botao para enviar mensagem de teste.
- Status simples da integracao: ativo, desativado ou erro na ultima tentativa.

Primeira implementacao pode manter alguns campos como leitura ou configuracao basica, desde que a tela ja organize a area para evolucao.

## Aba Backups

Mostra a saude dos backups e oferece acoes administrativas.

Campos e recursos:

- Ultimo backup local realizado.
- Proximo backup agendado.
- Quantidade de backups locais mantidos.
- Botao para gerar backup manual.
- Indicador quando o backup estiver atrasado.
- Espaco reservado para backup offsite futuro.

Essa aba tambem prepara o backlog de observabilidade: `backup-status.json` e endpoint de status podem ser implementados em etapa propria.

## Aba Seguranca

Concentra configuracoes e politicas de acesso.

Campos e recursos:

- Senha minima, inicialmente 8 caracteres.
- Lockout de login por usuario/conta.
- Tempo de expiracao da sessao.
- Avisos sobre admins ativos.
- Espaco futuro para 2FA/TOTP e sessoes ativas.

Mesmo que algumas opcoes sejam fixas no primeiro ciclo, a tela deve deixar claro o estado de seguranca atual.

## Aba Sistema

Guarda preferencias gerais da instalacao.

Campos e recursos:

- Nome exibido do sistema.
- Fuso horario da instalacao.
- Moeda.
- Informacoes de versao/build.
- Ambiente atual: desenvolvimento, homologacao ou producao.
- Avisos administrativos internos na Etapa 3.

## Arquitetura de dados

Criar uma base de configuracoes no banco sem introduzir multiempresa agora.

Modelo recomendado:

- Uma tabela principal para dados da empresa.
- Uma tabela ou chaves estruturadas para configuracoes fiscais.
- Uma tabela para documentos autorizados `autXML`.
- Uma tabela simples de configuracoes gerais pode ser usada para campos menores, mas dados fiscais e empresa devem ter estrutura explicita.

Sugestao inicial:

- `empresa_config`
- `fiscal_config`
- `nfe_autxml`
- `sistema_config` ou `configuracoes`

As migrations devem seguir a regra do projeto: adicionar estruturas novas sem reescrever tabelas existentes de forma destrutiva.

## APIs

Rotas sugeridas:

- `GET /api/configuracoes`
- `PUT /api/configuracoes/empresa`
- `GET /api/configuracoes/fiscal`
- `PUT /api/configuracoes/fiscal`
- `POST /api/configuracoes/fiscal/certificado`
- `PUT /api/configuracoes/fiscal/certificado/senha`
- `GET /api/configuracoes/fiscal/autxml`
- `POST /api/configuracoes/fiscal/autxml`
- `PUT /api/configuracoes/fiscal/autxml/:id`
- `DELETE /api/configuracoes/fiscal/autxml/:id`
- Rotas futuras ou etapa 3 para WhatsApp, Backups, Seguranca e Sistema.

Todas as rotas devem exigir `auth` e role `admin`.

## Fluxo da NF-e

Ao emitir NF-e:

1. Carregar configuracao fiscal e empresa do banco.
2. Montar emitente usando banco primeiro e `.env` como fallback.
3. Carregar certificado e senha usando banco/configuracao primeiro e `.env` como fallback.
4. Buscar documentos `autXML` ativos.
5. Remover da lista qualquer documento igual ao destinatario da nota.
6. Enviar `autXML` somente quando houver documentos validos.
7. Manter comportamento atual de mutex, timeout, XML salvo e eventos fiscais.

Esse fluxo deve preservar compatibilidade com a emissao atual enquanto a tela vai sendo preenchida.

## Tratamento de erros

Erros de configuracao devem ser claros para o admin:

- Dados obrigatorios da empresa ausentes.
- Certificado ausente.
- Senha do certificado nao configurada.
- Certificado invalido ou vencido, quando detectavel.
- Proximo numero invalido.
- Mais de 10 documentos `autXML` ativos.
- CPF/CNPJ invalido em autorizados XML.
- Documento `autXML` igual ao emitente.

Erros sensiveis nao devem vazar senha, caminho interno completo desnecessario ou detalhes do schema SQLite.

## Etapas de implementacao

### Etapa 1: Base + Empresa

Objetivo: criar a rota administrativa, layout da tela e dados da empresa no banco.

Inclui:

- Rota `/configuracoes` admin only.
- Entrada no menu lateral para admin.
- Layout com menu interno e abas.
- Migration para configuracao da empresa.
- APIs de leitura/salvamento da aba Empresa.
- Indicadores basicos de preenchimento.
- NF-e ainda pode continuar usando `.env`, mas helpers ja devem estar preparados para banco primeiro quando houver dados.

Teste manual:

- Admin acessa e salva dados.
- Caixa/oficina nao acessam.
- Dados persistem apos reload.

### Etapa 2: Fiscal + NF-e

Objetivo: mover configuracoes fiscais principais para a tela com fallback seguro para `.env`.

Inclui:

- Aba Fiscal completa.
- Upload de `.pfx`.
- Troca de senha sem retorno da senha atual.
- Serie e proximo numero.
- Lista de contadores autorizados `autXML`.
- Alteracao do fluxo de emissao para usar banco primeiro e `.env` como fallback.
- Inclusao de `autXML` na montagem da NF-e.
- Testes automatizados para fallback, emitente, certificado e `autXML`.

Teste manual:

- Emitir em homologacao usando dados vindos da tela.
- Baixar XML e confirmar presenca de `autXML` quando contador ativo existir.
- Confirmar que NF-e ainda funciona se algum campo depender de fallback do `.env`.

### Etapa 3: Operacao e polimento

Objetivo: completar a central administrativa sem misturar tudo com fiscal.

Inclui:

- Aba WhatsApp com toggle, configuracoes principais e teste.
- Aba Backups com status e backup manual.
- Aba Seguranca com politicas principais.
- Aba Sistema com informacoes gerais.
- Melhorias visuais, estados vazios, mensagens e confirmacoes.
- Opcional: checklist de implantacao mostrando o que falta para producao.

Teste manual:

- Validar navegacao entre abas.
- Testar mensagens de erro e sucesso.
- Confirmar que a tela funciona bem em desktop e mobile.

## Testes automatizados

Backend:

- Rotas de configuracao exigem admin.
- Validacao de CNPJ/CPF nos campos fiscais.
- Senha do certificado nao aparece em respostas.
- Limite de 10 `autXML` ativos.
- Fallback banco primeiro, `.env` depois.
- NF-e monta emitente usando dados salvos.
- NF-e remove `autXML` igual ao destinatario.

Frontend:

- Renderizacao da tela para admin.
- Bloqueio ou ausencia para roles nao autorizadas.
- Salvamento da aba Empresa.
- Validacoes basicas de Fiscal.
- Estados de loading, erro e sucesso.

## Fora de escopo nesta primeira especificacao

- Multiempresa dentro da mesma instalacao.
- Painel master SaaS.
- 2FA/TOTP completo.
- Backup offsite automatico.
- Mudanca profunda na regra fiscal de numeracao consumida por rejeicao.
- Reescrever toda a tela de NF-e.

## Criterios de aceite

- Admin consegue acessar a tela e salvar dados da empresa.
- Dados fiscais podem ser configurados pela interface em etapa propria.
- NF-e usa configuracao do banco primeiro e `.env` como fallback.
- Certificado e senha podem ser configurados sem expor a senha de volta na API.
- Contadores autorizados para XML podem ser cadastrados e usados no XML da NF-e.
- A tela fica organizada, bonita e facil de operar.
- A implementacao pode ser validada por etapas sem quebrar a emissao atual.
