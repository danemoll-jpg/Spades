import { describe, expect, it } from 'vitest';
import {
  applyAction,
  chooseBestAction,
  createMatch,
  EngineConfig,
  getCurrentLegalActions,
  getLegalActions,
  GameState,
  TARGET_SCORE,
} from '../src/index.js';

/** Deterministic seeded RNG (mulberry32) so simulated games are reproducible. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function totalCardsInPlay(state: GameState): number {
  const inHands = state.players.reduce((sum, p) => sum + p.hand.length, 0);
  const inTrick = state.trick.length;
  // A won trick's cards aren't kept anywhere (no discard pile in Spades — they're just
  // spent), so conservation has to account for them via tricksWon rather than a pile to sum.
  const spentOnWonTricks = state.players.reduce((sum, p) => sum + p.tricksWon, 0) * state.players.length;
  return state.kitty.length + inHands + inTrick + spentOnWonTricks;
}

function makeConfig(playerCount: number): EngineConfig['playerConfigs'] {
  return Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    isBot: true,
  }));
}

/** Drives `state` with the shared bot heuristic (regardless of a seat's isBot flag — the
 * heuristic doesn't care) until the match ends OR it parks in 'handOver' waiting on a human.
 * Bounded step count guards against an infinite loop actually hanging the test suite if a
 * future change breaks turn advancement. */
function driveUntil(
  state: GameState,
  rng: () => number,
  stopPhases: GameState['phase'][],
  maxSteps = 20000,
): GameState {
  let current = state;
  let steps = 0;
  while (!stopPhases.includes(current.phase) && steps < maxSteps) {
    const legal = getCurrentLegalActions(current)!;
    const decision = chooseBestAction(current, legal.seatIndex)!;
    current = applyAction(current, legal.seatIndex, decision.action, rng);
    steps += 1;
  }
  if (steps >= maxSteps) throw new Error(`Match did not reach ${stopPhases.join('/')} within ${maxSteps} steps`);
  return current;
}

/** Plays a full match with every seat driven by the shared bot heuristic (an all-bot table
 * always collapses straight through every hand-over pause — see the readiness-gate tests
 * below for the human-blocking behavior), asserting card conservation after every action. */
function playFullMatch(playerCount: number, seed: number, rules?: EngineConfig['rules']): GameState {
  const rng = seededRng(seed);
  const expectedCards = playerCount === 3 ? 51 : 52;
  let state = createMatch({ playerConfigs: makeConfig(playerCount), rules, rng });
  expect(totalCardsInPlay(state)).toBe(expectedCards);

  let steps = 0;
  const MAX_STEPS = 100000;
  while (state.phase !== 'matchOver') {
    const legal = getCurrentLegalActions(state);
    expect(legal).not.toBeNull();
    const decision = chooseBestAction(state, legal!.seatIndex);
    expect(decision).not.toBeNull();
    state = applyAction(state, legal!.seatIndex, decision!.action, rng);
    expect(totalCardsInPlay(state)).toBe(expectedCards);

    steps += 1;
    if (steps > MAX_STEPS) throw new Error(`Match did not terminate within ${MAX_STEPS} steps`);
  }
  return state;
}

describe('createMatch', () => {
  it('deals 13 cards per player at a 4-player table with an empty kitty', () => {
    const state = createMatch({ playerConfigs: makeConfig(4), rng: seededRng(1) });
    expect(state.handNumber).toBe(1);
    expect(state.phase).toBe('bidding');
    for (const p of state.players) expect(p.hand).toHaveLength(13);
    expect(state.kitty).toHaveLength(0);
    expect(totalCardsInPlay(state)).toBe(52);
  });

  it('deals 17 cards per player at a 3-player table (2♣ removed, no kitty)', () => {
    const state = createMatch({ playerConfigs: makeConfig(3), rng: seededRng(1) });
    for (const p of state.players) expect(p.hand).toHaveLength(17);
    expect(state.kitty).toHaveLength(0);
    expect(totalCardsInPlay(state)).toBe(51);
    const hasTwoClubs = state.players.some((p) => p.hand.some((c) => c.suit === 'C' && c.rank === '2'));
    expect(hasTwoClubs).toBe(false);
  });

  it('deals 13 cards per player at a 2-player table with a 26-card kitty', () => {
    const state = createMatch({ playerConfigs: makeConfig(2), rng: seededRng(1) });
    for (const p of state.players) expect(p.hand).toHaveLength(13);
    expect(state.kitty).toHaveLength(26);
    expect(totalCardsInPlay(state)).toBe(52);
  });

  it('forces partnersMode off unless there are exactly 4 players', () => {
    const state3 = createMatch({ playerConfigs: makeConfig(3), rules: { partnersMode: true, simplifiedScoring: false }, rng: seededRng(1) });
    expect(state3.rules.partnersMode).toBe(false);
    expect(state3.groups).toHaveLength(3);

    const state4 = createMatch({ playerConfigs: makeConfig(4), rules: { partnersMode: true, simplifiedScoring: false }, rng: seededRng(1) });
    expect(state4.rules.partnersMode).toBe(true);
    expect(state4.groups).toHaveLength(2);
    expect(state4.groups[0].playerIds).toEqual(['p0', 'p2']);
    expect(state4.groups[1].playerIds).toEqual(['p1', 'p3']);
  });

  it('starts bidding with the seat left of the dealer (seat 0)', () => {
    const state = createMatch({ playerConfigs: makeConfig(4), rng: seededRng(1) });
    expect(state.dealerSeat).toBe(0);
    expect(state.actingSeat).toBe(1);
  });
});

