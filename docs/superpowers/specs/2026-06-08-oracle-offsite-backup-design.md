# Backup offsite Oracle Object Storage

Data: 2026-06-08

## Objetivo

Adicionar backup offsite externo ao servidor Windows do Sistema Arte e Molduras, usando Oracle Cloud Always Free Object Storage enquanto o volume couber no limite gratuito de 20 GB.

O backup offsite deve proteger contra perda do servidor, corrupcao local, erro humano e ataque que tente apagar backups ja enviados. O Google Drive fica fora do escopo desta implementacao.

## Decisao

Usar Oracle Cloud Object Storage como destino principal, com regra de retencao imutavel no bucket. O servidor envia pacotes criptografados e datados, sem sincronizacao bidirecional e sem comando remoto de exclusao.

Recomendacao inicial:

- Retencao imutavel: 60 dias.
- Limite de armazenamento esperado: ate 20 GB no Oracle Always Free.
- Frequencia: diaria, apos o backup local das 2h BRT.
- Upload manual: disponivel pela tela de Configuracoes junto ao backup local.

## Escopo do pacote

Cada pacote offsite deve conter:

- Backup SQLite gerado por `better-sqlite3.backup()`.
- XMLs fiscais em `backend/data/nfe_xmls/`.
- Snapshot de metadados do backup, incluindo data, tamanho, destino, hash e resultado do upload.

O pacote nao deve incluir:

- `.env`.
- Certificado `.pfx`.
- Senhas ou tokens.
- `node_modules`.
- Build do frontend.

## Arquitetura

O fluxo continua partindo da rotina atual em `backend/database.js`:

1. Gerar backup local em `backend/data/backups/backup-*.db`.
2. Rotacionar os backups locais.
3. Montar pacote offsite temporario.
4. Criptografar o pacote localmente.
5. Enviar para Oracle Object Storage.
6. Atualizar `backup-status.json` com status local e offsite.

Componentes novos previstos:

- `backend/utils/offsiteBackup.js`: orquestra empacotamento, criptografia, hash e upload.
- `backend/utils/oracleObjectStorage.js`: adaptador isolado para upload no Oracle.
- Novas variaveis de ambiente no backend para habilitar e configurar o destino.
- Extensao de `backend/utils/backupStatus.js` para mostrar ultimo upload offsite, destino, retencao, tamanho e erro.

## Configuracao

Variaveis de ambiente esperadas:

- `OFFSITE_BACKUP_ENABLED=1`
- `OFFSITE_BACKUP_PROVIDER=oracle`
- `ORACLE_OBJECT_STORAGE_NAMESPACE`
- `ORACLE_OBJECT_STORAGE_REGION`
- `ORACLE_OBJECT_STORAGE_BUCKET`
- `ORACLE_OBJECT_STORAGE_ACCESS_KEY`
- `ORACLE_OBJECT_STORAGE_SECRET_KEY`
- `OFFSITE_BACKUP_RETENTION_DAYS=60`
- `OFFSITE_BACKUP_ENCRYPTION_KEY`

As credenciais usadas pelo servidor devem ter permissao minima: upload e leitura/listagem necessaria para verificacao. A conta administrativa do Oracle nao deve ficar no servidor e deve usar 2FA.

## Retencao e imutabilidade

O bucket Oracle deve ter regra de retencao bloqueada antes de entrar em producao. A regra impede alteracao, overwrite ou exclusao dos objetos protegidos durante o periodo configurado.

O sistema nao deve tentar excluir objetos remotos. A limpeza remota deve ser feita por politica do provedor apos o prazo de retencao, quando aplicavel, ou por manutencao administrativa fora do servidor.

## Criptografia

O pacote deve ser criptografado antes do upload. O segredo de criptografia fica no `.env` do servidor e deve ser guardado tambem fora do servidor, em local seguro.

Sem essa chave, um pacote offsite restaurado nao deve expor dados de clientes, financeiro ou NF-e.

## API e UI

A tela de Configuracoes deve deixar de mostrar `destino-offsite` como pendencia quando:

- `OFFSITE_BACKUP_ENABLED=1`.
- O provedor estiver configurado.
- Existir upload offsite recente dentro da janela esperada.

Estados esperados:

- `OK`: backup local recente e offsite recente.
- `Pendente`: offsite desativado ou nunca executado.
- `Atencao`: ultimo offsite atrasado ou armazenamento proximo do limite.
- `Critico`: falha de upload, backup local ausente ou backup local atrasado.

## Erros e seguranca operacional

Falha no upload offsite nao deve apagar o backup local nem impedir o sistema de continuar funcionando. O erro deve ser registrado no `backup-status.json` e aparecer em Configuracoes.

Erros esperados:

- Credencial invalida.
- Bucket inexistente.
- Falha de rede.
- Limite gratuito proximo ou excedido.
- Falha de compactacao ou criptografia.

O sistema deve registrar somente mensagens operacionais seguras, sem vazar segredo, token, chave privada, senha ou caminho sensivel.

## Restauracao

O desenho deve incluir um procedimento documentado de restauracao:

1. Baixar pacote do Oracle.
2. Descriptografar localmente com a chave guardada.
3. Extrair `oficina.db` e `nfe_xmls/`.
4. Parar PM2 no servidor de destino.
5. Substituir banco e XMLs.
6. Iniciar PM2.
7. Validar `/api/health`, login admin e listagem de OS/NF-e.

O primeiro teste de restauracao deve ser feito em ambiente local ou homologacao antes de considerar o offsite operacional.

## Testes

Testes backend previstos:

- Status fica pendente quando offsite esta desativado.
- Status fica OK quando local e offsite recentes existem.
- Falha de upload preserva backup local e marca erro.
- Segredos nao aparecem na resposta da API.
- Pacote inclui `nfe_xmls/` quando o diretorio existe.
- Pacote exclui `.env`, `.pfx` e arquivos fora do escopo.

Tambem deve haver um teste manual documentado:

- Executar backup offsite manual.
- Confirmar objeto no Oracle.
- Baixar, descriptografar e validar hash.
- Simular restauracao em ambiente nao produtivo.

## Fora do escopo

- Google Drive.
- OneDrive.
- NAS local.
- Backup continuo em tempo real.
- Restauracao automatica em producao.
- Contingencia de NF-e.

## Criterio de aceite

A implementacao sera considerada pronta quando:

- Um admin conseguir gerar backup manual com upload Oracle.
- A rotina diaria enviar automaticamente o pacote offsite.
- A tela de Configuracoes mostrar status offsite real.
- Objetos enviados estiverem protegidos por retencao imutavel no bucket.
- Houver teste de restauracao documentado e validado fora de producao.
