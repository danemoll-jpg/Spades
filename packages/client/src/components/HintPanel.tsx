import { MoveHint } from '@spades/engine';

interface HintPanelProps {
  hint: MoveHint | null;
  canRequest: boolean;
  onRequest: () => void;
  onDismiss: () => void;
}

export function HintPanel({ hint, canRequest, onRequest, onDismiss }: HintPanelProps) {
  return (
    <div className="hint-panel">
      <button type="button" className="hint-panel__button" onClick={onRequest} disabled={!canRequest}>
        🤔 What should I play?
      </button>
      {hint && (
        <div className="hint-panel__bubble">
          <button type="button" className="hint-panel__close" onClick={onDismiss} aria-label="Dismiss hint">
            ×
          </button>
          <strong>{hint.headline}</strong>
          <p>{hint.rationale}</p>
        </div>
      )}
    </div>
  );
}