describe('bidding', () => {
  it('goes around once, then moves to the playing phase led by the seat left of the dealer', () => {
    let state = createMatch({ playerConfigs: makeConfig(4), rng: seededRng(2) });
    for (let i = 0; i < 4; i++) {
      expect(state.phase).toBe('bidding');
      const seat = state.actingSeat;
      state = applyAction(state, seat, { type: 'bid', value: 3 }, seededRng(2));
    }
    expect(state.phase).toBe('playing');
    expect(state.actingSeat).toBe(1);
    expect(state.trickLeaderSeat).toBe(1);
    for (const p of state.players) expect(p.bid).toBe(3);
  });

  it('offers Nil as a bid option by default, but not under simplifiedScoring', () => {
    const state = createMatch({ playerConfigs: makeConfig(4), rng: seededRng(3) });
    const legal = getLegalActions(state, state.actingSeat);
    expect(legal.some((a) => a.type === 'bid' && a.value === 'nil')).toBe(true);

    const simplified = createMatch({
      playerConfigs: makeConfig(4),
      rules: { partnersMode: false, simplifiedScoring: true },
      rng: seededRng(3),
    });
    const legalSimplified = getLegalActions(simplified, simplified.actingSeat);
    expect(legalSimplified.some((a) => a.type === 'bid' && a.value === 'nil')).toBe(false);
  });
});

describe('play legality', () => {
  it("can't lead spades before they're broken unless the hand is nothing but spades", () => {
    let state = createMatch({ playerConfigs: makeConfig(4), rng: seededRng(4) });
    for (let i = 0; i < 4; i++) {
      state = applyAction(state, state.actingSeat, { type: 'bid', value: 2 }, seededRng(4));
    }
    expect(state.phase).toBe('playing');
    expect(state.spadesBroken).toBe(false);

    const leader = state.actingSeat;
    const hand = state.players[leader].hand;
    const hasNonSpade = hand.some((c) => c.suit !== 'S');
    const legal = getLegalActions(state, leader);
    if (hasNonSpade) {
      expect(legal.every((a) => a.type === 'playCard' && a.card.suit !== 'S')).toBe(true);
    } else {
      // An all-spades hand is the one legal exception — it's allowed to lead spades.
      expect(legal.every((a) => a.type === 'playCard' && a.card.suit === 'S')).toBe(true);
    }
  });

  it('must follow suit when able', () => {
    const rng = seededRng(5);
    let state = createMatch({ playerConfigs: makeConfig(4), rng });
    for (let i = 0; i < 4; i++) state = applyAction(state, state.actingSeat, { type: 'bid', value: 2 }, rng);

    // Force a plain (non-spade) lead so the follow-suit case is actually exercised.
    const leader = state.actingSeat;
    const nonSpade = state.players[leader].hand.find((c) => c.suit !== 'S')!;
    state = applyAction(state, leader, { type: 'playCard', card: nonSpade }, rng);

    const follower = state.actingSeat;
    const followerHand = state.players[follower].hand;
    const canFollow = followerHand.some((c) => c.suit === state.ledSuit);
    const legal = getLegalActions(state, follower);
    if (canFollow) {
      expect(legal.every((a) => a.type === 'playCard' && a.card.suit === state.ledSuit)).toBe(true);
    } else {
      expect(legal).toHaveLength(followerHand.length);
    }
  });
});

describe('full simulated matches (Cutthroat)', () => {
  // A Spades match runs far more actions than the other games in the series (a hand is a
  // whole 13-17-trick play-through, not one tile/card) — full-match simulation is
  // correspondingly slower per test, so this sticks to 2 seeds per player count rather than
  // 3 to keep the suite's total runtime reasonable while still covering every player count.
  for (const playerCount of [2, 3, 4]) {
    for (const seed of [1, 2]) {
      it(`completes a ${playerCount}-player match (seed ${seed}) with conserved cards and a decided winner`, () => {
        const state = playFullMatch(playerCount, seed);
        expect(state.phase).toBe('matchOver');
        expect(state.groups).toHaveLength(playerCount);
        const maxScore = Math.max(...state.groups.map((g) => g.score));
        expect(maxScore).toBeGreaterThanOrEqual(TARGET_SCORE);
        if (state.matchWinnerGroupId) {
          const winner = state.groups.find((g) => g.id === state.matchWinnerGroupId)!;
          expect(winner.score).toBe(maxScore);
          expect(state.matchWinnerIds).toEqual(winner.playerIds);
        } else {
          expect(state.matchWinnerIds).toHaveLength(0);
        }
      });
    }
  }
});

