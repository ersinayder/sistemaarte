# WhatsApp Web com Fila Automatica

## Contexto

O sistema ja possui avisos assistidos de WhatsApp para `confirmacao_pedido` e `pedido_pronto`, registrados em `whatsapp_avisos`. O envio oficial pela Meta Cloud API existe como configuracao, mas a loja quer evitar a burocracia de aprovacao e templates por enquanto.

A decisao aprovada e testar envio automatico por WhatsApp Web nao oficial usando o mesmo numero da loja, aceitando o risco operacional de desconexao ou necessidade de novo QR. Como o volume diario e baixo e as mensagens sao transacionais para clientes que ja compraram, o foco e confiabilidade local: nao perder mensagem quando a sessao cair.

## Objetivo

Adicionar uma fila persistente para avisos de WhatsApp e um adaptador de envio por WhatsApp Web, sem bloquear criacao de OS, mudanca de status ou uso da oficina.

O sistema deve:

- Enfileirar confirmacao de pedido e pedido pronto de forma idempotente.
- Manter mensagens pendentes no SQLite quando o WhatsApp estiver desconectado.
- Enviar automaticamente assim que a sessao reconectar.
- Registrar tentativas, erro, horario de envio e status final.
- Permitir fallback manual pelo fluxo atual de abrir/copiador quando necessario.

## Abordagem Recomendada

Usar uma integracao local via servico separado de WhatsApp Web, preferencialmente Evolution API ou Baileys isolado, e chamar esse servico a partir do backend Express por HTTP local.

O Express continua sendo o dono da regra de negocio e da fila. O servico WhatsApp fica responsavel apenas por sessao, QR, reconexao e envio. Se o servico cair, o Sistema Arte continua funcionando e a fila permanece pendente.

## Abordagens Consideradas

### 1. Evolution API como servico separado

Vantagens: ja empacota sessao, QR, endpoints HTTP e reconexao; menos codigo proprio; bom para testar rapido no Windows Server/PM2.

Riscos: ainda depende de WhatsApp Web nao oficial; versoes podem quebrar quando o WhatsApp muda; precisa cuidar da pasta de sessao.

### 2. Baileys direto dentro do backend Express

Vantagens: uma unica aplicacao Node e controle total do ciclo de envio.

Riscos: uma queda ou bug da sessao pode afetar o processo principal; mais responsabilidade de reconexao, auth state e QR; historico do projeto ja mostrou queda rapida com Baileys/Evolution.

### 3. Manter somente WhatsApp Web manual

Vantagens: menor risco de bloqueio e praticamente zero manutencao.

Riscos: depende do operador lembrar de enviar; nao atende ao objetivo de fila automatica apos reconexao.

Recomendacao: comecar pela opcao 1, mas desenhar o backend com interface `whatsappProvider`, para trocar Evolution/Baileys/Meta Cloud API sem reescrever a regra de fila.

## Modelo de Dados

Evoluir `whatsapp_avisos` com colunas de fila:

- `canal`: `manual`, `web_local`, `meta`.
- `status`: manter `pendente`, `aberto`, `enviado`, `ignorado` e adicionar estados operacionais se necessario: `enviando`, `erro`, `aguardando_conexao`.
- `tentativas`: contador inteiro.
- `next_attempt_at`: proxima tentativa.
- `last_error`: ultimo erro resumido.
- `provider_message_id`: identificador retornado pelo provedor, quando houver.

As migrations devem ser `ALTER TABLE ADD COLUMN`, sem recriar tabela existente.

## Gatilhos

Confirmacao de pedido:

- Ao criar OS, garantir aviso `confirmacao_pedido` pendente quando houver permissao/status valido.
- Usar a mensagem de `montarMensagemAviso()` e telefone normalizado no momento de enfileirar.

Pedido pronto:

- Quando a OS entrar em `Pronto`, garantir aviso `pedido_pronto` pendente.
- Nao chamar envio direto dentro da rota de status; apenas enfileirar.

Os gatilhos precisam ser idempotentes: uma mesma OS/tipo nao pode gerar duplicidade.

## Worker de Envio

O backend deve iniciar um worker leve junto com o servidor, controlado por configuracao:

- `WHATSAPP_WEB_ENABLED=true`.
- `WHATSAPP_WEB_BASE_URL=http://127.0.0.1:<porta>`.
- `WHATSAPP_WEB_INSTANCE=<nome-da-instancia>`.

A cada intervalo curto, o worker busca poucos avisos elegiveis (`pendente`, `erro`, `aguardando_conexao`) com `next_attempt_at` vencido. Para cada aviso:

1. Marca como `enviando` de forma atomica.
2. Verifica status da sessao no provedor.
3. Se desconectado, marca `aguardando_conexao` e agenda nova tentativa.
4. Se conectado, envia telefone e mensagem.
5. Em sucesso, marca `enviado`.
6. Em erro temporario, incrementa `tentativas`, grava `last_error` e agenda backoff.

O worker nao deve mandar mensagens marcadas como `ignorado` ou `enviado`.

## Tela de Configuracoes

A secao WhatsApp deve mostrar modo de envio:

- Manual assistido.
- Meta Cloud API.
- WhatsApp Web local.

Para WhatsApp Web local, exibir:

- URL do servico local.
- Nome/instancia.
- Status: conectado, desconectado, aguardando QR, erro.
- Ultimo erro.
- Botao para atualizar status.

O QR pode ser fase 2. Na primeira entrega, e aceitavel orientar a abrir a interface da Evolution API para parear, desde que o Sistema Arte mostre claramente quando esta conectado/desconectado.

## Erros e Fallback

Se nao houver telefone valido, o aviso deve ficar visivel como pendente sem envio automatico e com erro claro.

Se o provedor estiver desconectado, a fila nao falha definitivamente. Ela fica `aguardando_conexao` e tenta novamente.

Se passar de um limite de tentativas, o aviso fica `erro`, mas ainda pode ser reprocessado manualmente ou reenviado apos correcao.

O fluxo manual atual de abrir WhatsApp Web deve continuar disponivel.

## Testes

Backend:

- Enfileiramento idempotente por OS/tipo.
- Worker nao perde aviso quando provedor esta desconectado.
- Worker envia ao reconectar.
- Backoff e contador de tentativas em erro temporario.
- Avisos `enviado` e `ignorado` nao sao reenviados.

Frontend:

- Configuracoes mostra modo WhatsApp Web local e status da sessao.
- Lista/Oficina continuam mostrando aviso pendente/enviado.

## Fora do Escopo Inicial

- Envio em massa ou campanhas.
- Anexos automaticos.
- Leitura de mensagens recebidas.
- Confirmacao real de leitura/entrega do WhatsApp.
- Garantia absoluta contra bloqueio/desconexao pelo WhatsApp.
