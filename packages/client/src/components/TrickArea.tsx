import { PublicGameState } from '@spades/engine';
import { TrickReveal } from '../hooks/useOnlineRoom';
import { Card } from './Card';

interface TrickAreaProps {
  state: PublicGameState;
  avatarFor: (playerId: string) => string;
  /** A trick that just finished, held here for a beat before the area goes back to showing
   * `state.trick` live — see TrickReveal (useOnlineRoom.ts) for why this exists: the engine
   * resolves and clears a completed trick in one atomic step, so without this the 4th card
   * lands and the area empties in the very same render. */
  revealedTrick: TrickReveal | null;
}

/** The current trick in progress — one card per player who's played so far this trick, each
 * labeled with who played it. While `revealedTrick` is set, shows the trick that just finished
 * (with the winner marked) instead of the live (already-cleared) state. */
export function TrickArea({ state, avatarFor, revealedTrick }: TrickAreaProps) {
  if (!revealedTrick && state.phase !== 'playing' && state.trick.length === 0) return null;

  const cards = revealedTrick ? revealedTrick.cards : state.trick;

  return (
    <div className={revealedTrick ? 'trick-area trick-area--reveal' : 'trick-area'}>
      {cards.length === 0 ? (
        <div className="trick-area__empty">
          {state.spadesBroken ? 'Spades are broken.' : 'Spades not broken yet.'}
        </div>
      ) : (
        cards.map(({ playerId, card }) => {
          const player = state.players.find((p) => p.id === playerId);
          const wonThisCard = revealedTrick?.winnerId === playerId;
          return (
            <div key={playerId} className="trick-area__card">
              <span className="trick-area__played-by">
                {avatarFor(playerId)} {player?.name ?? playerId}
                {wonThisCard && <span className="trick-area__winner-badge">Won</span>}
              </span>
              <Card card={card} size="md" />
            </div>
          );
        })
      )}
    </div>
  );
}
