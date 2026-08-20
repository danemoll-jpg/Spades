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
