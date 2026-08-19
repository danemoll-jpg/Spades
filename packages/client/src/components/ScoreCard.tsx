import { PublicGameState } from '@spades/engine';

interface ScoreCardProps {
  state: PublicGameState;
  onClose: () => void;
}

/** Current standings, available any time via a button in GameView, not just at match end —
 * running score and accumulated bags per group, plus this hand's bid vs. tricks-so-far per
 * player. */
export function ScoreCard({ state, onClose }: ScoreCardProps) {
  const nameFor = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const sortedGroups = [...state.groups].sort((a, b) => b.score - a.score);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>📋 Scorecard</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="scorecard-table-wrap">
          <table className="scorecard-table">
            <thead>
              <tr>
                <th>Player(s)</th>
                <th>Score</th>
                <th>Bags</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map((g) => (
                <tr key={g.id}>
                  <td>{g.playerIds.map(nameFor).join(' & ')}</td>
                  <td className="scorecard-table__total">{g.score}</td>
                  <td>{g.bags}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="scorecard__subheading">Hand {state.handNumber}</h3>
        <div className="scorecard-table-wrap">
          <table className="scorecard-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Bid</th>
                <th>Tricks</th>
              </tr>
            </thead>
            <tbody>
              {state.players.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.bid === null ? '–' : p.bid === 'nil' ? 'Nil' : p.bid}</td>
                  <td>{p.tricksWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
