import { Card, GameState, Meld, Player, RoundScore, TeamId, TEAM_IDS } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Card classification ─────────────────────────────────────────────────────

export function isRedThree(card: Card): boolean {
  return card.rank === '3' && (card.suit === 'hearts' || card.suit === 'diamonds');
}

export function isBlackThree(card: Card): boolean {
  return card.rank === '3' && (card.suit === 'clubs' || card.suit === 'spades');
}

export function cardPoints(card: Card): number {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === '2') return 20;
  if (card.rank === 'A') return 20;
  if (['8', '9', '10', 'J', 'Q', 'K'].includes(card.rank)) return 10;
  if (['4', '5', '6', '7'].includes(card.rank)) return 5;
  // 3s are handled separately; return 0 as base (penalty applied elsewhere)
  return 0;
}

// ─── Deck ────────────────────────────────────────────────────────────────────

export function buildTripleDeck(): Card[] {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

  const cards: Card[] = [];
  for (let deck = 0; deck < 3; deck += 1) {
    for (const suit of suits) {
      for (const rank of ranks) {
        cards.push({
          id: `D${deck + 1}-${suit}-${rank}-${crypto.randomUUID()}`,
          rank,
          suit,
          isJoker: rank === '2',
        });
      }
    }
    cards.push({ id: `D${deck + 1}-joker-1-${crypto.randomUUID()}`, rank: 'JOKER', suit: null, isJoker: true });
    cards.push({ id: `D${deck + 1}-joker-2-${crypto.randomUUID()}`, rank: 'JOKER', suit: null, isJoker: true });
  }
  return shuffle(cards);
}

// ─── Deal ────────────────────────────────────────────────────────────────────

export function dealInitialHands(players: Player[], deck: Card[]): Record<string, Card[]> {
  const hands: Record<string, Card[]> = {};
  for (const player of players) hands[player.id] = [];

  for (let batch = 0; batch < 5; batch += 1) {
    for (const player of players) {
      for (let i = 0; i < 3; i += 1) {
        const card = deck.pop();
        if (!card) throw new Error('DECK_EXHAUSTED_WHILE_DEALING');
        hands[player.id].push(card);
      }
    }
  }
  return hands;
}

export function buildInitialDiscard(deck: Card[]): { down: Card[]; up: Card[] } {
  const down: Card[] = [];
  for (let i = 0; i < 3; i += 1) {
    const card = deck.pop();
    if (!card) throw new Error('DECK_EXHAUSTED_WHILE_STARTING_DISCARD');
    down.push(card);
  }
  const upCard = deck.pop();
  if (!upCard) throw new Error('DECK_EXHAUSTED_WHILE_STARTING_DISCARD');
  return { down, up: [upCard] };
}

// ─── Red three auto-play ─────────────────────────────────────────────────────

export function processRedThrees(
  hand: Card[],
  stock: Card[],
  teamId: TeamId,
  redThrees: Record<TeamId, Card[]>,
): { hand: Card[]; stock: Card[] } {
  let h = [...hand];
  let s = [...stock];

  let found = h.find(isRedThree);
  while (found) {
    redThrees[teamId].push(found);
    h = h.filter((c) => c.id !== found!.id);
    // Draw 1 extra card
    const extra = s.pop();
    if (extra) {
      if (isRedThree(extra)) {
        // Chain: another red three also goes to table
        redThrees[teamId].push(extra);
        const extra2 = s.pop();
        if (extra2) h.push(extra2);
      } else {
        h.push(extra);
      }
    }
    found = h.find(isRedThree);
  }

  return { hand: h, stock: s };
}

// ─── Draw ────────────────────────────────────────────────────────────────────

export function drawTwoFromStock(stock: Card[]): Card[] {
  const first = stock.pop();
  const second = stock.pop();
  if (!first || !second) throw new Error('STOCK_EMPTY');
  return [first, second];
}

