# Arquitetura MVP

## Objetivo desta etapa

- Uma partida ativa por vez.
- Modo selecionado na criacao (`1v1`, `2v2`, `3v3`).
- Base para evoluir para tempo real e Cloudflare depois.

## Componentes atuais

- `apps/api/src/app.ts`: API HTTP com rotas da partida.
- `apps/api/src/domain/match-store.ts`: estado em memoria da partida ativa.
- `apps/web/index.html`: interface minima para criar partida e entrar jogadores.
- `rules/sambao.yaml`: fonte unica das regras do manual.
- `scripts/generate-manual.ts`: gera `README.md` automaticamente.

## Evolucao prevista (proxima fase)

- Motor de regras completo (comprar, baixar, descartar, bater).
- Gateway em tempo real (WebSocket).
- Adaptador para Cloudflare Durable Objects mantendo a mesma interface do store.

