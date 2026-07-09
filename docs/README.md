# Documentação do Sistema Arte

Este diretório reúne runbooks, specs e planos históricos. As fontes canônicas de entrada são:

- `../README.md` para visão geral, setup, deploy e operação.
- `../AGENTS.md` para regras obrigatórias de IA e alterações de código.

## Runbooks Atuais

| Documento | Uso |
|---|---|
| `backup-offsite-oracle.md` | Configuração e restauração do backup offsite Oracle Object Storage |
| `nfe-inutilizacao-operacao.md` | Operação segura de inutilização manual de numeração NF-e |
| `whatsapp-service-mini-evolution.md` | Contexto de evolução do serviço local de WhatsApp |

## Histórico de Planejamento

`docs/superpowers/` contém specs e planos de implementação gerados durante evolução do sistema. Esses arquivos são úteis para entender decisões passadas, mas não substituem `README.md`, `AGENTS.md` nem o código atual.

Antes de seguir qualquer plano antigo, confira:

- rotas reais em `frontend/src/App.jsx` e `backend/server.js`;
- regras atuais em `backend/domain/`;
- testes atuais com `cd backend; npm.cmd test`;
- documentação operacional atual em `README.md` e `AGENTS.md`.