export function canTakeDiscardPile(
  hand: Card[],
  discardUp: Card[],
  teamTableOpened: boolean,
  isFirstTurnOfRound: boolean,
  discardBlocked: boolean,
): { canTake: boolean; reason?: string } {
  if (discardBlocked) return { canTake: false, reason: 'DISCARD_BLOCKED_BY_BLACK_THREE' };
  if (discardUp.length === 0) return { canTake: false, reason: 'DISCARD_PILE_EMPTY' };

  const topCard = discardUp[discardUp.length - 1];
  const matching = hand.filter((c) => !c.isJoker && c.rank === topCard.rank);
  const jokers = hand.filter((c) => c.isJoker);

  if (!teamTableOpened) {
    // Without an open table only the first turn allows taking the pile.
    if (!isFirstTurnOfRound) return { canTake: false, reason: 'TABLE_NOT_OPENED' };
    // First-turn: 2 matching naturals (standard trio) OR 1 matching + 1 joker (exception).
    if (matching.length >= 2) return { canTake: true };
    if (matching.length >= 1 && jokers.length >= 1) return { canTake: true };
    return { canTake: false, reason: 'NEED_ONE_MATCHING_AND_ONE_JOKER' };
  }

  // Table is open: standard rule – need 2 matching naturals to form a trio with the top card.
  if (matching.length >= 2) return { canTake: true };
  return { canTake: false, reason: 'NEED_TWO_MATCHING_CARDS' };
}

// ─── Table minimum ───────────────────────────────────────────────────────────

export function getTableMinimumPoints(teamScore: number): number {
  if (teamScore >= 8000) return Infinity; // must have complete canastra/sequence
  if (teamScore >= 5000) return 150;
  if (teamScore >= 4000) return 120;
  if (teamScore >= 2000) return 90;
  return 50;
}

export function validateTableOpening(
  cards: Card[],
  teamScore: number,
  discardDownIds: Set<string>,
): void {
  // Cards from the face-down discard pile do not count toward minimum
  const countable = cards.filter((c) => !discardDownIds.has(c.id));

  if (teamScore >= 8000) {
    // Need at least a complete canastra (7-card set) or complete sequence (7+)
    const naturals = cards.filter((c) => !c.isJoker);
    const jokers = cards.filter((c) => c.isJoker).length;
    const sameRank = naturals.length > 0 && naturals.every((c) => c.rank === naturals[0].rank);
    const isCompleteCanastra = sameRank && cards.length >= 7 && jokers < naturals.length;
    const isCompleteSequence =
      !cards.some((c) => c.isJoker) &&
      cards.length >= 7 &&
      !cards.some((c) => c.rank === '3');
    if (!isCompleteCanastra && !isCompleteSequence) {
      throw new Error('TABLE_NEEDS_COMPLETE_MELD');
    }
    return;
  }

  const min = getTableMinimumPoints(teamScore);
  const pts = countable.reduce((sum, c) => sum + cardPoints(c), 0);
  if (pts < min) throw new Error('TABLE_MINIMUM_NOT_MET');
}

/**
 * Validates table opening using multiple meld groups in one action.
 * The minimum score is checked against the combined cards from all groups.
 */
export function validateTableOpeningCombined(
  groups: Card[][],
  teamScore: number,
  discardDownIds: Set<string>,
): void {
  if (groups.length === 0) throw new Error('NO_MELDS_PROVIDED');

  for (const group of groups) {
    validateMeld(group);
  }

  const allCards = groups.flat();
  validateTableOpening(allCards, teamScore, discardDownIds);
}

// ─── Meld validation ─────────────────────────────────────────────────────────

