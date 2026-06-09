# Mini Servico WhatsApp Web

Servico local em Node.js para enviar mensagens de baixo volume pelo WhatsApp Web usando Baileys. Ele expõe só o contrato HTTP necessário para o Sistema Arte consumir como provedor `web_local`, sem Docker, Postgres ou Redis.

> Aviso: esta integracao usa WhatsApp Web nao oficial. Pode desconectar, exigir novo QR ou parar de funcionar se o WhatsApp mudar o protocolo. Use para mensagens transacionais de baixo volume e mantenha fallback manual.

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

A sessao fica salva em `whatsapp-service/sessions/`. Nao apague essa pasta, a menos que queira forcar novo pareamento.

## Configurar o Backend

No `.env` do backend:

```env
WHATSAPP_PROVIDER=web_local
WHATSAPP_WEB_ENABLED=true
WHATSAPP_WEB_BASE_URL=http://127.0.0.1:8080
WHATSAPP_WEB_INSTANCE=loja
WHATSAPP_WEB_API_KEY=troque-esta-chave
```

Use a mesma chave em `WHATSAPP_SERVICE_API_KEY` no `.env` do `whatsapp-service`.

Depois reinicie os dois processos:

```powershell
pm2 restart sistema-arte-whatsapp
pm2 restart sistema-arte
```

## Testar Localmente

```powershell
cd whatsapp-service
npm.cmd test
npm.cmd start
```

Status:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/connectionState/loja" -Headers @{ apikey = "troque-esta-chave" }
```

Envio:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8080/message/sendText/loja" `
  -Method POST `
  -Headers @{ apikey = "troque-esta-chave" } `
  -ContentType "application/json" `
  -Body '{"number":"5531999990000","text":"Teste do Sistema Arte"}'
```

## Extracao Futura Para Projeto Publico

O servico foi mantido isolado de regras de OS, clientes, caixa e NF-e. Para publicar depois como projeto separado, os pontos especificos do Sistema Arte sao apenas nome de instancia default, exemplos de `.env` e README.