describe('Partners mode', () => {
  for (const seed of [1, 2]) {
    it(`completes a 4-player Partners match (seed ${seed}) with two teams`, () => {
      const state = playFullMatch(4, seed, { partnersMode: true, simplifiedScoring: false });
      expect(state.phase).toBe('matchOver');
      expect(state.rules.partnersMode).toBe(true);
      expect(state.groups).toHaveLength(2);
      expect(state.groups[0].playerIds).toHaveLength(2);
      expect(state.groups[1].playerIds).toHaveLength(2);
    });
  }
});

describe('simplifiedScoring house rule', () => {
  it('never applies a bag penalty even after crossing 10 bags', () => {
    const state = playFullMatch(4, 7, { partnersMode: false, simplifiedScoring: true });
    expect(state.phase).toBe('matchOver');
    for (const g of state.groups) expect(g.bags).toBeGreaterThanOrEqual(0);
  });
});

/** Drives `state` until the hand in progress ends, i.e. until the engine parks in 'handOver'.
 * Used by the readiness-gate tests below, which need a human seat in the mix. */
function driveUntilHandOver(state: GameState, rng: () => number): GameState {
  return driveUntil(state, rng, ['handOver', 'matchOver']);
}

describe('hand-over readiness gate', () => {
  it('pauses in handOver with a summary, auto-readying bots but not the human', () => {
    const rng = seededRng(9);
    const playerConfigs: EngineConfig['playerConfigs'] = [
      { id: 'human', name: 'Human', isBot: false },
      { id: 'bot0', name: 'Bot', isBot: true },
      { id: 'bot1', name: 'Bot 2', isBot: true },
    ];
    const state = driveUntilHandOver(createMatch({ playerConfigs, rng }), rng);

    expect(state.phase).toBe('handOver');
    expect(getCurrentLegalActions(state)).toBeNull();
    expect(state.handSummary).not.toBeNull();
    expect(state.handSummary!.handNumber).toBe(1);
    expect(state.readyPlayerIds.sort()).toEqual(['bot0', 'bot1']);

    const humanSeat = state.players.findIndex((p) => p.id === 'human');
    expect(getLegalActions(state, humanSeat)).toEqual([{ type: 'readyForNextHand' }]);
  });

  it('deals hand 2 only once the human readies up', () => {
    const rng = seededRng(9);
    const playerConfigs: EngineConfig['playerConfigs'] = [
      { id: 'human', name: 'Human', isBot: false },
      { id: 'bot0', name: 'Bot', isBot: true },
      { id: 'bot1', name: 'Bot 2', isBot: true },
    ];
    const handOver = driveUntilHandOver(createMatch({ playerConfigs, rng }), rng);
    const humanSeat = handOver.players.findIndex((p) => p.id === 'human');

    const next = applyAction(handOver, humanSeat, { type: 'readyForNextHand' }, rng);
    expect(next.phase).toBe('bidding');
    expect(next.handNumber).toBe(2);
    expect(next.handSummary).toBeNull();
    expect(next.readyPlayerIds).toEqual([]);
    for (const g of next.groups) expect(g.handScores).toHaveLength(1);
  });

  it('rejects a bot seat sending readyForNextHand, and rejects a repeat from the same human', () => {
    const rng = seededRng(9);
    const playerConfigs: EngineConfig['playerConfigs'] = [
      { id: 'human1', name: 'Human 1', isBot: false },
      { id: 'human2', name: 'Human 2', isBot: false },
      { id: 'bot0', name: 'Bot', isBot: true },
    ];
    const handOver = driveUntilHandOver(createMatch({ playerConfigs, rng }), rng);
    expect(handOver.phase).toBe('handOver');

    const botSeat = handOver.players.findIndex((p) => p.id === 'bot0');
    expect(() => applyAction(handOver, botSeat, { type: 'readyForNextHand' }, rng)).toThrow();

    const human1Seat = handOver.players.findIndex((p) => p.id === 'human1');
    const afterFirst = applyAction(handOver, human1Seat, { type: 'readyForNextHand' }, rng);
    expect(afterFirst.phase).toBe('handOver');
    expect(() => applyAction(afterFirst, human1Seat, { type: 'readyForNextHand' }, rng)).toThrow();

    const human2Seat = afterFirst.players.findIndex((p) => p.id === 'human2');
    const afterSecond = applyAction(afterFirst, human2Seat, { type: 'readyForNextHand' }, rng);
    expect(afterSecond.phase).toBe('bidding');
    expect(afterSecond.handNumber).toBe(2);
  });
});
