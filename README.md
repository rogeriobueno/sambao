# Manual do Jogo de Cartas Sambao

> Regras oficiais para mesa fisica e versao digital

> Este arquivo e a fonte oficial das regras.

---

## Formatos da Partida (digital)

| Modo | Configuracao |
| --- | --- |
| 1 contra 1 | 2 jogadores, 2 equipes, 1 por equipe |
| 2 contra 2 | 4 jogadores, 2 equipes, 2 por equipe |
| 3 contra 3 | 6 jogadores, 2 equipes, 3 por equipe |

## 1) Material

- 3 baralhos completos, incluindo todos os coringas (Jokers).

---

## 2) Objetivo

- Jogar em equipes para formar canastras e sequencias, somando pontos ate uma equipe alcancar 10.000 pontos.

---

## 3) Pontuacao das Cartas

| Carta | Valor de Pontos |
| --- | --- |
| Joker (coringa) | +50 |
| 2 (coringa de qualquer naipe) | +20 |
| A (qualquer naipe) | +20 |
| 8, 9, 10, J, Q, K | +10 cada |
| 4, 5, 6, 7 | +5 cada |
| 3 vermelho (copas e ouros) | +-100 cada (ver regra especial) |
| 3 preto (paus e espadas) | -100 cada (ver regra especial) |

> Coringas: Jokers e cartas 2 de qualquer naipe.
> Regra especial 3 vermelho: com 0 canastras/sequencias = -100 cada; com 1 = 0; com 2 ou mais = +100 cada; com 4, 5 ou 6 cartas vermelhas, cada uma vale 200 seguindo o mesmo sinal.
> Regra especial 3 preto: cada um vale -100 na contagem final e pode bloquear a compra do lixo pelo proximo jogador.

---

## 4) Canastras - Formacao

- Conjunto de 7 cartas do mesmo numero (qualquer naipe).
- Pode conter coringas, mas nunca mais coringas do que cartas naturais.
- Exemplo valida: A A A A + 3 coringas.
- Exemplo invalida: A A + 2 coringas.

| Tipo de Canastra | Pontos |
| --- | --- |
| Suja (com coringas) | +300 |
| Limpa (sem coringas) | +500 |
| De Ases suja | +500 |
| De Ases limpa | +800 |
| So de coringas (7 coringas) | +2000 (baixada de uma so vez) |

---

## 5) Sequencias - Formacao

- Serie de 7 ou mais cartas consecutivas do mesmo naipe, sem coringas e sem cartas 3.
- Ordem permitida: A, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A.
- Exemplo: A-Espadas, 4-Espadas, 5-Espadas, 6-Espadas, 7-Espadas, 8-Espadas, 9-Espadas.

| Tamanho da sequencia | Pontos |
| --- | --- |
| 3 ou 4 cartas | -1000 (multa) |
| 5 ou 6 cartas | 0 |
| 7 ou mais cartas | +1500 |

> Sequencias nao podem conter 2 (coringa) nem 3 de qualquer naipe.

---

## 6) Preparacao e Distribuicao

- Cada jogador recebe 15 cartas, em lotes de 3 por vez, no sentido horario.
- O primeiro a jogar e o jogador a esquerda do distribuidor.
- Apos distribuicao, recolher e baixar todos os 3 vermelhos na posicao da equipe.
- Iniciar o lixo com 3 cartas viradas para baixo e virar a 4a carta por cima.

---

## 7) Fluxo do Turno: Comprar e Descartar

- Comprar: escolher entre duas cartas do monte ou todo o lixo.
- Para comprar o lixo, a equipe precisa ter iniciado a mesa.
- Jogar cartas na mesa e opcional no turno.
- Descartar 1 carta no lixo para encerrar o turno.

> Compra do lixo por regra padrao: equipe iniciou a mesa e jogador possui 2 cartas iguais ao topo para formar jogo.
> Excecao do primeiro jogador: pode comprar lixo sem iniciar mesa se tiver 1 carta igual ao topo e 1 coringa.
> As cartas viradas do lixo nao contam para os pontos minimos de inicio da mesa.

---

## 8) Iniciar a Mesa (Requisito Minimo da Equipe)

| Placar da equipe | Exigencia minima para iniciar |
| --- | --- |
| 0 a 1.995 | 50 pontos |
| 2.000 a 3.995 | 90 pontos |
| 4.000 a 4.995 | 120 pontos |
| 5.000 a 7.995 | 150 pontos |
| 8.000 a 9.995 | 1 canastra ou 1 sequencia completa |

> Para iniciar um jogo na mesa, o minimo sao 3 cartas (trinca), podendo ser 2 cartas + 1 coringa.

---

## 9) Regras Especiais

- 3 preto: pode ser descartado para bloquear compra do lixo e vale -100 pontos na contagem final.
- 3 vermelho: deve ser baixado imediatamente ao ser recebido e da direito a compra de 1 carta extra do monte.

---

## 10) Bater e Fim da Rodada

- Para bater, o jogador deve baixar todas as cartas da mao e descartar 1 carta no lixo.
- A equipe precisa ter pelo menos 2 canastras ou sequencias formadas para bater.
- Bonus de batida comum: +300 pontos.
- Bonus de batida alternativa: +400 adicionais, se bater com 4 cartas de 3 pretos e descartar 1 carta qualquer.
- Na contagem final, somam-se os pontos dos jogos baixados e subtraem-se as cartas na mao dos adversarios.

---

## 11) Observacoes e Dicas

- Planeje as descidas para cumprir o requisito minimo da equipe rapidamente.
- Evite ficar com 3 pretos na mao perto do final da rodada.
- Controle o descarte para forcar ou impedir compra do lixo.

---

## Desenvolvimento

- O backend MVP suporta uma partida ativa por vez (single match).
- A interface minima local fica em `http://localhost:8787/`.
- Este README e gerado automaticamente de `rules/sambao.yaml`.
- Para editar regras, altere `rules/sambao.yaml` e rode `npm run generate:manual`.

## Rodar localmente (Docker)

```bash
docker compose up --build
```

## Endpoints MVP

- `GET /health`
- `GET /matches/modes`
- `GET /matches/active`
- `POST /matches` com `{ "mode": "1v1|2v2|3v3" }`
- `POST /matches/active/players` com `{ "name": "Nome", "teamId": "A|B" }`
- `POST /matches/active/draw` com `{ "playerId": "..." }`
- `POST /matches/active/draw-discard` com `{ "playerId": "..." }`
- `POST /matches/active/meld` com `{ "playerId": "...", "cardIds": ["..."] }`
- `POST /matches/active/open-table` com `{ "playerId": "...", "cardGroups": [["..."], ["..."]] }`
- `POST /matches/active/meld/extend` com `{ "playerId": "...", "meldId": "...", "cardIds": ["..."] }`
- `POST /matches/active/discard` com `{ "playerId": "...", "cardId": "..." }`
- `POST /matches/active/go-out` com `{ "playerId": "...", "cardId": "..." }`
- `POST /matches/active/reset`
