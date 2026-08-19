import { useEffect, useState } from 'react';
import { LeaderboardEntry, subscribeToGlobalLeaderboard } from '../network/globalLeaderboard';

interface LeaderboardPanelProps {
  onClose: () => void;
}

/** Shared global top-10 (highest score toward 500 wins) — same shared-Firestore-document
 * pattern as the rest of the series, just sorted the opposite direction (climbing toward a
 * target instead of racking up the fewest points). Subscribes only while the modal is open. */
export function LeaderboardPanel({ onClose }: LeaderboardPanelProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => subscribeToGlobalLeaderboard(setEntries), []);

  // Competition ranking (1-2-2-4): ties share a place instead of one arbitrarily edging out
  // the other.
  const places =
    entries?.map((e, i) => (i === 0 || e.score !== entries[i - 1].score ? i + 1 : null)) ?? [];
  for (let i = 1; i < places.length; i++) if (places[i] === null) places[i] = places[i - 1];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>🏆 Top Scores</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {entries === null ? (
          <p className="leaderboard-empty">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="leaderboard-empty">No scores yet — finish a match to be the first on the board!</p>
        ) : (
          <table className="scorecard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Points</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td>{places[i]}</td>
                  <td>
                    {e.name}
                    {e.isAi && <span className="ai-tag"> BOT</span>}
                  </td>
                  <td>{e.score}</td>
                  <td>{e.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