const SEQUENCE_ORDER: ReadonlyArray<Card['rank']> = ['A', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function buildRankCounts(ranks: ReadonlyArray<Card['rank']>): Map<Card['rank'], number> {
  const counts = new Map<Card['rank'], number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

function sameRankCounts(a: Map<Card['rank'], number>, b: Map<Card['rank'], number>): boolean {
  if (a.size !== b.size) return false;

  for (const [rank, count] of a) {
    if (b.get(rank) !== count) return false;
  }

  return true;
}

function findSequenceWindow(cards: Card[]): ReadonlyArray<Card['rank']> | null {
  if (cards.length > SEQUENCE_ORDER.length) return null;

  const ranks = cards.map((card) => card.rank);
  const rankCounts = buildRankCounts(ranks);

  for (let start = 0; start <= SEQUENCE_ORDER.length - cards.length; start += 1) {
    const window = SEQUENCE_ORDER.slice(start, start + cards.length);
    if (sameRankCounts(rankCounts, buildRankCounts(window))) {
      return window;
    }
  }

  return null;
}

export function validateMeld(cards: Card[]): Meld['type'] {
  if (cards.length < 3) throw new Error('MELD_TOO_SMALL');

  const naturals = cards.filter((c) => !c.isJoker);
  const sameRank = naturals.every((c) => c.rank === naturals[0]?.rank);

  if (sameRank) {
    const jokers = cards.length - naturals.length;
    if (jokers >= naturals.length) throw new Error('TOO_MANY_JOKERS_IN_SET');
    return 'set';
  }

  if (cards.some((c) => c.isJoker)) throw new Error('SEQUENCE_CANNOT_HAVE_JOKER');

  const suit = cards[0]?.suit;
  if (!suit || !cards.every((c) => c.suit === suit)) throw new Error('SEQUENCE_MUST_HAVE_SAME_SUIT');

  if (cards.some((c) => c.rank === '3')) throw new Error('SEQUENCE_CANNOT_HAVE_THREE');
  if (!findSequenceWindow(cards)) throw new Error('SEQUENCE_MUST_BE_CONSECUTIVE');

  return 'sequence';
}

export function createMeld(cards: Card[]): Meld {
  return { id: crypto.randomUUID(), type: validateMeld(cards), cards };
}

/**
 * Validate adding cards to an already-open meld on the table.
 * For sets/canastras: keep strict rule jokers < naturals at all times.
 */
export function validateMeldExtension(existing: Meld, newCards: Card[]): void {
  if (newCards.length === 0) throw new Error('NO_CARDS_TO_EXTEND_MELD');

  if (existing.type === 'set') {
    const baseRank = existing.cards.find((c) => !c.isJoker)?.rank;
    if (!baseRank) throw new Error('INVALID_SET_BASE');

    for (const card of newCards) {
      if (!card.isJoker && card.rank !== baseRank) {
        throw new Error('CARD_RANK_MISMATCH');
      }
    }

    const all = [...existing.cards, ...newCards];
    const naturals = all.filter((c) => !c.isJoker).length;
    const jokers = all.filter((c) => c.isJoker).length;
    if (jokers >= naturals) throw new Error('TOO_MANY_JOKERS_IN_SET');
    return;
  }

  // sequence extension
  if (newCards.some((c) => c.isJoker)) throw new Error('SEQUENCE_CANNOT_HAVE_JOKER');
  if (newCards.some((c) => c.rank === '3')) throw new Error('SEQUENCE_CANNOT_HAVE_THREE');

  const suit = existing.cards[0]?.suit;
  if (!suit || !newCards.every((c) => c.suit === suit)) {
    throw new Error('SEQUENCE_MUST_HAVE_SAME_SUIT');
  }

  if (!findSequenceWindow([...existing.cards, ...newCards])) {
    throw new Error('SEQUENCE_MUST_BE_CONSECUTIVE');
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

export function getMeldBonus(meld: Meld): number {
  if (meld.type === 'sequence') {
    const len = meld.cards.length;
    if (len >= 7) return 1500;
    if (len >= 5) return 0;
    return -1000; // 3–4 card sequence = penalty
  }

  // set: only complete canastras (7 cards) earn a bonus
  if (meld.cards.length < 7) return 0;

  const allJokers = meld.cards.every((c) => c.isJoker);
  if (allJokers) return 2000;

  const naturals = meld.cards.filter((c) => !c.isJoker);
  const isDirty = meld.cards.some((c) => c.isJoker);
  const isAces = naturals.every((c) => c.rank === 'A');

  if (isAces) return isDirty ? 500 : 800;
  return isDirty ? 300 : 500;
}

export function scoreRedThrees(redThreeCount: number, teamMeldCount: number): number {
  if (redThreeCount === 0) return 0;
  const base = redThreeCount >= 4 ? 200 : 100;
  if (teamMeldCount === 0) return -base * redThreeCount;
  if (teamMeldCount === 1) return 0;
  return base * redThreeCount;
}

export function scoreRound(
  game: GameState,
  players: Player[],
  winnerId: string,
  winType: 'common' | 'alternative',
): Record<TeamId, RoundScore> {
  const result: Record<TeamId, RoundScore> = {
    A: { teamId: 'A', meldBonus: 0, cardValuePoints: 0, redThreePoints: 0, blackThreePenalty: 0, winnerBonus: 0, total: 0 },
    B: { teamId: 'B', meldBonus: 0, cardValuePoints: 0, redThreePoints: 0, blackThreePenalty: 0, winnerBonus: 0, total: 0 },
  };

  // 1. Meld bonuses + card values in melds
  for (const teamId of TEAM_IDS) {
    for (const meld of game.teamMelds[teamId]) {
      result[teamId].meldBonus += getMeldBonus(meld);
      result[teamId].cardValuePoints += meld.cards.reduce((sum, c) => sum + cardPoints(c), 0);
    }
  }

  // 2. Cards in hand = negative points for that team
  for (const player of players) {
    const hand = game.hands[player.id] ?? [];
    const penalty = hand.reduce((sum, c) => {
      if (isBlackThree(c)) return sum + 100;
      return sum + cardPoints(c);
    }, 0);
    result[player.teamId].cardValuePoints -= penalty;
  }

  // 3. Red three scoring per team
  for (const teamId of TEAM_IDS) {
    result[teamId].redThreePoints = scoreRedThrees(
      game.redThrees[teamId].length,
      game.teamMelds[teamId].length,
    );
  }

  // 4. Black three penalty (applied via hand penalty above; also count ones used to block in discard)
  // For now counted in hand penalty section

  // 5. Winner bonus
  const winner = players.find((p) => p.id === winnerId);
  if (winner) {
    result[winner.teamId].winnerBonus = winType === 'alternative' ? 700 : 300;
  }

  // 6. Totals
  for (const teamId of TEAM_IDS) {
    const r = result[teamId];
    r.total = r.meldBonus + r.cardValuePoints + r.redThreePoints - r.blackThreePenalty + r.winnerBonus;
  }

  return result;
}

// ─── Turn helpers ─────────────────────────────────────────────────────────────

export function advancePlayer(players: Player[], currentPlayerId: string): string {
  const index = players.findIndex((p) => p.id === currentPlayerId);
  if (index < 0) throw new Error('CURRENT_PLAYER_NOT_FOUND');
  return players[(index + 1) % players.length].id;
}

export function canGoOut(handAfterLastDiscard: Card[], teamMelds: Meld[]): boolean {
  return handAfterLastDiscard.length === 0 && teamMelds.length >= 2;
}

export function canRemainWithOneCard(handAfterAction: Card[], teamMelds: Meld[]): boolean {
  return handAfterAction.length !== 1 || canGoOut([], teamMelds);
}

export function isAlternativeBatida(handBeforeDiscard: Card[]): boolean {
  return handBeforeDiscard.filter(isBlackThree).length === 4;
}

export function teamMeldsEmpty(): Record<TeamId, Meld[]> {
  return { A: [], B: [] };
}

