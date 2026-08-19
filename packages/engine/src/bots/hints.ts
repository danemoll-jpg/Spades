import { cardLabel, GameState, PlayerAction } from '../types.js';
import { chooseBestAction, ReasonTag } from './strategy.js';

export interface MoveHint {
  action: PlayerAction;
  headline: string;
  rationale: string;
}

function describeAction(action: PlayerAction): string {
  switch (action.type) {
    case 'bid':
      return action.value === 'nil' ? 'Bid Nil' : `Bid ${action.value}`;
    case 'playCard':
      return `Play the ${cardLabel(action.card)}`;
    case 'readyForNextHand':
      return 'Ready up for the next hand';
  }
}

const RATIONALE: Record<ReasonTag, string> = {
  onlyOption: "It's your only legal move right now.",
  safeBid: 'Matches what your hand can realistically deliver — high spades and aces count, everything else is a stretch.',
  nilBid: 'Your hand is weak enough that betting on zero tricks beats a low regular bid.',
  winCheap: "You need (or can afford) the trick, and this is the cheapest card that takes it.",
  duckLow: "You bid Nil — staying under every trick is the whole game now.",
  discardSafe: "You can't win this trick affordably, so shed a card you don't need instead.",
};

/** Suggests the best move for `seatIndex` using the same heuristic the bots use, in plain
 * English — this is the "What should I play?" button's whole implementation, so a hint can
 * never suggest something illegal and a bot can never cheat by seeing more than this. */
export function getHint(state: GameState, seatIndex: number): MoveHint | null {
  const best = chooseBestAction(state, seatIndex);
  if (!best) return null;
  return {
    action: best.action,
    headline: describeAction(best.action),
    rationale: RATIONALE[best.reason],
  };
}
