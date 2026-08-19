// Core types for the Spades engine. Kept framework-free so this package can be used
// identically by local play, online play, the bots, and the hint generator — same shape as
// the rest of the series (Mexican Train / Golf / Durak).
//
// Rules modeled: standard American Spades — bid tricks (or Nil), spades are always trump and
// can't be led until "broken", must follow suit, bags accumulate and cost -100 at 10. At 4
// players, "Partners" mode pairs seats 0+2 against 1+3 and bids/scores as two teams; any
// other player count (2 or 3) is always "Cutthroat" — everyone scored individually. See
// scoring.ts for the actual point math and gameEngine.ts's ScoringGroup for how the two modes
// share one code path.

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAMES: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
// Ace HIGH, unlike Golf's Ace-low scoring deck — this is what actually wins tricks.
export const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export interface Card {
  suit: Suit;
  rank: Rank;
}

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export type BotPersonalityId = 'gus' | 'mabel';

/** A bid of 'nil' means "I'll take zero tricks" — a separate, high-risk/high-reward wager
 * scored independently of the group's regular bid (see scoring.ts). Disabled entirely under
 * the simplifiedScoring house rule. */
export type Bid = number | 'nil';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  personality?: BotPersonalityId;
  hand: Card[];
  /** This hand's bid — null until they've bid. Reset to null at the start of every hand. */
  bid: Bid | null;
  /** Tricks won so far this hand — resets to 0 at the start of every hand. */
  tricksWon: number;
}

/** Unifies Cutthroat (one player per group) and Partners (two players per group) scoring
 * under one code path — bidding totals, trick credit, bag accumulation, and the win check all
 * just operate on whichever groups exist, never on individual players directly. */
export interface ScoringGroup {
  id: string;
  playerIds: string[];
  /** Running total across the whole match. */
  score: number;
  /** Bags accumulated so far, 0-9 — wraps back down by 10 (with a -100 penalty) every time it
   * would reach 10. See scoring.ts's applyBags(). */
  bags: number;
  /** One entry appended per completed hand (index 0 = hand 1) — this group's score DELTA that
   * hand, not the running total; the scorecard sums these. */
  handScores: number[];
}

export type GamePhase = 'bidding' | 'playing' | 'handOver' | 'matchOver';

export interface TrickCard {
  playerId: string;
  card: Card;
}

/** Snapshot taken the instant a hand ends, before the next hand's dealSpadesHand overwrites
 * everyone's hand — this is what the hand-summary screen renders while play is paused waiting
 * for humans to ready up (see `readyPlayerIds`, same gate as the Mexican Train/Golf sibling
 * projects). */
export interface HandSummary {
  handNumber: number;
  isFinalHand: boolean;
  players: Array<{ playerId: string; bid: Bid; tricksWon: number }>;
  groups: Array<{ groupId: string; handScore: number; bagsAdded: number; total: number }>;
}

/** Structured events emitted by the engine as it plays — the seam commentary/sound cues hook
 * into. */
export type GameEvent =
  | { type: 'matchStarted'; playerOrder: string[] }
  | { type: 'handStarted'; handNumber: number; dealerSeat: number }
  | { type: 'bidPlaced'; by: string; bid: Bid }
  | { type: 'cardPlayed'; by: string; card: Card; trickComplete: boolean }
  | { type: 'spadesBroken'; by: string }
  | { type: 'trickWon'; by: string; cards: TrickCard[] }
  | {
      type: 'handScored';
      handNumber: number;
      groups: Array<{ groupId: string; handScore: number; bagsAdded: number; total: number }>;
    }
  | { type: 'playerReady'; by: string }
  | { type: 'matchOver'; winnerGroupId: string | null; winnerIds: string[]; isDraw: boolean };

/** Optional house rules, fixed for the whole match (chosen at setup, before hand 1 is dealt)
 * — not secret, so it's fine to expose in PublicGameState too. */
