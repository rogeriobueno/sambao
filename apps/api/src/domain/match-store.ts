import {
  Card,
  GameState,
  Match,
  MatchMode,
  Meld,
  Player,
  playersPerTeamForMode,
  RoundScore,
  seatCountForMode,
  TeamId,
  TEAM_IDS,
} from './types.js';
import {
  advancePlayer,
  buildInitialDiscard,
  buildTripleDeck,
  canRemainWithOneCard,
  canGoOut,
  canTakeDiscardPile,
  createMeld,
  dealInitialHands,
  drawTwoFromStock,
  isAlternativeBatida,
  isBlackThree,
  processRedThrees,
  scoreRound,
  teamMeldsEmpty,
  validateMeldExtension,
  validateTableOpening,
  validateTableOpeningCombined,
} from './game-engine.js';

// ─── Input types ─────────────────────────────────────────────────────────────

type CreateMatchInput = { mode: MatchMode };
type AddPlayerInput = { name: string; teamId: TeamId };
type DrawInput = { playerId: string };
type DrawDiscardInput = { playerId: string };
type MeldInput = { playerId: string; cardIds: string[] };
type OpenTableInput = { playerId: string; cardGroups: string[][] };
type ExtendMeldInput = { playerId: string; meldId: string; cardIds: string[] };
type DiscardInput = { playerId: string; cardId: string };
type GoOutInput = { playerId: string; cardId: string };

// ─── Store ───────────────────────────────────────────────────────────────────

export class ActiveMatchStore {
  private activeMatch: Match | null = null;

  public getActive(): Match | null {
    return this.activeMatch;
  }

  public reset(): void {
    this.activeMatch = null;
  }

  public create(input: CreateMatchInput): Match {
    if (this.activeMatch) throw new Error('ACTIVE_MATCH_ALREADY_EXISTS');

    const match: Match = {
      id: crypto.randomUUID(),
      mode: input.mode,
      status: 'waiting',
      totalSeats: seatCountForMode(input.mode),
      playersPerTeam: playersPerTeamForMode(input.mode),
      players: [],
      game: null,
      roundHistory: [],
      createdAt: new Date().toISOString(),
    };

    this.activeMatch = match;
    return match;
  }

  public addPlayer(input: AddPlayerInput): Player {
    if (!this.activeMatch) throw new Error('NO_ACTIVE_MATCH');

    const match = this.activeMatch;
    if (match.players.length >= match.totalSeats) throw new Error('MATCH_IS_FULL');

    const teamSize = match.players.filter((p) => p.teamId === input.teamId).length;
    if (teamSize >= match.playersPerTeam) throw new Error('TEAM_IS_FULL');

    const player: Player = {
      id: crypto.randomUUID(),
      name: input.name,
      seat: match.players.length,
      teamId: input.teamId,
    };

    match.players.push(player);

    if (match.players.length === match.totalSeats) {
      match.status = 'in_progress';
      match.game = this.startRound(match.players, 1, { A: 0, B: 0 });
    }

    return player;
  }

  // ─── Turn: draw from stock ─────────────────────────────────────────────────

  public drawFromStock(input: DrawInput): Card[] {
    const { game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'must_draw') throw new Error('INVALID_TURN_PHASE');

    const drawn = drawTwoFromStock(game.stock);
    game.hands[input.playerId].push(...drawn);
    game.phase = 'can_meld_or_discard';
    game.isFirstTurnOfRound = false;

    // Auto-process any red 3s drawn
    const player = this.requirePlayer(input.playerId);
    const result = processRedThrees(game.hands[input.playerId], game.stock, player.teamId, game.redThrees);
    game.hands[input.playerId] = result.hand;
    game.stock = result.stock;

    return drawn;
  }

  // ─── Turn: draw from discard pile ─────────────────────────────────────────

  public drawFromDiscard(input: DrawDiscardInput): Card[] {
    const { game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'must_draw') throw new Error('INVALID_TURN_PHASE');

    const player = this.requirePlayer(input.playerId);
    const check = canTakeDiscardPile(
      game.hands[input.playerId],
      game.discardUp,
      game.teamTableOpened[player.teamId],
      game.isFirstTurnOfRound,
      game.discardBlocked,
    );

    if (!check.canTake) throw new Error(check.reason ?? 'CANNOT_TAKE_DISCARD');

    const taken = [...game.discardDown, ...game.discardUp];
    game.hands[input.playerId].push(...taken);
    game.discardDown = [];
    game.discardUp = [];
    game.discardBlocked = false;
    game.phase = 'can_meld_or_discard';
    game.isFirstTurnOfRound = false;

    // Auto-process any red 3s in taken cards
    const result = processRedThrees(game.hands[input.playerId], game.stock, player.teamId, game.redThrees);
    game.hands[input.playerId] = result.hand;
    game.stock = result.stock;

    return taken;
  }

