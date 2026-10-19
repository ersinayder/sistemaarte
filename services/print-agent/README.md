# Agente de Impressão Local para Windows (PC Edu)

Este serviço é um agente leve em Node.js projetado para rodar em segundo plano no computador da loja (PC Edu / Windows) onde a impressora **Canon G3010 series** está conectada fisicamente.

## Como Funciona

1. **Conexão Segura e Saída Única (Outbound-only):**
   - O agente se conecta ao servidor em nuvem (`https://arteemolduras.com.br`) via HTTPS.
   - Nenhuma porta precisa ser aberta no roteador da loja.
   - Autenticado com token criptográfico de máquina (`PRINT_AGENT_TOKEN`).

2. **Recepção Instantânea e Confiável:**
   - Mantém uma conexão **Server-Sent Events (SSE)** em `/api/impressao/agente/stream`.
   - Quando qualquer usuário (no celular, tablet ou balcão) clica em "Imprimir", o servidor enfileira o job e notifica o agente instantaneamente (< 80ms).
   - O agente também faz polling periódico e envia heartbeats (ping a cada 20s) para manter o status online no painel do sistema.

3. **Impressão Silenciosa Nativa:**
   - Utiliza o motor headless do Chrome/Edge via PowerShell com perfil isolado e flag `--kiosk-printing`.
   - A impressão sai diretamente na folha A5 da Canon G3010 sem abrir nenhuma caixa de diálogo ou pop-up do Windows.

---

## Configuração

Você pode configurar o agente através de um arquivo `.env` ou `config.json` nesta mesma pasta (`services/print-agent/`), ou definindo variáveis de ambiente no Windows.

### Exemplo de arquivo `.env`:

```env
PRINT_SERVER_URL=https://arteemolduras.com.br
PRINT_AGENT_TOKEN=coloque_aqui_o_token_definido_no_servidor
PRINTER_NAME=Canon G3010 series
PRINT_SETTLE_MS=4000
```

### Variáveis Disponíveis:

| Variável | Padrão | Descrição |
|---|---|---|
| `PRINT_SERVER_URL` | `https://arteemolduras.com.br` | URL base da API do sistema |
| `PRINT_AGENT_TOKEN` | *(obrigatório)* | Token secreto do agente configurado no servidor |
| `PRINTER_NAME` | `Canon G3010 series` | Nome exato da impressora no Windows |
| `PRINT_SETTLE_MS` | `4000` | Tempo (ms) de aguardo do browser headless para spool |
| `PRINT_POLL_INTERVAL_MS`| `5000` | Intervalo de polling de segurança caso o SSE desconecte |
| `PRINT_PING_INTERVAL_MS`| `20000` | Intervalo de heartbeat para manter status online no servidor |

---

## Como Usar

### 1. Início Manual (para testes ou depuração)
Dê um duplo clique no arquivo:
`iniciar-agente.bat`

Isso abrirá uma janela de terminal mostrando os logs de conexão e os jobs recebidos.

### 2. Iniciar Automaticamente com o Windows (Silencioso)
Dê um duplo clique no arquivo:
`instalar-inicializacao.bat`

Esse script criará um atalho na pasta de inicialização do Windows (`shell:startup`) que executa o agente de forma 100% invisível em segundo plano toda vez que o Windows do PC Edu for iniciado.
