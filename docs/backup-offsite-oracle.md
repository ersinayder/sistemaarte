# Backup Offsite Oracle Object Storage

## Objetivo

Manter uma copia offsite criptografada dos backups do Sistema Arte e
Molduras fora do servidor Windows, usando Oracle Object Storage Always Free
enquanto o volume total couber no limite gratuito de 20 GB.

Esse backup protege contra perda do servidor, corrupcao local, falha de disco,
erro humano e tentativa de apagar backups locais. Ele complementa o backup
local em `backend/data/backups/`; nao substitui a rotina local.

## Bucket Oracle Object Storage

1. Criar um bucket privado no Oracle Object Storage.
2. Usar um nome operacional claro, por exemplo `sistemaarte-backups`.
3. Manter o bucket sem acesso publico.
4. Configurar Object Storage na regiao escolhida, por exemplo
   `sa-saopaulo-1`.
5. Confirmar o namespace da tenancy no painel Oracle.

O servidor deve enviar apenas snapshots datados e criptografados, como
`daily/sistemaarte-YYYY-MM-DDTHH-MM-SS.zip.enc`.

## Retencao de 60 dias

Configurar uma regra de retencao de 60 dias no bucket.

Importante: bloqueie a regra de retencao somente depois de validar:

1. Um upload manual feito pelo sistema.
2. Um download do objeto `.zip.enc`.
3. Um restore de teste em ambiente local ou homologacao.

Depois que uma regra de retencao imutavel e bloqueada, ela pode impedir
alteracao, overwrite ou exclusao dos objetos durante o prazo configurado.
Valide o fluxo completo antes de tornar a regra definitiva.

## Credenciais e seguranca

Criar uma credencial S3-compatible para o servidor com permissao minima:

- Permitir upload de objetos no bucket de backup.
- Permitir leitura/listagem apenas se necessaria para verificacao operacional.
- Nao conceder permissao administrativa ampla.
- Nao usar a conta administrativa Oracle no servidor.

A conta administrativa Oracle deve ficar fora do servidor, protegida por senha
forte e 2FA.

Nunca coloque no servidor:

- Senha da conta administrativa Oracle.
- Chave de recuperacao da conta Oracle.
- Credenciais de usuario com permissao global.

## Variaveis de ambiente

Adicionar no `.env` do backend no servidor:

```env
OFFSITE_BACKUP_ENABLED=1
OFFSITE_BACKUP_PROVIDER=oracle
ORACLE_OBJECT_STORAGE_NAMESPACE=namespace
ORACLE_OBJECT_STORAGE_REGION=sa-saopaulo-1
ORACLE_OBJECT_STORAGE_BUCKET=sistemaarte-backups
ORACLE_OBJECT_STORAGE_ACCESS_KEY=access-key
ORACLE_OBJECT_STORAGE_SECRET_KEY=secret-key
OFFSITE_BACKUP_RETENTION_DAYS=60
OFFSITE_BACKUP_ENCRYPTION_KEY=base64-32-bytes
```

`OFFSITE_BACKUP_ENCRYPTION_KEY` deve ser uma chave base64 de 32 bytes.

Gerar a chave no PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Aviso forte: guarde essa chave fora do servidor, em um cofre de senhas ou meio
seguro equivalente. Sem essa chave, o arquivo `.zip.enc` nao pode ser
descriptografado e o backup offsite nao pode ser restaurado.

## Teste manual via API

Use o padrao de login que extrai o token do cookie HttpOnly e passa como
`Bearer` nas chamadas seguintes.

```powershell
$loginResp = Invoke-WebRequest -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"lojanova"}'
$token = ($loginResp.Headers["Set-Cookie"] -split ";")[0] -replace "token=",""

Invoke-RestMethod -Uri "http://localhost:3001/api/configuracoes/backups/manual" -Method POST -Headers @{ Authorization = "Bearer $token" }

Invoke-RestMethod -Uri "http://localhost:3001/api/configuracoes/backups" -Method GET -Headers @{ Authorization = "Bearer $token" }
```

Validar no retorno:

- Backup local recente.
- `offsite.provider` como `oracle`.
- Bucket correto.
- Retencao de 60 dias.
- Ultimo envio offsite preenchido.
- Nenhuma chave, segredo ou caminho sensivel exposto na resposta.

Tambem confirme no painel Oracle que o objeto `.zip.enc` foi criado no bucket.

## Restore de teste

Faca o primeiro restore em ambiente local ou homologacao. Nao teste restore
direto em producao sem janela operacional e backup local fresco.

Passos:

1. Baixar do Oracle o objeto `.zip.enc` desejado.
2. Descriptografar o pacote usando `OFFSITE_BACKUP_ENCRYPTION_KEY`.
3. Extrair o `.zip` descriptografado.
4. Confirmar que o pacote contem:
   - `oficina.db`
   - `nfe_xmls/`
5. Parar o PM2 no servidor de destino:

```powershell
pm2 stop ecosystem.config.js
```

6. Substituir os arquivos restaurados:
   - `backend/data/oficina.db`
   - `backend/data/nfe_xmls/`
7. Iniciar novamente:

```powershell
pm2 start ecosystem.config.js
```

8. Validar a aplicacao:
   - `GET /api/health`
   - Login admin.
   - Listagem de OS.
   - Detalhe de uma OS recente.
   - Tela NF-e.
   - XMLs de NF-e disponiveis quando aplicavel.

Se qualquer validacao falhar, pare e investigue antes de considerar o backup
offsite operacional.

## Regra operacional

Nunca usar sincronizacao bidirecional.

Nunca permitir delete remoto executado pelo servidor.

O servidor deve apenas enviar snapshots datados e criptografados para o Oracle.
A expiracao ou limpeza remota deve ser controlada por politica do provedor ou
por manutencao administrativa feita fora do servidor.