  // ─── Turn: meld cards ──────────────────────────────────────────────────────

  public meldCards(input: MeldInput): Meld {
    const { game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'can_meld_or_discard') throw new Error('INVALID_TURN_PHASE');

    const player = this.requirePlayer(input.playerId);
    const hand = game.hands[input.playerId];

    const cards = input.cardIds.map((id) => {
      const c = hand.find((x) => x.id === id);
      if (!c) throw new Error('CARD_NOT_IN_HAND');
      return c;
    });

    // If table is not opened, single-group open still works, but combined open should use openTable().
    if (!game.teamTableOpened[player.teamId]) {
      validateTableOpening(cards, game.teamScores[player.teamId], game.discardDownIds);
    }

    const meld = createMeld(cards);

    // Rule 2: cannot create a second set for same rank; must extend existing one.
    if (meld.type === 'set') {
      const meldRank = meld.cards.find((c) => !c.isJoker)?.rank;
      const hasSameRankOpenSet = game.teamMelds[player.teamId].some((existing) => {
        if (existing.type !== 'set') return false;
        const existingRank = existing.cards.find((c) => !c.isJoker)?.rank;
        return existingRank === meldRank;
      });
      if (hasSameRankOpenSet) throw new Error('MUST_EXTEND_EXISTING_SET');
    }

    const toRemove = new Set(input.cardIds);
    const handAfter = hand.filter((c) => !toRemove.has(c.id));
    const nextTeamMelds = [...game.teamMelds[player.teamId], meld];
    this.ensureHandCanRemainAfterAction(handAfter, nextTeamMelds);

    if (!game.teamTableOpened[player.teamId]) {
      game.teamTableOpened[player.teamId] = true;
    }

    game.teamMelds[player.teamId].push(meld);
    game.hands[input.playerId] = handAfter;

    return meld;
  }

  /**
   * Opens the table with multiple meld groups combined in a single action.
   * Rule 1: first opening can sum multiple games to reach minimum.
   */
  public openTable(input: OpenTableInput): Meld[] {
    const { game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'can_meld_or_discard') throw new Error('INVALID_TURN_PHASE');

    const player = this.requirePlayer(input.playerId);
    if (game.teamTableOpened[player.teamId]) throw new Error('TABLE_ALREADY_OPENED');

    if (!Array.isArray(input.cardGroups) || input.cardGroups.length === 0) {
      throw new Error('INVALID_OPEN_TABLE_PAYLOAD');
    }

    const hand = game.hands[input.playerId];
    const groups = input.cardGroups.map((group) =>
      group.map((id) => {
        const c = hand.find((card) => card.id === id);
        if (!c) throw new Error('CARD_NOT_IN_HAND');
        return c;
      }),
    );

    validateTableOpeningCombined(groups, game.teamScores[player.teamId], game.discardDownIds);

    const melds = groups.map((cards) => createMeld(cards));

    // Rule 2: avoid creating duplicate set rank in same team/open action.
    const setRanks = new Set<string>();
    for (const existing of game.teamMelds[player.teamId]) {
      if (existing.type === 'set') {
        const r = existing.cards.find((c) => !c.isJoker)?.rank;
        if (r) setRanks.add(r);
      }
    }
    for (const meld of melds) {
      if (meld.type === 'set') {
        const r = meld.cards.find((c) => !c.isJoker)?.rank;
        if (r && setRanks.has(r)) throw new Error('MUST_EXTEND_EXISTING_SET');
        if (r) setRanks.add(r);
      }
    }

    const usedIds = new Set(input.cardGroups.flat());
    const handAfter = hand.filter((c) => !usedIds.has(c.id));
    const nextTeamMelds = [...game.teamMelds[player.teamId], ...melds];
    this.ensureHandCanRemainAfterAction(handAfter, nextTeamMelds);

    game.teamMelds[player.teamId].push(...melds);
    game.hands[input.playerId] = handAfter;
    game.teamTableOpened[player.teamId] = true;

    return melds;
  }

  public extendMeld(input: ExtendMeldInput): Meld {
    const { game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'can_meld_or_discard') throw new Error('INVALID_TURN_PHASE');

    const player = this.requirePlayer(input.playerId);
    const teamMelds = game.teamMelds[player.teamId];
    const meld = teamMelds.find((m) => m.id === input.meldId);
    if (!meld) throw new Error('MELD_NOT_FOUND');

    const hand = game.hands[input.playerId];
    const cards = input.cardIds.map((id) => {
      const card = hand.find((c) => c.id === id);
      if (!card) throw new Error('CARD_NOT_IN_HAND');
      return card;
    });

    validateMeldExtension(meld, cards);

    const usedIds = new Set(input.cardIds);
    const handAfter = hand.filter((c) => !usedIds.has(c.id));
    this.ensureHandCanRemainAfterAction(handAfter, teamMelds);
    game.hands[input.playerId] = handAfter;
    meld.cards.push(...cards);

    return meld;
  }