export interface MatchRules {
  /** Only meaningful (and only ever true) at exactly 4 players: pairs seats 0+2 against seats
   * 1+3 and bids/scores as two teams instead of four individuals. Forced false at 2 or 3
   * players — see createMatch. */
  partnersMode: boolean;
  /** Off (false) by default = full standard rules (Nil bids, bag penalty). On = no Nil
   * option and no bag penalty; still a straightforward bid-and-make-it game, just without the
   * two riskier, more advanced wrinkles. */
  simplifiedScoring: boolean;
}

export const DEFAULT_RULES: MatchRules = { partnersMode: false, simplifiedScoring: false };

export const TARGET_SCORE = 500;
export const NIL_BONUS = 100;
export const BAG_PENALTY_THRESHOLD = 10;
export const BAG_PENALTY = 100;

/** Standard 52-card deck dealt evenly per player count. 4p is the real game (13 each). 3p
 * removes the 2♣ so 51 cards splits evenly (17 each) — the single most common convention for
 * 3-handed Spades. 2p deals 13 each and leaves the other 26 face-down, unused, for the hand —
 * simplest "Cutthroat for two" without a dummy-hand mechanic. */
export const HAND_SIZE_BY_PLAYER_COUNT: Record<number, number> = {
  2: 13,
  3: 17,
  4: 13,
};

export interface GameState {
  players: PlayerState[];
  rules: MatchRules;
  /** Grouped scoring units — see ScoringGroup. Fixed for the whole match once createMatch
   * decides Partners vs Cutthroat. */
  groups: ScoringGroup[];
  /** Cards dealt to nobody this hand (the unused half of the deck in 2-player Cutthroat, or
   * the discarded 2♣ in 3-player). Purely informational/unused during play. */
  kitty: Card[];
  trick: TrickCard[];
  /** Suit the current trick was led in — null before the first card of a trick is played. */
  ledSuit: Suit | null;
  /** Seat that led the current trick — whoever wins it leads the next one. */
  trickLeaderSeat: number;
  actingSeat: number;
  /** True once any spade has been played to any trick this hand — until then, spades can't be
   * led (unless the leader's hand is nothing but spades). */
  spadesBroken: boolean;
  phase: GamePhase;
  handNumber: number;
  /** Rotates left each hand; that seat's left-hand neighbor bids and leads first. */
  dealerSeat: number;
  log: GameEvent[];
  /** Set once phase is 'matchOver'. A single group id, or null on an exact-score draw (rare,
   * but two groups CAN legitimately land on the same total). */
  matchWinnerGroupId: string | null;
  /** Every player id belonging to the winning group — a solo winner in Cutthroat, or both
   * partners in Partners mode. Empty on a draw. */
  matchWinnerIds: string[];
  /** Populated only while `phase === 'handOver'` — cleared again once play resumes. */
  handSummary: HandSummary | null;
  /** Player ids who've clicked "next hand" during the current hand-over pause. Bot seats are
   * added automatically the moment the hand ends — see gameEngine.ts's resolveHand. */
  readyPlayerIds: string[];
}

export interface EngineConfig {
  playerConfigs: Array<{ id: string; name: string; isBot: boolean; personality?: BotPersonalityId }>;
  /** Optional house rules for the whole match — defaults to DEFAULT_RULES if omitted.
   * `partnersMode` is silently forced to false unless there are exactly 4 players. */
  rules?: MatchRules;
  /** Optional seeded RNG for deterministic tests. */
  rng?: () => number;
}

export type BidAction = { type: 'bid'; value: Bid };
export type PlayCardAction = { type: 'playCard'; card: Card };
/** Sent by a human player from the hand-over summary screen. Legal only for that player's own
 * seat, only while `phase === 'handOver'`, and only once. */
export type ReadyForNextHandAction = { type: 'readyForNextHand' };

export type PlayerAction = BidAction | PlayCardAction | ReadyForNextHandAction;

export interface LegalActions {
  seatIndex: number;
  actions: PlayerAction[];
}
