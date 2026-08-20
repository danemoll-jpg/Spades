import { describe, expect, it } from 'vitest';
import { chooseBestAction, createMatch, EngineConfig, GameState, scoreActions } from '../src/index.js';

function makeConfig(playerCount: number): EngineConfig['playerConfigs'] {
  return Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, isBot: true }));
}

/** Builds a valid base state (via createMatch, so every other field stays well-formed) then
 * overwrites just what a specific card-play scenario needs to test. */
function playingState(overrides: Partial<GameState>): GameState {
  const base = createMatch({ playerConfigs: makeConfig(4) });
  return { ...base, phase: 'playing', spadesBroken: true, trickLeaderSeat: 0, ...overrides };
}

/** Same as playingState, but a 4-player Partners table (seats 0+2 vs 1+3 — see buildGroups),
 * for testing partner-aware trick-play decisions. */
function partnersPlayingState(simplifiedScoring: boolean, overrides: Partial<GameState>): GameState {
  const base = createMatch({ playerConfigs: makeConfig(4), rules: { partnersMode: true, simplifiedScoring } });
  return { ...base, phase: 'playing', spadesBroken: true, trickLeaderSeat: 0, ...overrides };
}

describe('scoreCardPlays: ducking a trick you can\'t win', () => {
  it('prefers the LOWEST losing spade over a higher one when someone already played the Ace', () => {
    // The exact bug report: Ace of Spades already played, bot holds a King of Spades AND a
    // low spade — it should never burn the King here, since it can't win either way and a
    // held King only gets MORE likely to win a later trick as higher spades get used up.
    const state = playingState({
      trick: [{ playerId: 'p0', card: { suit: 'S', rank: 'A' } }],
      ledSuit: 'S',
      actingSeat: 1,
      players: createMatch({ playerConfigs: makeConfig(4) }).players.map((p, i) =>
        i === 1
          ? { ...p, bid: 2, tricksWon: 0, hand: [{ suit: 'S', rank: 'K' }, { suit: 'S', rank: '3' }, { suit: 'H', rank: '7' }] }
          : { ...p, bid: 3 },
      ),
    });

    const best = chooseBestAction(state, 1)!;
    expect(best.action).toEqual({ type: 'playCard', card: { suit: 'S', rank: '3' } });
    expect(best.reason).toBe('discardSafe');

    // And the full ranking should have every legal spade ordered low-to-high, not the reverse.
    const scored = scoreActions(state, 1).filter((s) => s.action.type === 'playCard');
    const spadeRanksInOrder = scored
      .map((s) => (s.action as { type: 'playCard'; card: { suit: string; rank: string } }).card)
      .filter((c) => c.suit === 'S')
      .map((c) => c.rank);
    expect(spadeRanksInOrder).toEqual(['3', 'K']);
  });

  it('still prefers winning the trick outright over ducking, when a winning card is available', () => {
    const state = playingState({
      trick: [{ playerId: 'p0', card: { suit: 'S', rank: '5' } }],
      ledSuit: 'S',
      actingSeat: 1,
      players: createMatch({ playerConfigs: makeConfig(4) }).players.map((p, i) =>
        i === 1
          ? { ...p, bid: 2, tricksWon: 0, hand: [{ suit: 'S', rank: 'K' }, { suit: 'S', rank: '3' }] }
          : { ...p, bid: 3 },
      ),
    });

    const best = chooseBestAction(state, 1)!;
    expect(best.action).toEqual({ type: 'playCard', card: { suit: 'S', rank: 'K' } });
    expect(best.reason).toBe('winCheap');
  });
});

describe('scoreCardPlays: not stealing a trick your partner already has', () => {
  // In every case below, p0 (seat 0) leads a diamond that's currently winning the trick, p1
  // and p3 (the opposing team) have already followed with lower diamonds, and it's p2's turn —
  // p0's own partner (seats 0+2 vs 1+3). p2 holds both a Diamond Ace (would overtake p0) and a
  // low losing diamond (stays under p0 and just ducks).
  function partnerWinningState(simplifiedScoring: boolean, opts: { bidsMet: boolean; p2IsLast: boolean }): GameState {
    const trick = opts.p2IsLast
      ? [
          { playerId: 'p0', card: { suit: 'D' as const, rank: '9' as const } },
          { playerId: 'p1', card: { suit: 'D' as const, rank: '2' as const } },
          { playerId: 'p3', card: { suit: 'D' as const, rank: '3' as const } },
        ]
      : [{ playerId: 'p0', card: { suit: 'D' as const, rank: '9' as const } }];

    return partnersPlayingState(simplifiedScoring, {
      trick,
      ledSuit: 'D',
      actingSeat: 2,
      players: createMatch({ playerConfigs: makeConfig(4) }).players.map((p, i) => {
        if (i === 2) {
          return { ...p, bid: 2, tricksWon: opts.bidsMet ? 2 : 0, hand: [{ suit: 'D', rank: 'A' }, { suit: 'D', rank: '4' }] };
        }
        if (i === 0) return { ...p, bid: 2, tricksWon: opts.bidsMet ? 2 : 0 };
        return { ...p, bid: 3 };
      }),
    });
  }

  it('ducks under a winning partner when the team already met its combined bid (standard rules)', () => {
    const state = partnerWinningState(false, { bidsMet: true, p2IsLast: false });
    const best = chooseBestAction(state, 2)!;
    // The team's bid is already made, so an extra trick is just a bag — no reason to burn the
    // Ace taking a trick p0 already has, especially with two players still to act behind p2
    // who might (or might not) beat it; either way it costs the team nothing to let it ride.
    expect(best.action).toEqual({ type: 'playCard', card: { suit: 'D', rank: '4' } });
    expect(best.reason).toBe('discardSafe');
  });

  it('overtakes a winning partner to protect a trick the team still needs (standard rules)', () => {
    const state = partnerWinningState(false, { bidsMet: false, p2IsLast: false });
    const best = chooseBestAction(state, 2)!;
    // The combined bid isn't met yet and there are still two players left to act who could
    // beat p0's 9 — worth spending the Ace to make sure the team actually gets this trick.
    expect(best.action).toEqual({ type: 'playCard', card: { suit: 'D', rank: 'A' } });
    expect(best.reason).toBe('winCheap');
  });

  it('overtakes a winning partner defensively even with the bid met, under simplified scoring', () => {
    const state = partnerWinningState(true, { bidsMet: true, p2IsLast: false });
    const best = chooseBestAction(state, 2)!;
    // Bags never cost anything this match, so there's no downside to playing it safe and
    // protecting the trick from whoever's still to act, even though the team's bid is already
    // in hand.
    expect(best.action).toEqual({ type: 'playCard', card: { suit: 'D', rank: 'A' } });
    expect(best.reason).toBe('winCheap');
  });

  it('never bothers overtaking a partner who is already last-to-act-safe, even under simplified scoring', () => {
    const state = partnerWinningState(true, { bidsMet: false, p2IsLast: true });
    const best = chooseBestAction(state, 2)!;
    // Nobody's left to act after p2 this trick, so p0's 9 is already guaranteed to win — there
    // is nothing left to defend against, bag penalty or not.
    expect(best.action).toEqual({ type: 'playCard', card: { suit: 'D', rank: '4' } });
    expect(best.reason).toBe('discardSafe');
  });
});