  // ─── Turn: discard ─────────────────────────────────────────────────────────

  public discard(input: DiscardInput): Card {
    const { match, game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'can_meld_or_discard') throw new Error('INVALID_TURN_PHASE');

    const player = this.requirePlayer(input.playerId);
    const hand = game.hands[input.playerId];
    const index = hand.findIndex((c) => c.id === input.cardId);
    if (index < 0) throw new Error('CARD_NOT_IN_HAND');

    const handAfter = hand.filter((_, i) => i !== index);
    if (handAfter.length === 0) throw new Error('MUST_USE_GO_OUT_TO_FINISH_HAND');
    this.ensureHandCanRemainAfterAction(handAfter, game.teamMelds[player.teamId]);

    const [card] = hand.splice(index, 1);
    game.discardUp.push(card);
    game.discardBlocked = isBlackThree(card);
    game.currentPlayerId = advancePlayer(match.players, input.playerId);
    game.phase = 'must_draw';

    return card;
  }

  // ─── Turn: go out (bater) ──────────────────────────────────────────────────

  public goOut(input: GoOutInput): { scores: Record<TeamId, RoundScore>; winType: string } {
    const { match, game } = this.requireGame();
    this.ensureCurrentPlayer(game, input.playerId);
    if (game.phase !== 'can_meld_or_discard') throw new Error('INVALID_TURN_PHASE');

    const player = this.requirePlayer(input.playerId);
    const hand = game.hands[input.playerId];
    const cardIndex = hand.findIndex((c) => c.id === input.cardId);
    if (cardIndex < 0) throw new Error('CARD_NOT_IN_HAND');

    // Simulate hand after discarding
    const handAfter = hand.filter((_, i) => i !== cardIndex);

    if (!canGoOut(handAfter, game.teamMelds[player.teamId])) {
      throw new Error('CANNOT_GO_OUT');
    }

    const winType = isAlternativeBatida(hand) ? 'alternative' : 'common';

    // Apply the discard
    const [card] = hand.splice(cardIndex, 1);
    game.discardUp.push(card);

    // Score and close round
    const scores = scoreRound(game, match.players, input.playerId, winType);
    for (const teamId of TEAM_IDS) {
      game.teamScores[teamId] += scores[teamId].total;
    }

    match.roundHistory.push(Object.values(scores) as RoundScore[]);
    match.status = 'finished';

    return { scores, winType };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private startRound(
    players: Player[],
    round: number,
    teamScores: Record<TeamId, number>,
  ): GameState {
    const stock = buildTripleDeck();
    const rawHands = dealInitialHands(players, stock);
    const discardResult = buildInitialDiscard(stock);

    const redThrees: Record<TeamId, Card[]> = { A: [], B: [] };

    // Auto-play all red 3s from each player's initial hand
    const hands: Record<string, Card[]> = {};
    for (const player of players) {
      const result = processRedThrees(rawHands[player.id], stock, player.teamId, redThrees);
      hands[player.id] = result.hand;
      // stock is mutated in place via processRedThrees returning new arrays
      stock.length = 0;
      stock.push(...result.stock);
    }

    const downIds = new Set(discardResult.down.map((c) => c.id));

    return {
      startedAt: new Date().toISOString(),
      round,
      stock,
      discardDown: discardResult.down,
      discardUp: discardResult.up,
      discardDownIds: downIds,
      hands,
      redThrees,
      teamMelds: teamMeldsEmpty(),
      teamTableOpened: { A: false, B: false },
      teamScores,
      currentPlayerId: players[0].id,
      phase: 'must_draw',
      discardBlocked: false,
      isFirstTurnOfRound: true,
    };
  }

  private ensureHandCanRemainAfterAction(handAfterAction: Card[], teamMelds: Meld[]): void {
    if (!canRemainWithOneCard(handAfterAction, teamMelds)) {
      throw new Error('INVALID_HAND_STATE_ONE_CARD_WITHOUT_GO_OUT');
    }
  }

  private requireGame(): { match: Match; game: GameState } {
    if (!this.activeMatch) throw new Error('NO_ACTIVE_MATCH');
    if (!this.activeMatch.game) throw new Error('MATCH_NOT_STARTED');
    return { match: this.activeMatch, game: this.activeMatch.game };
  }

  private ensureCurrentPlayer(game: GameState, playerId: string): void {
    if (game.currentPlayerId !== playerId) throw new Error('NOT_PLAYER_TURN');
  }

  private requirePlayer(playerId: string): Player {
    if (!this.activeMatch) throw new Error('NO_ACTIVE_MATCH');
    const player = this.activeMatch.players.find((p) => p.id === playerId);
    if (!player) throw new Error('PLAYER_NOT_FOUND');
    return player;
  }
}

