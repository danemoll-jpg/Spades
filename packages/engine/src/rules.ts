import { Card, cardsEqual, GameState, HAND_SIZE_BY_PLAYER_COUNT, PlayerAction } from './types.js';

export function nextSeat(playerCount: number, from: number): number {
  return (from + 1) % playerCount;
}

/** How many cards everyone was dealt this match — also doubles as the max legal bid (you
 * can't take more tricks than exist in the hand). */
export function handSize(state: GameState): number {
  return HAND_SIZE_BY_PLAYER_COUNT[state.players.length] ?? 13;
}

/** Every card in `seatIndex`'s hand that's legal to play right now: must follow the led suit
 * if able; leading a fresh trick can't be spades until they're broken, unless spades are all
 * that's left in hand. */
export function legalCardsForSeat(state: GameState, seatIndex: number): Card[] {
  const hand = state.players[seatIndex].hand;
  if (state.trick.length === 0) {
    if (state.spadesBroken) return hand;
    const nonSpades = hand.filter((c) => c.suit !== 'S');
    return nonSpades.length > 0 ? nonSpades : hand;
  }
  const followable = hand.filter((c) => c.suit === state.ledSuit);
  return followable.length > 0 ? followable : hand;
}

/** Computes the legal actions for whichever seat is currently allowed to act — bidding in
 * turn order, playing a card in turn order, or (not turn-based) readying up once the hand's
 * over. Always well-defined: there's never a dead end with zero legal moves for the seat
 * that's actually supposed to act. */
export function getLegalActions(state: GameState, seatIndex: number): PlayerAction[] {
  if (state.phase === 'handOver') {
    // Not turn-based — every human player independently has a legal "ready" action (once)
    // regardless of whose turn it was when the hand ended.
    const player = state.players[seatIndex];
    if (!player || player.isBot || state.readyPlayerIds.includes(player.id)) return [];
    return [{ type: 'readyForNextHand' }];
  }
  if (state.phase !== 'bidding' && state.phase !== 'playing') return [];
  if (state.actingSeat !== seatIndex) return [];

  if (state.phase === 'bidding') {
    const max = handSize(state);
    const actions: PlayerAction[] = [];
    for (let value = 0; value <= max; value++) actions.push({ type: 'bid', value });
    if (!state.rules.simplifiedScoring) actions.push({ type: 'bid', value: 'nil' });
    return actions;
  }

  return legalCardsForSeat(state, seatIndex).map((card) => ({ type: 'playCard', card }));
}

export function isActionLegal(state: GameState, seatIndex: number, action: PlayerAction): boolean {
  const legal = getLegalActions(state, seatIndex);
  return legal.some((a) => {
    if (a.type !== action.type) return false;
    if (a.type === 'bid' && action.type === 'bid') return a.value === action.value;
    if (a.type === 'playCard' && action.type === 'playCard') return cardsEqual(a.card, action.card);
    return true;
  });
}
