import { Card as CardType, cardId, PublicGameState } from '@spades/engine';
import { Card } from './Card';
import { isCardPlayable, isMyTurn } from '../lib/legality';

interface HandTrayProps {
  hand: CardType[];
  state: PublicGameState;
  selectedCardId: string | null;
  onSelect: (id: string) => void;
}

/** The viewer's own hand — a horizontally scrollable row of cards. Cards that can't legally be
 * played right now (didn't follow suit, spades not broken yet, or it's simply not your turn)
 * are dimmed but still shown, so nothing ever seems to vanish from your hand mid-game. */
export function HandTray({ hand, state, selectedCardId, onSelect }: HandTrayProps) {
  const myTurn = isMyTurn(state) && state.phase === 'playing';

  return (
    <div className="hand-tray">
      <div className="hand-tray__scroll">
        {hand.map((card) => {
          const id = cardId(card);
          const playable = myTurn && isCardPlayable(state, card);
          return (
            <Card
              key={id}
              card={card}
              playable={playable}
              selected={selectedCardId === id}
              faded={myTurn && !playable}
              size="md"
              onClick={playable ? () => onSelect(id) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
