# Fases de Implementacao

## Fase 1 (agora)

- Partida unica ativa.
- Criar partida com modo `1v1`, `2v2` ou `3v3`.
- Entrar jogadores por assento ate lotar.
- Manual gerado por `rules/sambao.yaml`.

## Fase 2

- Estruturas de cartas, baralho triplo e distribuicao.
- Fluxo de turno: comprar, baixar, descartar.
- Validacoes basicas de canastra e sequencia.

## Fase 3

- Pontuacao completa de rodada.
- Regras especiais (3 vermelho e 3 preto) com casos de borda.
- Batida comum e alternativa.

## Fase 4

- Tempo real com WebSocket para mesa multiusuario.
- Preparacao para migração para Cloudflare Durable Objects.

