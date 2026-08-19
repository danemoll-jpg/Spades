import {
  Bid,
  BotPersonalityId,
  Card,
  GamePhase,
  GameState,
  HandSummary,
  MatchRules,
  Suit,
  TrickCard,
} from './types.js';

export interface PublicPlayerView {
  id: string;
  name: string;
  isBot: boolean;
  personality?: BotPersonalityId;
  /** Only populated for the viewer's own seat — everyone else's cards are hidden until played
   * (see `handCount` for how many they're still holding). */
  hand?: Card[];
  handCount: number;
  bid: Bid | null;
  tricksWon: number;
}

export interface PublicScoringGroup {
  id: string;
  playerIds: string[];
  score: number;
  bags: number;
}

export interface PublicGameState {
  players: PublicPlayerView[];
  rules: MatchRules;
  groups: PublicScoringGroup[];
  /** How many cards are sitting unused in the kitty (see HAND_SIZE_BY_PLAYER_COUNT) — never
   * anyone's to see the contents of, just a count for curiosity. */
  kittyCount: number;
  trick: TrickCard[];
  ledSuit: Suit | null;
  trickLeaderSeat: number;
  actingSeat: number;
  spadesBroken: boolean;
  phase: GamePhase;
  handNumber: number;
  dealerSeat: number;
  matchWinnerGroupId: string | null;
  matchWinnerIds: string[];
  handSummary: HandSummary | null;
  readyPlayerIds: string[];
  /** Which seat this view was built for. -1 if the viewer isn't seated (spectator). */
  viewerSeatIndex: number;
}

/** Builds the view of `state` that `viewerId` is allowed to see. */
export function redactState(state: GameState, viewerId: string): PublicGameState {
  const viewerSeatIndex = state.players.findIndex((p) => p.id === viewerId);

  return {
    players: state.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      personality: p.personality,
      hand: i === viewerSeatIndex ? p.hand : undefined,
      handCount: p.hand.length,
      bid: p.bid,
      tricksWon: p.tricksWon,
    })),
    rules: state.rules,
    groups: state.groups.map((g) => ({ id: g.id, playerIds: g.playerIds, score: g.score, bags: g.bags })),
    kittyCount: state.kitty.length,
    trick: state.trick,
    ledSuit: state.ledSuit,
    trickLeaderSeat: state.trickLeaderSeat,
    actingSeat: state.actingSeat,
    spadesBroken: state.spadesBroken,
    phase: state.phase,
    handNumber: state.handNumber,
    dealerSeat: state.dealerSeat,
    matchWinnerGroupId: state.matchWinnerGroupId,
    matchWinnerIds: state.matchWinnerIds,
    handSummary: state.handSummary,
    readyPlayerIds: state.readyPlayerIds,
    viewerSeatIndex,
  };
}
