import { Card as CardType, SUIT_SYMBOLS } from '@spades/engine';

interface CardProps {
  card?: CardType; // undefined = face-down back
  playable?: boolean;
  selected?: boolean;
  faded?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  title?: string;
}

const RED_SUITS = new Set(['H', 'D']);

export function Card({ card, playable, selected, faded, size = 'md', onClick, title }: CardProps) {
  const classNames = ['card', `card--${size}`];
  if (!card) classNames.push('card--back');
  else if (RED_SUITS.has(card.suit)) classNames.push('card--red');
  if (playable) classNames.push('card--playable');
  if (selected) classNames.push('card--selected');
  if (faded) classNames.push('card--faded');
  if (onClick) classNames.push('card--clickable');

  return (
    <button type="button" className={classNames.join(' ')} onClick={onClick} disabled={!onClick} title={title}>
      {card ? (
        <>
          <span className="card__corner card__corner--top">
            {card.rank}
            <br />
            {SUIT_SYMBOLS[card.suit]}
          </span>
          <span className="card__pip">{SUIT_SYMBOLS[card.suit]}</span>
          <span className="card__corner card__corner--bottom">
            {card.rank}
            <br />
            {SUIT_SYMBOLS[card.suit]}
          </span>
        </>
      ) : (
        <span className="card__back-pattern">♠️</span>
      )}
    </button>
  );
}
