import { describe, expect, it } from 'vitest';
import type { Card, Meld } from '../src/domain/types.js';
import {
  buildInitialDiscard,
  buildTripleDeck,
  canRemainWithOneCard,
  dealInitialHands,
  validateMeld,
  validateMeldExtension,
  validateTableOpeningCombined,
} from '../src/domain/game-engine.js';

describe('game engine', () => {
  it('builds triple deck with jokers', () => {
    const deck = buildTripleDeck();
    expect(deck).toHaveLength(162);

    const jokers = deck.filter((card) => card.isJoker);
    expect(jokers).toHaveLength(18);
  });

  it('deals 15 cards per player and initializes discard', () => {
    const deck = buildTripleDeck();
    const players = [
      { id: 'p1', name: 'A', seat: 0, teamId: 'A' as const },
      { id: 'p2', name: 'B', seat: 1, teamId: 'B' as const },
      { id: 'p3', name: 'C', seat: 2, teamId: 'A' as const },
      { id: 'p4', name: 'D', seat: 3, teamId: 'B' as const },
    ];

    const hands = dealInitialHands(players, deck);
    expect(hands.p1).toHaveLength(15);
    expect(hands.p2).toHaveLength(15);
    expect(hands.p3).toHaveLength(15);
    expect(hands.p4).toHaveLength(15);

    const discard = buildInitialDiscard(deck);
    expect(discard.down).toHaveLength(3);
    expect(discard.up).toHaveLength(1);
  });

  it('validates set and rejects invalid sequence with joker', () => {
    const setType = validateMeld([
      { id: '1', rank: 'A', suit: 'hearts', isJoker: false },
      { id: '2', rank: 'A', suit: 'diamonds', isJoker: false },
      { id: '3', rank: '2', suit: 'clubs', isJoker: true },
    ]);

    expect(setType).toBe('set');

    expect(() =>
      validateMeld([
        { id: 'a', rank: '4', suit: 'spades', isJoker: false },
        { id: 'b', rank: '5', suit: 'spades', isJoker: false },
        { id: 'c', rank: '2', suit: 'spades', isJoker: true },
      ])
    ).toThrowError('SEQUENCE_CANNOT_HAVE_JOKER');
  });

  it('accepts same-suit sequences when ranks are consecutive even if selected out of order', () => {
    const sequenceType = validateMeld([
      { id: '1', rank: '6', suit: 'spades', isJoker: false },
      { id: '2', rank: '4', suit: 'spades', isJoker: false },
      { id: '3', rank: '5', suit: 'spades', isJoker: false },
    ]);

    expect(sequenceType).toBe('sequence');
  });

  it('accepts same-suit sequences ending in ace', () => {
    const sequenceType = validateMeld([
      { id: '1', rank: 'A', suit: 'hearts', isJoker: false },
      { id: '2', rank: 'Q', suit: 'hearts', isJoker: false },
      { id: '3', rank: 'K', suit: 'hearts', isJoker: false },
    ]);

    expect(sequenceType).toBe('sequence');
  });

  it('rejects same-suit cards that are not consecutive', () => {
    expect(() =>
      validateMeld([
        { id: '1', rank: '4', suit: 'clubs', isJoker: false },
        { id: '2', rank: '6', suit: 'clubs', isJoker: false },
        { id: '3', rank: '7', suit: 'clubs', isJoker: false },
      ])
    ).toThrowError('SEQUENCE_MUST_BE_CONSECUTIVE');
  });

  it('rejects duplicate same-suit ranks that do not form a legal sequence window', () => {
    expect(() =>
      validateMeld([
        { id: '1', rank: '4', suit: 'clubs', isJoker: false },
        { id: '2', rank: '4', suit: 'clubs', isJoker: false },
        { id: '3', rank: '5', suit: 'clubs', isJoker: false },
      ])
    ).toThrowError('SEQUENCE_MUST_BE_CONSECUTIVE');
  });

  it('accepts set when jokers are strictly fewer than naturals', () => {
    const setType = validateMeld([
      { id: '1', rank: 'A', suit: 'hearts', isJoker: false },
      { id: '2', rank: 'A', suit: 'diamonds', isJoker: false },
      { id: '3', rank: '2', suit: 'clubs', isJoker: true },
    ]);

    expect(setType).toBe('set');
  });

  it('rejects set when jokers are equal to naturals', () => {
    expect(() =>
      validateMeld([
        { id: '1', rank: 'A', suit: 'hearts', isJoker: false },
        { id: '2', rank: 'A', suit: 'diamonds', isJoker: false },
        { id: '3', rank: '2', suit: 'clubs', isJoker: true },
        { id: '4', rank: '2', suit: 'spades', isJoker: true },
      ])
    ).toThrowError('TOO_MANY_JOKERS_IN_SET');
  });

  it('rejects set when jokers are greater than naturals', () => {
    expect(() =>
      validateMeld([
        { id: '1', rank: 'K', suit: 'hearts', isJoker: false },
        { id: '2', rank: '2', suit: 'clubs', isJoker: true },
        { id: '3', rank: '2', suit: 'spades', isJoker: true },
      ])
    ).toThrowError('TOO_MANY_JOKERS_IN_SET');
  });

  it('allows extending an open set when jokers remain fewer than naturals', () => {
    const existingMeld: Meld = {
      id: 'm1',
      type: 'set',
      cards: [
        { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
        { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
        { id: 'j1', rank: '2', suit: 'clubs', isJoker: true },
      ],
    };

    const newCards: Card[] = [{ id: 'a3', rank: 'A', suit: 'spades', isJoker: false }];

    expect(() => validateMeldExtension(existingMeld, newCards)).not.toThrow();
  });

  it('rejects extending an open set when jokers become equal to naturals', () => {
    const existingMeld: Meld = {
      id: 'm1',
      type: 'set',
      cards: [
        { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
        { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
        { id: 'j1', rank: '2', suit: 'clubs', isJoker: true },
      ],
    };

    const newCards: Card[] = [{ id: 'j2', rank: '2', suit: 'spades', isJoker: true }];

    expect(() => validateMeldExtension(existingMeld, newCards)).toThrowError('TOO_MANY_JOKERS_IN_SET');
  });

  it('allows extending a sequence when the combined cards remain consecutive', () => {
    const existingMeld: Meld = {
      id: 'm2',
      type: 'sequence',
      cards: [
        { id: 's1', rank: '5', suit: 'hearts', isJoker: false },
        { id: 's2', rank: '6', suit: 'hearts', isJoker: false },
        { id: 's3', rank: '7', suit: 'hearts', isJoker: false },
      ],
    };

    const newCards: Card[] = [
      { id: 's4', rank: '4', suit: 'hearts', isJoker: false },
      { id: 's5', rank: '8', suit: 'hearts', isJoker: false },
    ];

    expect(() => validateMeldExtension(existingMeld, newCards)).not.toThrow();
  });

  it('rejects extending a sequence when the combined cards introduce a gap', () => {
    const existingMeld: Meld = {
      id: 'm3',
      type: 'sequence',
      cards: [
        { id: 's1', rank: '5', suit: 'diamonds', isJoker: false },
        { id: 's2', rank: '6', suit: 'diamonds', isJoker: false },
        { id: 's3', rank: '7', suit: 'diamonds', isJoker: false },
      ],
    };

    const newCards: Card[] = [{ id: 's4', rank: '9', suit: 'diamonds', isJoker: false }];

    expect(() => validateMeldExtension(existingMeld, newCards)).toThrowError('SEQUENCE_MUST_BE_CONSECUTIVE');
  });

  it('allows opening table with combined points from multiple melds', () => {
    const groups = [
      [
        { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
        { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
        { id: 'a3', rank: 'A', suit: 'spades', isJoker: false },
      ],
      [
        { id: 'k1', rank: 'K', suit: 'hearts', isJoker: false },
        { id: 'k2', rank: 'K', suit: 'diamonds', isJoker: false },
        { id: 'k3', rank: 'K', suit: 'spades', isJoker: false },
      ],
    ];

    // 3xA(20 each) + 3xK(10 each) = 90, enough for 2k..3,995 minimum
    expect(() => validateTableOpeningCombined(groups as any, 2500, new Set<string>())).not.toThrow();
  });

  it('blocks remaining with one card when the team cannot legally go out', () => {
    const handAfter: Card[] = [{ id: 'left', rank: 'K', suit: 'hearts', isJoker: false }];
    const teamMelds: Meld[] = [
      {
        id: 'meld-1',
        type: 'set',
        cards: [
          { id: 'a1', rank: 'A', suit: 'hearts', isJoker: false },
          { id: 'a2', rank: 'A', suit: 'diamonds', isJoker: false },
          { id: 'a3', rank: 'A', suit: 'clubs', isJoker: false },
        ],
      },
    ];

    expect(canRemainWithOneCard(handAfter, teamMelds)).toBe(false);
  });

  it('allows remaining with one card when the team already has two melds and can go out next', () => {
    const handAfter: Card[] = [{ id: 'left', rank: 'K', suit: 'hearts', isJoker: false }];
    const teamMelds: Meld[] = [
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

    expect(canRemainWithOneCard(handAfter, teamMelds)).toBe(true);
  });
});
