import { Card as CardType, cardId, PublicGameState, RANK_VALUES, SUITS } from '@spades/engine';
import { Card } from './Card';
import { isCardPlayable, isMyTurn } from '../lib/legality';

interface HandTrayProps {
  hand: CardType[];
  state: PublicGameState;
  selectedCardId: string | null;
  onSelect: (id: string) => void;
}

/** Display order only — grouped by suit (engine's canonical S/H/D/C order, same grouping the
 * bots' own hand-strength heuristic uses), low to high within each suit. Purely cosmetic:
 * doesn't touch the engine's hand array or any game state, just how this one component lays
 * the cards out, so a hand doesn't jump around the screen turn to turn as cards are drawn or
 * played. */
function sortedForDisplay(hand: CardType[]): CardType[] {
  return [...hand].sort((a, b) => {
    const suitDiff = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    return suitDiff !== 0 ? suitDiff : RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
  });
}

/** The viewer's own hand — a horizontally scrollable row of cards. Cards that can't legally be
 * played right now (didn't follow suit, spades not broken yet, or it's simply not your turn)
 * are dimmed but still shown, so nothing ever seems to vanish from your hand mid-game. */
export function HandTray({ hand, state, selectedCardId, onSelect }: HandTrayProps) {
  const myTurn = isMyTurn(state) && state.phase === 'playing';

  return (
    <div className="hand-tray">
      <div className="hand-tray__scroll">
        {sortedForDisplay(hand).map((card) => {
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
