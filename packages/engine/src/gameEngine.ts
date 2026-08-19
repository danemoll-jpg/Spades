import { buildDeck, shuffle } from './deck.js';
import { getLegalActions, handSize, isActionLegal, nextSeat } from './rules.js';
import { scoreGroupHand, trickWinnerPlayerId } from './scoring.js';
import {
  cardsEqual,
  DEFAULT_RULES,
  EngineConfig,
  GameState,
  HandSummary,
  LegalActions,
  PlayerAction,
  PlayerState,
  ScoringGroup,
  TARGET_SCORE,
} from './types.js';

/** Builds the two scoring groups for a match: Partners (seats 0+2 vs 1+3) only when there are
 * exactly 4 players AND the house rule is on, otherwise one Cutthroat group per player — see
 * ScoringGroup's doc comment for why everything downstream (bidding totals, trick credit, the
 * win check) only ever needs to know about groups, never the mode itself. */
function buildGroups(players: PlayerState[], partnersMode: boolean): ScoringGroup[] {
  if (partnersMode && players.length === 4) {
    return [
      { id: 'team0', playerIds: [players[0].id, players[2].id], score: 0, bags: 0, handScores: [] },
      { id: 'team1', playerIds: [players[1].id, players[3].id], score: 0, bags: 0, handScores: [] },
    ];
  }
  return players.map((p) => ({ id: p.id, playerIds: [p.id], score: 0, bags: 0, handScores: [] }));
}

/** Deals a fresh hand in place: shuffles a fresh deck sized for the table (52 cards at 2 or 4
 * players, 51 — the 2♣ removed — at 3, so it splits evenly), hands everyone `handSize(state)`
 * cards, sets whatever's left over aside as an unused kitty, and puts the seat left of the
 * dealer on the clock to bid first. */
function dealHand(state: GameState, handNumber: number, dealerSeat: number, rng: () => number): void {
  let pool = buildDeck();
  if (state.players.length === 3) {
    pool = pool.filter((c) => !(c.suit === 'C' && c.rank === '2'));
  }
  const shuffled = shuffle(pool, rng);
  const size = handSize(state);

  let idx = 0;
  for (const p of state.players) {
    p.hand = shuffled.slice(idx, idx + size);
    idx += size;
    p.bid = null;
    p.tricksWon = 0;
  }
  state.kitty = shuffled.slice(idx);
  state.trick = [];
  state.ledSuit = null;
  state.spadesBroken = false;
  state.phase = 'bidding';
  state.handNumber = handNumber;
  state.dealerSeat = dealerSeat;
  const leader = nextSeat(state.players.length, dealerSeat);
  state.actingSeat = leader;
  state.trickLeaderSeat = leader;
  state.handSummary = null;
  state.readyPlayerIds = [];

  state.log.push({ type: 'handStarted', handNumber, dealerSeat });
}

export function createMatch(config: EngineConfig): GameState {
  const rng = config.rng ?? Math.random;

  const players: PlayerState[] = config.playerConfigs.map((pc) => ({
    id: pc.id,
    name: pc.name,
    isBot: pc.isBot,
    personality: pc.personality,
    hand: [],
    bid: null,
    tricksWon: 0,
  }));

  const rulesIn = config.rules ?? DEFAULT_RULES;
  // Partners is only ever meaningful at exactly 4 players — silently forced off otherwise
  // rather than treated as an error, since the caller may just be reusing the same rules
  // object across a table that later loses a seat.
  const partnersMode = rulesIn.partnersMode && players.length === 4;
  const rules = { ...rulesIn, partnersMode };
  const groups = buildGroups(players, partnersMode);

  const state: GameState = {
    players,
    rules,
    groups,
    kitty: [],
    trick: [],
    ledSuit: null,
    trickLeaderSeat: 0,
    actingSeat: 0,
    spadesBroken: false,
    phase: 'bidding',
    handNumber: 0,
    dealerSeat: 0,
    log: [],
    matchWinnerGroupId: null,
    matchWinnerIds: [],
    handSummary: null,
    readyPlayerIds: [],
  };

  state.log.push({ type: 'matchStarted', playerOrder: players.map((p) => p.id) });
  dealHand(state, 1, 0, rng);
  return state;
}

export function getCurrentLegalActions(state: GameState): LegalActions | null {
  if (state.phase === 'matchOver' || state.phase === 'handOver') return null;
  return { seatIndex: state.actingSeat, actions: getLegalActions(state, state.actingSeat) };
}

/** Scores every group's hand and parks the match in 'handOver' with a snapshot for the
 * summary screen — nothing is dealt and the match is never marked over from here directly.
 * Bot seats are auto-readied immediately (they never make anyone wait); if that alone clears
 * every human (an all-bot table, or no humans left), the hand-over pause collapses instantly
 * via `maybeAdvanceFromHandOver`. */
