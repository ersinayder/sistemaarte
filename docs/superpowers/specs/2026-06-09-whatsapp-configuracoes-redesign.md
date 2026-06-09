# Redesign da Aba WhatsApp em Configuracoes

## Contexto

O mini servico WhatsApp Web local foi validado no Windows Server 2016 com PM2, mantendo sessao apos restart e enviando mensagens reais. A tela atual de Configuracoes ja consulta `/api/configuracoes/whatsapp/web-status`, mas mostra apenas que o QR esta disponivel no provedor, obrigando o operador a usar `pm2 logs`.

## Objetivo

Repaginar a aba WhatsApp para operacao diaria:

- Escolha somente entre `WhatsApp Web local` e `Manual assistido`.
- Status claro de sessao: conectado, aguardando QR, desconectado ou nao configurado.
- QR Code escaneavel direto no sistema quando o provedor retornar `qr`.
- Configuracao local simples: URL, instancia, chave local e toggle de envio automatico.
- Templates apresentados como cards visuais com previa de mensagem.

## Fora do Escopo

- Reintroduzir Meta Cloud API como opcao visual.
- Alterar regra de envio da fila.
- Criar editor completo de variaveis persistidas no backend.
- Ler ou confirmar entrega/ack do WhatsApp.

## Design Aprovado

A aba WhatsApp tera tres blocos:

1. Status da conexao, com badge grande, dados da instancia, botao atualizar e QR quando aplicavel.
2. Modo de envio, com controle visual para `WhatsApp Web local` ou `Manual assistido`.
3. Templates de mensagem, com cards para confirmacao de pedido e pedido pronto, cada um com nome interno e preview em balao.
