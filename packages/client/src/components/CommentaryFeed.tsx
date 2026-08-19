import { useEffect } from 'react';
import { PERSONALITIES } from '@spades/engine';
import { CommentaryEntry } from '../hooks/useOnlineRoom';

interface CommentaryFeedProps {
  entries: CommentaryEntry[];
  onDismiss: (id: string) => void;
}

const DISPLAY_MS = 5000;

/** Shows one commentary line at a time, in order, instead of stacking several toasts at once
 * — a burst of events (several doubles in a row, a round ending) used to pop up multiple
 * lines simultaneously with independent timers, so they'd all vanish together before there
 * was time to read more than one. `entries` is already a chronological queue (the hooks only
 * ever append, never reorder) — showing just entries[0] and dismissing it after DISPLAY_MS
 * naturally plays the backlog one line at a time instead of all at once. */
export function CommentaryFeed({ entries, onDismiss }: CommentaryFeedProps) {
  const current = entries[0];

  return <div className="commentary-feed">{current && <CommentaryToast entry={current} onDismiss={onDismiss} />}</div>;
}

function CommentaryToast({ entry, onDismiss }: { entry: CommentaryEntry; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(entry.id), DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [entry.id, onDismiss]);

  const personality = PERSONALITIES[entry.personality];

  return (
    <div className="commentary-toast" onClick={() => onDismiss(entry.id)} title="Click to dismiss">
      <span className="commentary-toast__avatar">{personality.avatar}</span>
      <div>
        <div className="commentary-toast__name">{personality.displayName}</div>
        <div className="commentary-toast__text">{entry.text}</div>
      </div>
    </div>
  );
}
