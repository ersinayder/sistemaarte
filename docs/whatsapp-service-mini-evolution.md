# Mini Servico WhatsApp Web

Esta feature adiciona um servico local independente em `whatsapp-service/`, pensado para Windows Server 2016 sem Docker. Ele funciona como um "mini Evolution" somente para o que o Sistema Arte precisa hoje:

- Status da instancia local.
- QR no terminal/log para pareamento.
- Sessao persistida em pasta local.
- Envio de texto por HTTP.
- API key simples.
- PM2 em modo fork.

O backend do Sistema Arte continua dono da fila, retries e regras de negocio. O servico WhatsApp nao conhece OS, cliente, oficina, caixa ou financeiro.

## Arquitetura

```txt
Sistema Arte backend
  └── whatsappWorker
        └── HTTP local
              └── whatsapp-service
                    └── Baileys / WhatsApp Web
```

Contrato usado pelo backend:

```txt
GET  /instance/connectionState/loja
POST /message/sendText/loja
```

## Variaveis

Servico:

```env
WHATSAPP_SERVICE_HOST=127.0.0.1
WHATSAPP_SERVICE_PORT=8080
WHATSAPP_SERVICE_INSTANCE=loja
WHATSAPP_SERVICE_SESSION_DIR=./sessions
WHATSAPP_SERVICE_API_KEY=troque-esta-chave
```

Backend:

```env
WHATSAPP_PROVIDER=web_local
WHATSAPP_WEB_ENABLED=true
WHATSAPP_WEB_BASE_URL=http://127.0.0.1:8080
WHATSAPP_WEB_INSTANCE=loja
WHATSAPP_WEB_API_KEY=troque-esta-chave
```

## Limites

Nao e API oficial. Nao deve ser usado para campanha, disparo em massa, leitura de mensagens ou garantia de entrega. Para o MVP, a fila do backend e o fallback manual cobrem desconexao e instabilidade.
