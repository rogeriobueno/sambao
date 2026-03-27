import { Hono } from 'hono';
import { ActiveMatchStore } from './domain/match-store.js';
import { isMatchMode, isTeamId, MATCH_MODES, TEAM_IDS } from './domain/types.js';

async function body<T>(req: { json: () => Promise<T> }): Promise<Partial<T>> {
  return req.json().catch(() => ({}) as Partial<T>);
}

export function createApp(store = new ActiveMatchStore()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/matches/active', (c) => c.json({ match: store.getActive() }));
  app.get('/matches/modes', (c) => c.json({ modes: MATCH_MODES }));

  app.post('/matches', async (c) => {
    const p = await body<{ mode: string }>(c.req);
    if (!p.mode || !isMatchMode(p.mode))
      return c.json({ error: 'INVALID_MODE', allowedModes: MATCH_MODES }, 400);
    try {
      return c.json({ match: store.create({ mode: p.mode }) }, 201);
    } catch (e) {
      if (e instanceof Error && e.message === 'ACTIVE_MATCH_ALREADY_EXISTS')
        return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/players', async (c) => {
    const p = await body<{ name: string; teamId: string }>(c.req);
    const name = p.name?.trim();
    if (!name) return c.json({ error: 'INVALID_PLAYER_NAME' }, 400);
    if (!p.teamId || !isTeamId(p.teamId))
      return c.json({ error: 'INVALID_TEAM_ID', allowedTeams: TEAM_IDS }, 400);
    try {
      return c.json({ player: store.addPlayer({ name, teamId: p.teamId }) }, 201);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH'].includes(e.message)) return c.json({ error: e.message }, 404);
      if (['MATCH_IS_FULL', 'TEAM_IS_FULL'].includes(e.message)) return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/draw', async (c) => {
    const p = await body<{ playerId: string }>(c.req);
    if (!p.playerId) return c.json({ error: 'INVALID_PLAYER_ID' }, 400);
    try {
      return c.json({ cards: store.drawFromStock({ playerId: p.playerId }) }, 200);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND'].includes(e.message))
        return c.json({ error: e.message }, 404);
      if (['NOT_PLAYER_TURN', 'INVALID_TURN_PHASE', 'STOCK_EMPTY'].includes(e.message))
        return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/draw-discard', async (c) => {
    const p = await body<{ playerId: string }>(c.req);
    if (!p.playerId) return c.json({ error: 'INVALID_PLAYER_ID' }, 400);
    try {
      return c.json({ cards: store.drawFromDiscard({ playerId: p.playerId }) }, 200);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND'].includes(e.message))
        return c.json({ error: e.message }, 404);
      if (
        [
          'NOT_PLAYER_TURN', 'INVALID_TURN_PHASE',
          'DISCARD_BLOCKED_BY_BLACK_THREE', 'DISCARD_PILE_EMPTY',
          'TABLE_NOT_OPENED', 'NEED_ONE_MATCHING_AND_ONE_JOKER', 'NEED_TWO_MATCHING_CARDS',
          'CANNOT_TAKE_DISCARD',
        ].includes(e.message)
      )
        return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/meld', async (c) => {
    const p = await body<{ playerId: string; cardIds: string[] }>(c.req);
    if (!p.playerId || !Array.isArray(p.cardIds))
      return c.json({ error: 'INVALID_MELD_PAYLOAD' }, 400);
    try {
      return c.json({ meld: store.meldCards({ playerId: p.playerId, cardIds: p.cardIds }) }, 201);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND', 'CARD_NOT_IN_HAND'].includes(e.message))
        return c.json({ error: e.message }, 404);
      if (
        [
          'NOT_PLAYER_TURN', 'INVALID_TURN_PHASE',
          'MELD_TOO_SMALL', 'TOO_MANY_JOKERS_IN_SET',
          'SEQUENCE_CANNOT_HAVE_JOKER', 'SEQUENCE_MUST_HAVE_SAME_SUIT', 'SEQUENCE_CANNOT_HAVE_THREE',
          'SEQUENCE_MUST_BE_CONSECUTIVE',
          'TABLE_MINIMUM_NOT_MET', 'TABLE_NEEDS_COMPLETE_MELD',
          'MUST_EXTEND_EXISTING_SET',
          'INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT',
        ].includes(e.message)
      )
        return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/open-table', async (c) => {
    const p = await body<{ playerId: string; cardGroups: string[][] }>(c.req);
    if (!p.playerId || !Array.isArray(p.cardGroups)) {
      return c.json({ error: 'INVALID_OPEN_TABLE_PAYLOAD' }, 400);
    }

    try {
      const melds = store.openTable({ playerId: p.playerId, cardGroups: p.cardGroups });
      return c.json({ melds }, 201);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND', 'CARD_NOT_IN_HAND'].includes(e.message)) {
        return c.json({ error: e.message }, 404);
      }
      if (
        [
          'NOT_PLAYER_TURN',
          'INVALID_TURN_PHASE',
          'TABLE_ALREADY_OPENED',
          'INVALID_OPEN_TABLE_PAYLOAD',
          'NO_MELDS_PROVIDED',
          'MELD_TOO_SMALL',
          'TOO_MANY_JOKERS_IN_SET',
          'SEQUENCE_CANNOT_HAVE_JOKER',
          'SEQUENCE_MUST_HAVE_SAME_SUIT',
          'SEQUENCE_CANNOT_HAVE_THREE',
          'SEQUENCE_MUST_BE_CONSECUTIVE',
          'TABLE_MINIMUM_NOT_MET',
          'TABLE_NEEDS_COMPLETE_MELD',
          'MUST_EXTEND_EXISTING_SET',
           'INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT',
        ].includes(e.message)
      ) {
        return c.json({ error: e.message }, 409);
      }
      throw e;
    }
  });

  app.post('/matches/active/meld/extend', async (c) => {
    const p = await body<{ playerId: string; meldId: string; cardIds: string[] }>(c.req);
    if (!p.playerId || !p.meldId || !Array.isArray(p.cardIds)) {
      return c.json({ error: 'INVALID_EXTEND_MELD_PAYLOAD' }, 400);
    }

    try {
      const meld = store.extendMeld({
        playerId: p.playerId,
        meldId: p.meldId,
        cardIds: p.cardIds,
      });
      return c.json({ meld }, 200);
    } catch (e) {
      if (!(e instanceof Error)) throw e;

      if (
        ['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND', 'CARD_NOT_IN_HAND', 'MELD_NOT_FOUND'].includes(
          e.message,
        )
      ) {
        return c.json({ error: e.message }, 404);
      }

      if (
        [
          'NOT_PLAYER_TURN',
          'INVALID_TURN_PHASE',
          'NO_CARDS_TO_EXTEND_MELD',
          'CARD_RANK_MISMATCH',
          'TOO_MANY_JOKERS_IN_SET',
          'SEQUENCE_CANNOT_HAVE_JOKER',
          'SEQUENCE_CANNOT_HAVE_THREE',
          'SEQUENCE_MUST_HAVE_SAME_SUIT',
          'SEQUENCE_MUST_BE_CONSECUTIVE',
          'INVALID_SET_BASE',
          'INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT',
        ].includes(e.message)
      ) {
        return c.json({ error: e.message }, 409);
      }

      throw e;
    }
  });

  app.post('/matches/active/discard', async (c) => {
    const p = await body<{ playerId: string; cardId: string }>(c.req);
    if (!p.playerId || !p.cardId) return c.json({ error: 'INVALID_DISCARD_PAYLOAD' }, 400);
    try {
      return c.json({ card: store.discard({ playerId: p.playerId, cardId: p.cardId }) }, 200);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND', 'CARD_NOT_IN_HAND'].includes(e.message))
        return c.json({ error: e.message }, 404);
      if (
        ['NOT_PLAYER_TURN', 'INVALID_TURN_PHASE', 'INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT', 'MUST_USE_GO_OUT_TO_FINISH_HAND'].includes(e.message)
      )
        return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/go-out', async (c) => {
    const p = await body<{ playerId: string; cardId: string }>(c.req);
    if (!p.playerId || !p.cardId) return c.json({ error: 'INVALID_GO_OUT_PAYLOAD' }, 400);
    try {
      return c.json(store.goOut({ playerId: p.playerId, cardId: p.cardId }), 200);
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (['NO_ACTIVE_MATCH', 'MATCH_NOT_STARTED', 'PLAYER_NOT_FOUND', 'CARD_NOT_IN_HAND'].includes(e.message))
        return c.json({ error: e.message }, 404);
      if (['NOT_PLAYER_TURN', 'INVALID_TURN_PHASE', 'CANNOT_GO_OUT'].includes(e.message))
        return c.json({ error: e.message }, 409);
      throw e;
    }
  });

  app.post('/matches/active/reset', (c) => {
    store.reset();
    return c.json({ ok: true });
  });

  return app;
}

