# Proposta PDF Design

## Decisao

Priorizar PDF/HTML imprimivel da proposta em vez de link publico com aprovacao online. Para o fluxo de balcao e WhatsApp, um documento fechado e mais simples de explicar, salvar, imprimir e encaminhar.

## Escopo

Criar um endpoint autenticado:

```txt
GET /api/propostas/:id/pdf
```

Ele retorna HTML imprimivel, seguindo o padrao de `GET /api/ordens/:id/pdf`: o operador abre em nova aba e usa `Imprimir / salvar PDF` do navegador.

## Conteudo do Documento

- Logo da Arte & Molduras.
- Titulo `PROPOSTA COMERCIAL`.
- Numero da proposta.
- Cliente.
- Data de criacao.
- Status comercial.
- Prazo previsto, quando houver.
- Itens com quantidade, valor unitario e subtotal.
- Valor total.
- Observacoes.
- Validade textual da proposta.
- Rodape com contato e aviso comercial.

## Integracao Frontend

Na tela `/propostas`, adicionar acao `PDF` no modal da proposta. O botao abre:

```txt
/api/propostas/{id}/pdf
```

em nova aba.

## Fora do Escopo

- Link publico `/proposta/:token`.
- Aprovacao online pelo cliente.
- Envio automatico pelo WhatsApp.
- Geracao de arquivo binario PDF no servidor.
