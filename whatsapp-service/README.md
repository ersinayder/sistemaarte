# Mini Serviço WhatsApp Web

Serviço local em Node.js para enviar mensagens de baixo volume pelo WhatsApp Web usando Baileys. Ele expõe só o contrato HTTP necessário para o Sistema Arte consumir como provedor `web_local`, sem Docker, Postgres ou Redis.

> Aviso: esta integração usa WhatsApp Web não oficial. Pode desconectar, exigir novo QR ou parar de funcionar se o WhatsApp mudar o protocolo. Use para mensagens transacionais de baixo volume e mantenha fallback manual.

Em produção no Sistema Arte, a instância operacional atual é `ArteeMolduras`. Os exemplos abaixo usam `loja` quando forem genéricos; no servidor real, mantenha o nome da instância idêntico entre `.env`, tela de Configurações e pasta em `sessions/`.

## Contrato HTTP

```txt
GET  /health
GET  /instance/connectionState/:instance
POST /message/sendText/:instance
```

Envio:

```json
{
  "number": "5531999990000",
  "text": "Mensagem"
}
```

Resposta de status:

```json
{
  "instance": { "instanceName": "loja", "state": "open" },
  "state": "open",
  "connected": true,
  "qrcode": null,
  "qr": null,
  "lastError": null
}
```

Se `WHATSAPP_SERVICE_API_KEY` estiver configurado, informe a chave via header `apikey` ou `Authorization: Bearer`.

## Instalar no Windows Server

Requisitos:

- Node.js 20 ou superior. No servidor atual do Sistema Arte, Node.js 22 esta ok.
- PM2 instalado globalmente.
- Porta local livre, por padrao `127.0.0.1:8080`.

Passos:

```powershell
cd C:\sistemaarte\whatsapp-service
copy .env.example .env
npm.cmd install --omit=dev
pm2 start ecosystem.config.js
pm2 save
```

No primeiro start, acompanhe os logs e escaneie o QR com o WhatsApp da loja:

```powershell
pm2 logs sistema-arte-whatsapp
```

A sessão fica salva em `whatsapp-service/sessions/`. Não apague essa pasta, a menos que queira forçar novo pareamento.

## Configurar o Backend

No `.env` do backend:

```env
WHATSAPP_PROVIDER=web_local
WHATSAPP_WEB_ENABLED=true
WHATSAPP_WEB_BASE_URL=http://127.0.0.1:8080
WHATSAPP_WEB_INSTANCE=ArteeMolduras
WHATSAPP_WEB_API_KEY=troque-esta-chave
```

Use a mesma chave em `WHATSAPP_SERVICE_API_KEY` no `.env` do `whatsapp-service`.

Depois reinicie os dois processos:

```powershell
pm2 restart sistema-arte-whatsapp
pm2 restart sistemaarte-backend
```

## Testar Localmente

```powershell
cd whatsapp-service
npm.cmd test
npm.cmd start
```

Status:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/connectionState/ArteeMolduras" -Headers @{ apikey = "troque-esta-chave" }
```

Envio:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/message/sendText/ArteeMolduras" `
  -Method POST `
  -Headers @{ apikey = "troque-esta-chave" } `
  -ContentType "application/json" `
  -Body '{"number":"5531999990000","text":"Teste do Sistema Arte"}'
```

## Diagnóstico Rápido

Se a tela de Configurações não mostrar o QR Code:

- confira se `WHATSAPP_WEB_INSTANCE` é exatamente `ArteeMolduras`;
- confira se `WHATSAPP_WEB_API_KEY` no backend é igual a `WHATSAPP_SERVICE_API_KEY` no serviço;
- confira `pm2 logs sistema-arte-whatsapp --lines 80`;
- erros como `Bad MAC`, `Key used already or never filled` e `failed to decrypt message` indicam sessão local corrompida/desincronizada.

Para recriar a sessão sem apagar histórico imediatamente:

```powershell
cd C:\sistemaarte\whatsapp-service
pm2 stop sistema-arte-whatsapp
Rename-Item ".\sessions\ArteeMolduras" ("ArteeMolduras-badmac-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
pm2 restart sistema-arte-whatsapp --update-env
pm2 logs sistema-arte-whatsapp --lines 80
```

## Extração Futura Para Projeto Público

O serviço foi mantido isolado de regras de OS, clientes, caixa e NF-e. Para publicar depois como projeto separado, os pontos específicos do Sistema Arte são apenas nome de instância default, exemplos de `.env` e README.
