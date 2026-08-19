import { useState } from 'react';
import { PublicGameState } from '@spades/engine';

interface HandSummaryScreenProps {
  state: PublicGameState;
  onReady: () => void;
}

/** Shown between hands — what everyone bid vs. what they actually took, how it scored for
 * each group, and the new running totals. Play is paused here: it only continues once every
 * human player (bots auto-ready instantly) has clicked through, whether the match is local,
 * online, or on its very last hand heading into the match-over screen. */
export function HandSummaryScreen({ state, onReady }: HandSummaryScreenProps) {
  const summary = state.handSummary;
  const [justClicked, setJustClicked] = useState(false);
  if (!summary) return null;

  const me = state.viewerSeatIndex >= 0 ? state.players[state.viewerSeatIndex] : undefined;
  const iAmHuman = !!me && !me.isBot;
  const iAmReady = justClicked || (!!me && state.readyPlayerIds.includes(me.id));
  const waitingOn = state.players.filter((p) => !p.isBot && !state.readyPlayerIds.includes(p.id) && p.id !== me?.id);

  const nameFor = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const groupPlayerIds = (groupId: string) => state.groups.find((g) => g.id === groupId)?.playerIds ?? [groupId];
  const groupLabel = (groupId: string) => groupPlayerIds(groupId).map(nameFor).join(' & ');
  const bidLabel = (bid: number | 'nil') => (bid === 'nil' ? 'Nil' : String(bid));

  const sorted = [...summary.groups].sort((a, b) => b.handScore - a.handScore);
  const bestScore = sorted[0]?.handScore;

  function handleReady() {
    setJustClicked(true);
    onReady();
  }

  return (
    <div className="game-over">
      <div className="game-over__card">
        <div className="game-over__emoji">♠️</div>
        <h2>Hand {summary.handNumber} complete</h2>
        <p>{summary.isFinalHand ? 'Someone crossed 500 — that was the last hand!' : "Here's how it scored."}</p>

        <div className="round-summary-list">
          {sorted.map((g) => (
            <div key={g.groupId} className={`round-summary-row ${g.handScore === bestScore ? 'round-summary-row--best' : ''}`}>
              <div className="round-summary-row__header">
                <span className="round-summary-row__name">{groupLabel(g.groupId)}</span>
                <span className="round-summary-row__score">
                  {g.handScore >= 0 ? '+' : ''}
                  {g.handScore} pts <span className="round-summary-row__total">· {g.total} total</span>
                </span>
              </div>
              <div className="hand-summary-row__members">
                {groupPlayerIds(g.groupId).map((pid) => {
                  const p = summary.players.find((sp) => sp.playerId === pid);
                  if (!p) return null;
                  const made = typeof p.bid === 'number' ? p.tricksWon >= p.bid : p.tricksWon === 0;
                  return (
                    <span key={pid} className={`hand-summary-member ${made ? 'hand-summary-member--made' : 'hand-summary-member--set'}`}>
                      {nameFor(pid)}: bid {bidLabel(p.bid)}, took {p.tricksWon}
                    </span>
                  );
                })}
                {g.bagsAdded > 0 && <span className="hand-summary-row__bags">+{g.bagsAdded} bag{g.bagsAdded === 1 ? '' : 's'}</span>}
              </div>
            </div>
          ))}
        </div>

        {iAmHuman && !iAmReady && (
          <div className="game-over__actions">
            <button type="button" className="game-over__button" onClick={handleReady}>
              {summary.isFinalHand ? 'See final results 🏆' : 'Next hand →'}
            </button>
          </div>
        )}
        {(!iAmHuman || iAmReady) && (
          <p className="round-summary__waiting">
            {waitingOn.length > 0 ? `Waiting on ${waitingOn.map((p) => p.name).join(', ')}…` : 'Starting…'}
          </p>
        )}
      </div>
    </div>
  );
}
