import { Bid } from '@spades/engine';

interface BiddingPanelProps {
  maxBid: number;
  allowNil: boolean;
  onBid: (value: Bid) => void;
}

/** The bid picker — shown in place of the hand tray while it's the viewer's turn to bid.
 * Every legal value (0 through the full hand size, plus Nil unless simplifiedScoring is on)
 * gets its own button; tapping one submits immediately, same one-tap pattern as the rest of
 * the series uses wherever a choice has no ambiguity to resolve. */
export function BiddingPanel({ maxBid, allowNil, onBid }: BiddingPanelProps) {
  const values = Array.from({ length: maxBid + 1 }, (_, i) => i);

  return (
    <div className="bidding-panel">
      <p className="bidding-panel__prompt">How many tricks will you take?</p>
      <div className="bidding-panel__grid">
        {values.map((v) => (
          <button key={v} type="button" className="bidding-panel__option" onClick={() => onBid(v)}>
            {v}
          </button>
        ))}
        {allowNil && (
          <button type="button" className="bidding-panel__option bidding-panel__option--nil" onClick={() => onBid('nil')}>
            Nil
          </button>
        )}
      </div>
    </div>
  );
}
