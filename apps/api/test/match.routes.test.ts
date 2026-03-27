import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ActiveMatchStore } from '../src/domain/match-store.js';

async function createStartedMatch() {
  const store = new ActiveMatchStore();
  const app = createApp(store);

  await app.request('/matches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: '1v1' }),
  });

  const p1Res = await app.request('/matches/active/players', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', teamId: 'A' }),
  });
  const p2Res = await app.request('/matches/active/players', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Beto', teamId: 'B' }),
  });

  const p1 = (await p1Res.json()) as { player: { id: string } };
  const p2 = (await p2Res.json()) as { player: { id: string } };

  const match = store.getActive();
  if (!match?.game) throw new Error('Expected started match');

  return { app, store, match, p1Id: p1.player.id, p2Id: p2.player.id };
}

describe('match routes', () => {
  it('returns supported match modes', async () => {
    const app = createApp();

    const response = await app.request('/matches/modes');
    expect(response.status).toBe(200);

    const payload = (await response.json()) as { modes: string[] };
    expect(payload.modes).toEqual(['1v1', '2v2', '3v3']);
  });

  it('creates an active match and prevents a second one', async () => {
    const app = createApp();

    const createFirst = await app.request('/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: '2v2' }),
    });

    expect(createFirst.status).toBe(201);
    const payload = (await createFirst.json()) as { match: { totalSeats: number } };
    expect(payload.match.totalSeats).toBe(4);

    const createSecond = await app.request('/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: '1v1' }),
    });

    expect(createSecond.status).toBe(409);
  });

  it('fills seats and transitions to in_progress', async () => {
    const app = createApp();

    await app.request('/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: '1v1' }),
    });

    await app.request('/matches/active/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', teamId: 'A' }),
    });

    await app.request('/matches/active/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Beto', teamId: 'B' }),
    });

    const active = await app.request('/matches/active');
    const activePayload = (await active.json()) as {
      match: { status: string; players: Array<{ name: string; teamId: string }>; game: unknown };
    };

    expect(activePayload.match.status).toBe('in_progress');
    expect(activePayload.match.players).toHaveLength(2);
    expect(activePayload.match.players[0].teamId).toBe('A');
    expect(activePayload.match.players[1].teamId).toBe('B');
    expect(activePayload.match.game).toBeTruthy();
  });

  it('blocks join when selected team is full', async () => {
    const app = createApp();

    await app.request('/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: '1v1' }),
    });

    const first = await app.request('/matches/active/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', teamId: 'A' }),
    });
    expect(first.status).toBe(201);

    const second = await app.request('/matches/active/players', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bruna', teamId: 'A' }),
    });
    expect(second.status).toBe(409);
  });

  it('allows draw then discard to pass turn', async () => {
    const { app, p1Id, p2Id } = await createStartedMatch();

    const draw = await app.request('/matches/active/draw', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id }),
    });
    expect(draw.status).toBe(200);

    const activeBeforeDiscard = await app.request('/matches/active');
    const beforePayload = (await activeBeforeDiscard.json()) as {
      match: { game: { hands: Record<string, Array<{ id: string }>> } };
    };

    const cardId = beforePayload.match.game.hands[p1Id][0].id;
    const discard = await app.request('/matches/active/discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardId }),
    });
    expect(discard.status).toBe(200);

    const activeAfterDiscard = await app.request('/matches/active');
    const afterPayload = (await activeAfterDiscard.json()) as {
      match: { game: { currentPlayerId: string; phase: string } };
    };

    expect(afterPayload.match.game.currentPlayerId).toBe(p2Id);
    expect(afterPayload.match.game.phase).toBe('must_draw');
  });

  it('allows taking the discard pile when the team has opened the table and the player has two matching naturals', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'must_draw';
    game.isFirstTurnOfRound = false;
    game.teamTableOpened.A = true;
    game.discardBlocked = false;
    game.discardDown = [{ id: 'down-1', rank: '4', suit: 'hearts', isJoker: false }];
    game.discardUp = [{ id: 'up-1', rank: 'Q', suit: 'clubs', isJoker: false }];
    game.hands[p1Id] = [
      { id: 'q-1', rank: 'Q', suit: 'hearts', isJoker: false },
      { id: 'q-2', rank: 'Q', suit: 'diamonds', isJoker: false },
    ];

    const response = await app.request('/matches/active/draw-discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { cards: Array<{ id: string }> };
    expect(payload.cards.map((card) => card.id)).toEqual(['down-1', 'up-1']);
    expect(game.discardDown).toEqual([]);
    expect(game.discardUp).toEqual([]);
    expect(game.phase).toBe('can_meld_or_discard');
    expect(game.hands[p1Id]).toHaveLength(4);
  });

  it('opens the table with multiple meld groups in one request', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamScores.A = 2500;
    game.teamTableOpened.A = false;
    game.hands[p1Id] = [
      { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
      { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
      { id: 'a3', rank: 'A', suit: 'spades', isJoker: false },
      { id: 'k1', rank: 'K', suit: 'hearts', isJoker: false },
      { id: 'k2', rank: 'K', suit: 'diamonds', isJoker: false },
      { id: 'k3', rank: 'K', suit: 'spades', isJoker: false },
    ];

    const response = await app.request('/matches/active/open-table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerId: p1Id,
        cardGroups: [
          ['a1', 'a2', 'a3'],
          ['k1', 'k2', 'k3'],
        ],
      }),
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { melds: Array<{ type: string }> };
    expect(payload.melds).toHaveLength(2);
    expect(payload.melds.every((meld) => meld.type === 'set')).toBe(true);
    expect(game.teamTableOpened.A).toBe(true);
    expect(game.teamMelds.A).toHaveLength(2);
    expect(game.hands[p1Id]).toEqual([]);
  });

  it('extends an existing meld with cards from the current player hand', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamTableOpened.A = true;
    game.teamMelds.A = [
      {
        id: 'meld-a',
        type: 'set',
        cards: [
          { id: 'base-1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'base-2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'base-3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [{ id: 'hand-a', rank: 'A', suit: 'spades', isJoker: false }];

    const response = await app.request('/matches/active/meld/extend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, meldId: 'meld-a', cardIds: ['hand-a'] }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { meld: { cards: Array<{ id: string }> } };
    expect(payload.meld.cards).toHaveLength(4);
    expect(game.hands[p1Id]).toEqual([]);
    expect(game.teamMelds.A[0].cards).toHaveLength(4);
  });

  it('allows going out when the player discards their last card and the team already has two melds', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamMelds.A = [
      {
        id: 'meld-1',
        type: 'set',
        cards: [
          { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'a3', rank: 'A', suit: 'clubs', isJoker: false },
          { id: 'a4', rank: 'A', suit: 'spades', isJoker: false },
          { id: 'a5', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'a6', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'a7', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
      {
        id: 'meld-2',
        type: 'sequence',
        cards: [
          { id: 's1', rank: '4', suit: 'spades', isJoker: false },
          { id: 's2', rank: '5', suit: 'spades', isJoker: false },
          { id: 's3', rank: '6', suit: 'spades', isJoker: false },
          { id: 's4', rank: '7', suit: 'spades', isJoker: false },
          { id: 's5', rank: '8', suit: 'spades', isJoker: false },
          { id: 's6', rank: '9', suit: 'spades', isJoker: false },
          { id: 's7', rank: '10', suit: 'spades', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [{ id: 'last-card', rank: 'K', suit: 'hearts', isJoker: false }];

    const response = await app.request('/matches/active/go-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardId: 'last-card' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { winType: string; scores: Record<string, { total: number }> };
    expect(payload.winType).toBe('common');
    expect(payload.scores.A.total).toBeGreaterThan(payload.scores.B.total);
    expect(match.status).toBe('finished');
  });

  it('blocks creating a second set with the same rank and requires extending the existing meld', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamTableOpened.A = true;
    game.teamMelds.A = [
      {
        id: 'meld-a',
        type: 'set',
        cards: [
          { id: 'base-a1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'base-a2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'base-a3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [
      { id: 'hand-a1', rank: 'A', suit: 'spades', isJoker: false },
      { id: 'hand-a2', rank: 'A', suit: 'hearts', isJoker: false },
      { id: 'hand-a3', rank: 'A', suit: 'diamonds', isJoker: false },
    ];

    const response = await app.request('/matches/active/meld', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardIds: ['hand-a1', 'hand-a2', 'hand-a3'] }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('MUST_EXTEND_EXISTING_SET');
  });

  it('blocks opening table with a set rank that is already open for the team', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamScores.A = 2500;
    game.teamTableOpened.A = false;
    game.teamMelds.A = [
      {
        id: 'existing-a',
        type: 'set',
        cards: [
          { id: 'ea1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'ea2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'ea3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [
      { id: 'na1', rank: 'A', suit: 'spades', isJoker: false },
      { id: 'na2', rank: 'A', suit: 'hearts', isJoker: false },
      { id: 'na3', rank: 'A', suit: 'diamonds', isJoker: false },
      { id: 'k1', rank: 'K', suit: 'hearts', isJoker: false },
      { id: 'k2', rank: 'K', suit: 'diamonds', isJoker: false },
      { id: 'k3', rank: 'K', suit: 'spades', isJoker: false },
    ];

    const response = await app.request('/matches/active/open-table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerId: p1Id,
        cardGroups: [
          ['na1', 'na2', 'na3'],
          ['k1', 'k2', 'k3'],
        ],
      }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('MUST_EXTEND_EXISTING_SET');
  });

  it('blocks melding when the action would leave one card and the team cannot go out', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamTableOpened.A = true;
    game.teamMelds.A = [];
    game.hands[p1Id] = [
      { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
      { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
      { id: 'a3', rank: 'A', suit: 'spades', isJoker: false },
      { id: 'left', rank: 'K', suit: 'clubs', isJoker: false },
    ];

    const response = await app.request('/matches/active/meld', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardIds: ['a1', 'a2', 'a3'] }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT');
  });

  it('blocks opening the table when the action would leave one card and the team cannot go out', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamScores.A = 0;
    game.teamTableOpened.A = false;
    game.hands[p1Id] = [
      { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
      { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
      { id: 'a3', rank: 'A', suit: 'spades', isJoker: false },
      { id: 'left', rank: 'K', suit: 'clubs', isJoker: false },
    ];

    const response = await app.request('/matches/active/open-table', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardGroups: [['a1', 'a2', 'a3']] }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT');
  });

  it('blocks extending a meld when the action would leave one card and the team cannot go out', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamTableOpened.A = true;
    game.teamMelds.A = [
      {
        id: 'meld-a',
        type: 'set',
        cards: [
          { id: 'base-1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'base-2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'base-3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [
      { id: 'hand-a', rank: 'A', suit: 'spades', isJoker: false },
      { id: 'left', rank: 'K', suit: 'clubs', isJoker: false },
    ];

    const response = await app.request('/matches/active/meld/extend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, meldId: 'meld-a', cardIds: ['hand-a'] }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT');
  });

  it('blocks discarding when the action would leave one card and the team cannot go out', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamMelds.A = [
      {
        id: 'meld-a',
        type: 'set',
        cards: [
          { id: 'base-1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'base-2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'base-3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [
      { id: 'discard-me', rank: '4', suit: 'spades', isJoker: false },
      { id: 'left', rank: 'K', suit: 'clubs', isJoker: false },
    ];

    const response = await app.request('/matches/active/discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardId: 'discard-me' }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT');
  });

  it('allows discarding down to one card when the team already has two melds and can still go out later', async () => {
    const { app, match, p1Id, p2Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamMelds.A = [
      {
        id: 'meld-1',
        type: 'set',
        cards: [
          { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'a3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
      {
        id: 'meld-2',
        type: 'sequence',
        cards: [
          { id: 's1', rank: '4', suit: 'spades', isJoker: false },
          { id: 's2', rank: '5', suit: 'spades', isJoker: false },
          { id: 's3', rank: '6', suit: 'spades', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [
      { id: 'discard-me', rank: '4', suit: 'hearts', isJoker: false },
      { id: 'left', rank: 'K', suit: 'clubs', isJoker: false },
    ];

    const response = await app.request('/matches/active/discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardId: 'discard-me' }),
    });

    expect(response.status).toBe(200);
    expect(game.hands[p1Id]).toHaveLength(1);
    expect(game.hands[p1Id][0].id).toBe('left');
    expect(game.currentPlayerId).toBe(p2Id);
  });

  it('blocks using discard to finish the hand even when go out would be legal', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'can_meld_or_discard';
    game.teamMelds.A = [
      {
        id: 'meld-1',
        type: 'set',
        cards: [
          { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'a3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
      {
        id: 'meld-2',
        type: 'sequence',
        cards: [
          { id: 's1', rank: '4', suit: 'spades', isJoker: false },
          { id: 's2', rank: '5', suit: 'spades', isJoker: false },
          { id: 's3', rank: '6', suit: 'spades', isJoker: false },
        ],
      },
    ];
    game.hands[p1Id] = [{ id: 'last-card', rank: 'K', suit: 'hearts', isJoker: false }];

    const response = await app.request('/matches/active/discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id, cardId: 'last-card' }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('MUST_USE_GO_OUT_TO_FINISH_HAND');
    expect(game.hands[p1Id]).toHaveLength(1);
    expect(game.discardUp.some((card) => card.id === 'last-card')).toBe(false);
  });

  it('allows taking the discard pile on the first turn with two matching naturals even without opening the table', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'must_draw';
    game.isFirstTurnOfRound = true;
    game.teamTableOpened.A = false;
    game.discardBlocked = false;
    game.discardDown = [{ id: 'down-1', rank: '4', suit: 'hearts', isJoker: false }];
    game.discardUp = [{ id: 'up-1', rank: 'Q', suit: 'clubs', isJoker: false }];
    game.hands[p1Id] = [
      { id: 'q-1', rank: 'Q', suit: 'hearts', isJoker: false },
      { id: 'q-2', rank: 'Q', suit: 'diamonds', isJoker: false },
    ];

    const response = await app.request('/matches/active/draw-discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id }),
    });

    expect(response.status).toBe(200);
    expect(game.hands[p1Id]).toHaveLength(4);
    expect(game.discardDown).toEqual([]);
    expect(game.discardUp).toEqual([]);
  });

  it('allows taking the discard pile on the first turn with one natural and one joker', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'must_draw';
    game.isFirstTurnOfRound = true;
    game.teamTableOpened.A = false;
    game.discardBlocked = false;
    game.discardDown = [{ id: 'down-1', rank: '4', suit: 'hearts', isJoker: false }];
    game.discardUp = [{ id: 'up-1', rank: 'Q', suit: 'clubs', isJoker: false }];
    game.hands[p1Id] = [
      { id: 'q-1', rank: 'Q', suit: 'hearts', isJoker: false },
      { id: 'j-1', rank: '2', suit: 'hearts', isJoker: true },
    ];

    const response = await app.request('/matches/active/draw-discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id }),
    });

    expect(response.status).toBe(200);
    expect(game.hands[p1Id]).toHaveLength(4);
  });

  it('blocks taking the discard pile on a non-first turn when the table is not yet opened', async () => {
    const { app, match, p1Id } = await createStartedMatch();
    const game = match.game!;

    game.currentPlayerId = p1Id;
    game.phase = 'must_draw';
    game.isFirstTurnOfRound = false;
    game.teamTableOpened.A = false;
    game.discardBlocked = false;
    game.discardDown = [{ id: 'down-1', rank: '4', suit: 'hearts', isJoker: false }];
    game.discardUp = [{ id: 'up-1', rank: 'Q', suit: 'clubs', isJoker: false }];
    game.hands[p1Id] = [
      { id: 'q-1', rank: 'Q', suit: 'hearts', isJoker: false },
      { id: 'q-2', rank: 'Q', suit: 'diamonds', isJoker: false },
    ];

    const response = await app.request('/matches/active/draw-discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: p1Id }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('TABLE_NOT_OPENED');
  });
});

