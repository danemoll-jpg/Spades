import { PublicGameState } from '@spades/engine';
import { Card } from './Card';

interface TrickAreaProps {
  state: PublicGameState;
  avatarFor: (playerId: string) => string;
}

/** The current trick in progress — one card per player who's played so far this trick, each
 * labeled with who played it. The winning 4th (or 3rd/2nd, at smaller tables) card resolves
 * the trick and clears it in the very same engine step, so this area is never seen holding a
 * genuinely full trick — it always empties back to nothing right as the last card lands. */
export function TrickArea({ state, avatarFor }: TrickAreaProps) {
  if (state.phase !== 'playing' && state.trick.length === 0) return null;

  return (
    <div className="trick-area">
      {state.trick.length === 0 ? (
        <div className="trick-area__empty">
          {state.spadesBroken ? 'Spades are broken.' : 'Spades not broken yet.'}
        </div>
      ) : (
        state.trick.map(({ playerId, card }) => {
          const player = state.players.find((p) => p.id === playerId);
          return (
            <div key={playerId} className="trick-area__card">
              <span className="trick-area__played-by">
                {avatarFor(playerId)} {player?.name ?? playerId}
              </span>
              <Card card={card} size="md" />
            </div>
          );
        })
      )}
    </div>
  );
}
