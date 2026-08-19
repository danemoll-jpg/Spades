// Lightweight client-side "can I do this right now?" checks, used only for
// highlighting/disabling controls in the UI. The engine is still the sole source of truth —
// applyAction re-validates every action via @spades/engine's rules — so nothing here needs to
// be exhaustively airtight, just a good-faith mirror of the real rules.
import { Card, cardsEqual, PublicGameState } from '@spades/engine';

export function isMyTurn(state: PublicGameState): boolean {
  return (state.phase === 'bidding' || state.phase === 'playing') && state.actingSeat === state.viewerSeatIndex;
}

export function canBid(state: PublicGameState): boolean {
  return isMyTurn(state) && state.phase === 'bidding';
}

/** Which of the viewer's own hand cards are legal to play right now — mirrors the engine's
 * legalCardsForSeat exactly (must follow suit if able; can't lead spades until they're broken
 * unless the hand is nothing but spades). */
export function playableCards(state: PublicGameState): Card[] {
  if (!isMyTurn(state) || state.phase !== 'playing') return [];
  const hand = state.players[state.viewerSeatIndex]?.hand ?? [];
  if (state.trick.length === 0) {
    if (state.spadesBroken) return hand;
    const nonSpades = hand.filter((c) => c.suit !== 'S');
    return nonSpades.length > 0 ? nonSpades : hand;
  }
  const followable = hand.filter((c) => c.suit === state.ledSuit);
  return followable.length > 0 ? followable : hand;
}

export function isCardPlayable(state: PublicGameState, card: Card): boolean {
  return playableCards(state).some((c) => cardsEqual(c, card));
}
