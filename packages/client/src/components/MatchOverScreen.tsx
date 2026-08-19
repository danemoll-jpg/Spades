import { useState } from 'react';
import { PublicGameState } from '@spades/engine';
import { GAME_HUB_URL } from '../lib/hub';
import { LeaderboardPanel } from './LeaderboardPanel';

interface MatchOverScreenProps {
  state: PublicGameState;
  onPlayAgain: () => void;
  /** Player id → 1-based all-time rank, for whichever human players' final totals just landed
   * on the shared top-10 leaderboard. */
  newRecordRanks: Record<string, number>;
}

export function MatchOverScreen({ state, onPlayAgain, newRecordRanks }: MatchOverScreenProps) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const winnerIds = state.matchWinnerIds ?? [];
  const isDraw = state.matchWinnerGroupId === null && winnerIds.length === 0;
  const me = state.players[state.viewerSeatIndex]?.id;
  const iWon = !!me && winnerIds.includes(me);
  const nameFor = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const winnerLabel = winnerIds.map(nameFor).join(' & ');
  const sortedGroups = [...state.groups].sort((a, b) => b.score - a.score);

  return (
    <div className="game-over">
      <div className="game-over__card">
        {isDraw ? (
          <>
            <div className="game-over__emoji">🤝</div>
            <h2>It's a tie!</h2>
            <p>Both sides crossed the line at exactly the same score.</p>
          </>
        ) : (
          <>
            <div className="game-over__emoji">🏆</div>
            <h2>{iWon ? 'You win!' : `${winnerLabel || 'Someone'} wins!`}</h2>
            <p>First to 500 points takes it.</p>
          </>
        )}

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
                <tr key={g.id} className={g.id === state.matchWinnerGroupId ? 'scorecard-table__winner' : ''}>
                  <td>
                    {g.playerIds.map((pid) => (
                      <span key={pid} className="match-over__player">
                        {nameFor(pid)}
                        {newRecordRanks[pid] && (
                          <span className="new-record-badge">🏅 New Record! #{newRecordRanks[pid]} All-Time</span>
                        )}
                      </span>
                    ))}
                  </td>
                  <td className="scorecard-table__total">{g.score}</td>
                  <td>{g.bags}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="game-over__actions">
          <button type="button" className="game-over__button" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="game-over__button game-over__button--secondary" onClick={() => setShowLeaderboard(true)}>
            🏆 Leaderboard
          </button>
          <a className="game-over__button game-over__button--secondary" href={GAME_HUB_URL}>
            🎮 Game Hub
          </a>
        </div>
      </div>
      {showLeaderboard && <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />}
    </div>
  );
}
