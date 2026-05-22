# WhatsApp na Fila da Oficina

## Contexto

A automacao oficial via Meta Cloud API e estavel, mas envolve aprovacao, templates e custo por mensagem. As alternativas gratuitas baseadas em WhatsApp Web, como Evolution API/Baileys, exigem manter sessao automatizada e ja mostraram instabilidade operacional no projeto.

O caminho aprovado e manter custo zero e evitar integracoes de servidor com sessao WhatsApp. O sistema deve montar mensagens prontas, abrir a conversa para o operador enviar manualmente e registrar o estado do aviso dentro do fluxo de trabalho.

## Objetivo

Integrar avisos de WhatsApp diretamente na Fila da Oficina, sem criar uma pagina separada como experiencia principal.

O operador deve conseguir:

- Ver quais OS precisam de confirmacao de pedido ou aviso de pedido pronto.
- Abrir a conversa do WhatsApp com a mensagem pronta em uma aba fixa.
- Voltar para a Fila da Oficina e marcar o aviso como confirmado/enviado.
- Usar fallback de copiar mensagem quando o WhatsApp nao preencher o texto.

## Experiencia na Fila da Oficina

Cada card de OS pode exibir uma tag pequena de WhatsApp quando houver acao pendente:

- `Confirmar`: pedido registrado, confirmacao ainda nao marcada como enviada.
- `Avisar pronto`: OS em `Pronto`, aviso ainda nao marcado como enviado.
- `Aberto`: conversa aberta pelo sistema, aguardando o operador marcar envio.
- `Confirmado`: confirmacao de pedido marcada como enviada.
- `Avisado`: aviso de pedido pronto marcado como enviado.

A tag deve ser discreta e ficar junto das tags operacionais do card, sem disputar espaco com numero da OS, cliente, servico, prazo e botao de transicao de status.

Interacoes:

- Clique esquerdo na tag pendente abre ou reutiliza a aba fixa do WhatsApp com a conversa e a mensagem pronta.
- Depois do clique, o estado local/persistido passa para `Aberto`.
- Clique direito na tag abre um menu compacto com uma unica acao principal: `Marcar confirmado` ou `Marcar avisado`.
- Tambem deve existir um pequeno controle de marcar envio visivel em hover/foco, para nao depender exclusivamente do botao direito.
- A tag marcada fica mais discreta, mas continua visivel para historico rapido.

## Abertura do WhatsApp

O padrao deve ser WhatsApp Web direto, sem passar por `api.whatsapp.com`:

```txt
https://web.whatsapp.com/send?phone=<telefone>&text=<mensagem>
```

O frontend deve abrir com target nomeado e guardar a referencia da guia retornada:

```js
whatsappWindow = window.open(url, "sistema_whatsapp")
```

Nos cliques seguintes, a Oficina deve navegar e focar essa mesma referencia enquanto ela continuar aberta. O target nomeado continua como fallback para a abertura inicial, mas nao e suficiente sozinho: navegadores modernos podem limpar o nome de uma guia quando ela navega para outro dominio, como `web.whatsapp.com`. O sistema nao deve prometer controle sobre abas do WhatsApp abertas manualmente pelo usuario, porque o navegador nao permite listar ou reaproveitar abas arbitrarias por seguranca.

Configuracao futura simples:

- `web`: abre `web.whatsapp.com/send` em aba fixa.
- `app`: abre `whatsapp://send` para o aplicativo instalado no Windows.
- `copy`: apenas copia a mensagem.

O modo `web` e o padrao inicial.

## Dados e estados

Adicionar persistencia para rastrear avisos por OS, separando pelo tipo de mensagem:

- `confirmacao_pedido`
- `pedido_pronto`

Cada registro deve guardar:

- OS vinculada.
- Tipo do aviso.
- Status: `pendente`, `aberto`, `enviado`, `ignorado`.
- Usuario que abriu/marcou envio.
- Data/hora de abertura.
- Data/hora de envio manual.
- Telefone usado no momento.
- Mensagem montada no momento.

A persistencia evita que avisos sumam ao recarregar a pagina e permite historico por OS.

## Gatilhos

Confirmacao de pedido:

- Deve existir para OS em `Aguardando`, `Em Produção` ou `Pronto` enquanto a confirmacao nao tiver sido marcada como enviada ou ignorada.
- Pode ser criada junto da OS ou derivada na listagem quando ainda nao existir registro.

Pedido pronto:

- Deve existir quando a OS entra em `Pronto`.
- Nao deve aparecer para OS `Entregue` ou `Cancelado`, exceto se ja houver historico marcado.

As regras de status devem respeitar os nomes existentes: `Aguardando`, `Em Produção`, `Pronto`, `Entregue`, `Cancelado`.

## Mensagens

Reaproveitar o texto atual da OS como base, mas centralizar a montagem em um helper compartilhado para evitar divergencia entre detalhes da OS, Fila da Oficina e futuros pontos de envio.

Templates iniciais:

- Confirmacao de pedido: cliente, OS, servico, valor total, entrada e saldo.
- Pedido pronto: cliente, OS, servico e saldo na retirada ou pagamento quitado.

O texto deve funcionar bem quando aberto no WhatsApp Web e quando copiado manualmente.

## Erros e fallback

Se o cliente nao tiver telefone valido:

- A tag deve indicar pendencia sem telefone.
- Clique deve mostrar aviso claro e oferecer copiar mensagem sem telefone.

Se `window.open` for bloqueado:

- Mostrar aviso para permitir pop-ups do sistema.
- Oferecer copiar mensagem.

Se o WhatsApp Web nao preencher a mensagem:

- Botao `Copiar mensagem` no menu da tag ou no toast de retorno.

## Testes

Backend:

- Regras de criacao/atualizacao de aviso por OS e tipo.
- Idempotencia: nao duplicar aviso pendente para a mesma OS/tipo.
- Marcacao de `aberto`, `enviado` e `ignorado`.

Frontend:

- Helper de URL gera `web.whatsapp.com/send` com telefone e texto codificados.
- Clique na tag abre a primeira conversa com target `sistema_whatsapp` e guarda a referencia da guia.
- Novo clique na tag reutiliza a referencia aberta, navega para a nova conversa e foca a guia do WhatsApp.
- Clique direito abre menu compacto.
- Card mostra `Confirmar`, `Avisar pronto`, `Aberto`, `Confirmado` e `Avisado` conforme estado.

## Fora do escopo

- Envio automatico sem operador.
- Evolution API, Baileys ou whatsapp-web.js no servidor.
- Meta Cloud API.
- Anexos automaticos.
- Leitura de confirmacao real no WhatsApp.