function resolveHand(state: GameState, rng: () => number): void {
  const groupResults = state.groups.map((g) =>
    scoreGroupHand(
      g,
      state.players.filter((p) => g.playerIds.includes(p.id)),
      state.rules.simplifiedScoring,
    ),
  );
  state.log.push({ type: 'handScored', handNumber: state.handNumber, groups: groupResults });

  const isFinalHand = state.groups.some((g) => g.score >= TARGET_SCORE);
  const summary: HandSummary = {
    handNumber: state.handNumber,
    isFinalHand,
    players: state.players.map((p) => ({ playerId: p.id, bid: p.bid!, tricksWon: p.tricksWon })),
    groups: groupResults,
  };
  state.handSummary = summary;
  state.phase = 'handOver';
  state.readyPlayerIds = state.players.filter((p) => p.isBot).map((p) => p.id);
  maybeAdvanceFromHandOver(state, rng);
}

/** Once every human player has readied up (or there were none to begin with), either deals
 * the next hand or, if any group just crossed the target score, ends the match. A no-op while
 * any human is still on the hand-over summary screen. */
function maybeAdvanceFromHandOver(state: GameState, rng: () => number): void {
  if (state.phase !== 'handOver') return;
  const allHumansReady = state.players.filter((p) => !p.isBot).every((p) => state.readyPlayerIds.includes(p.id));
  if (!allHumansReady) return;

  const summary = state.handSummary!;
  state.handSummary = null;
  state.readyPlayerIds = [];

  if (summary.isFinalHand) {
    // The match can only ever end the instant a group first crosses the target — nobody could
    // already be sitting above it from an earlier hand, since that hand would have ended the
    // match already. So the winner is simply whoever has the single highest total now.
    const maxScore = Math.max(...state.groups.map((g) => g.score));
    const winners = state.groups.filter((g) => g.score === maxScore);
    state.phase = 'matchOver';
    if (winners.length === 1) {
      state.matchWinnerGroupId = winners[0].id;
      state.matchWinnerIds = winners[0].playerIds;
      state.log.push({ type: 'matchOver', winnerGroupId: winners[0].id, winnerIds: winners[0].playerIds, isDraw: false });
    } else {
      state.matchWinnerGroupId = null;
      state.matchWinnerIds = [];
      state.log.push({ type: 'matchOver', winnerGroupId: null, winnerIds: [], isDraw: true });
    }
    return;
  }

  dealHand(state, summary.handNumber + 1, nextSeat(state.players.length, state.dealerSeat), rng);
}

export function applyAction(
  state: GameState,
  seatIndex: number,
  action: PlayerAction,
  rng: () => number = Math.random,
): GameState {
  if (!isActionLegal(state, seatIndex, action)) {
    throw new Error(`Illegal action ${JSON.stringify(action)} for seat ${seatIndex} in phase ${state.phase}`);
  }
  const next: GameState = structuredClone(state);
  const player = next.players[seatIndex];

  switch (action.type) {
    case 'bid': {
      player.bid = action.value;
      next.log.push({ type: 'bidPlaced', by: player.id, bid: action.value });

      if (next.players.every((p) => p.bid !== null)) {
        next.phase = 'playing';
        const leader = nextSeat(next.players.length, next.dealerSeat);
        next.actingSeat = leader;
        next.trickLeaderSeat = leader;
      } else {
        next.actingSeat = nextSeat(next.players.length, seatIndex);
      }
      break;
    }

    case 'playCard': {
      player.hand = player.hand.filter((c) => !cardsEqual(c, action.card));
      if (next.trick.length === 0) next.ledSuit = action.card.suit;
      next.trick.push({ playerId: player.id, card: action.card });

      if (action.card.suit === 'S' && !next.spadesBroken) {
        next.spadesBroken = true;
        next.log.push({ type: 'spadesBroken', by: player.id });
      }

      const trickComplete = next.trick.length === next.players.length;
      next.log.push({ type: 'cardPlayed', by: player.id, card: action.card, trickComplete });

      if (!trickComplete) {
        next.actingSeat = nextSeat(next.players.length, seatIndex);
        break;
      }

      const winnerId = trickWinnerPlayerId(next.trick, next.ledSuit!);
      const winnerSeat = next.players.findIndex((p) => p.id === winnerId);
      next.players[winnerSeat].tricksWon += 1;
      next.log.push({ type: 'trickWon', by: winnerId, cards: next.trick });
      next.trick = [];
      next.ledSuit = null;
      next.trickLeaderSeat = winnerSeat;
      next.actingSeat = winnerSeat;

      // Every hand shrinks in lockstep (one card per player per trick), so checking any one
      // player's hand is enough to know the whole 13/17-trick hand is done.
      if (next.players[winnerSeat].hand.length === 0) {
        resolveHand(next, rng);
      }
      break;
    }

    case 'readyForNextHand': {
      next.readyPlayerIds = [...next.readyPlayerIds, player.id];
      next.log.push({ type: 'playerReady', by: player.id });
      maybeAdvanceFromHandOver(next, rng);
      break;
    }
  }

  return next;
}
