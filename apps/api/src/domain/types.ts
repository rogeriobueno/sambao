export const MATCH_MODES = ['1v1', '2v2', '3v3'] as const;
export const TEAM_IDS = ['A', 'B'] as const;

export type MatchMode = (typeof MATCH_MODES)[number];
export type TeamId = (typeof TEAM_IDS)[number];

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

export type Card = {
  id: string;
  rank: Rank | 'JOKER';
  suit: Suit | null;
  isJoker: boolean;
};

export type Meld = {
  id: string;
  type: 'set' | 'sequence';
  cards: Card[];
};

export type TurnPhase = 'must_draw' | 'can_meld_or_discard';

export type RoundScore = {
  teamId: TeamId;
  meldBonus: number;
  cardValuePoints: number;
  redThreePoints: number;
  blackThreePenalty: number;
  winnerBonus: number;
  total: number;
};

export type GameState = {
  startedAt: string;
  round: number;
  stock: Card[];
  discardDown: Card[];
  discardUp: Card[];
  discardDownIds: Set<string>;
  hands: Record<string, Card[]>;
  redThrees: Record<TeamId, Card[]>;
  teamMelds: Record<TeamId, Meld[]>;
  teamTableOpened: Record<TeamId, boolean>;
  teamScores: Record<TeamId, number>;
  currentPlayerId: string;
  phase: TurnPhase;
  discardBlocked: boolean;
  isFirstTurnOfRound: boolean;
};

export type Player = {
  id: string;
  name: string;
  seat: number;
  teamId: TeamId;
};

export type Match = {
  id: string;
  mode: MatchMode;
  status: 'waiting' | 'in_progress' | 'finished';
  totalSeats: number;
  playersPerTeam: number;
  players: Player[];
  game: GameState | null;
  roundHistory: RoundScore[][];
  createdAt: string;
};

export function isMatchMode(value: string): value is MatchMode {
  return (MATCH_MODES as readonly string[]).includes(value);
}

export function isTeamId(value: string): value is TeamId {
  return (TEAM_IDS as readonly string[]).includes(value);
}

export function seatCountForMode(mode: MatchMode): number {
  if (mode === '1v1') return 2;
  if (mode === '2v2') return 4;
  return 6;
}

export function playersPerTeamForMode(mode: MatchMode): number {
  return seatCountForMode(mode) / 2;
}
