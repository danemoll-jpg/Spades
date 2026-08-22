import { ReactNode, useState } from 'react';
import {
  BAG_PENALTY,
  BAG_PENALTY_THRESHOLD,
  Bid,
  cardId,
  HAND_SIZE_BY_PLAYER_COUNT,
  MoveHint,
  PlayerAction,
  PublicGameState,
  SUIT_NAMES,
} from '@spades/engine';
import { BiddingPanel } from './BiddingPanel';
import { CommentaryFeed } from './CommentaryFeed';
import { HandSummaryScreen } from './HandSummaryScreen';
import { HandTray } from './HandTray';
import { HintPanel } from './HintPanel';
import { HowToPlay } from './HowToPlay';
import { LeaderboardPanel } from './LeaderboardPanel';
import { MatchOverScreen } from './MatchOverScreen';
import { ScoreCard } from './ScoreCard';
import { SoundToggle } from './SoundToggle';
import { TrickArea } from './TrickArea';
import { CommentaryEntry, TrickReveal } from '../hooks/useOnlineRoom';
import { isMyTurn } from '../lib/legality';
import { seatAvatar } from '../lib/players';

interface GameViewProps {
  publicState: PublicGameState;
  /** Human players' chosen avatars, keyed by player id — bots resolve their avatar from
   * `personality` instead, via seatAvatar(). */
  playerIcons: Record<string, string>;
  commentary: CommentaryEntry[];
  hint: MoveHint | null;
  /** The trick that just finished, held on screen for a beat before the area clears for the
   * next one — see TrickReveal (useOnlineRoom.ts). */
  revealedTrick: TrickReveal | null;
  error: string | null;
  connected: boolean;
  muted: boolean;
  toggleMuted: () => void;
  sendAction: (action: PlayerAction) => void;
  requestHint: () => void;
  clearHint: () => void;
  dismissCommentary: (id: string) => void;
  newMatch: () => void;
  /** Player id → 1-based all-time rank, for whichever human players' final totals just landed
   * on the shared top-10 leaderboard — see MatchOverScreen's "New Record" badge. */
  newRecordRanks: Record<string, number>;
  headerExtra?: ReactNode;
}

/** The actual table screen — shared by local (vs-bots) and online (Firestore room) play,
 * since both hooks expose the same PublicGameState-shaped view of the match. */
export function GameView({
  publicState,
  playerIcons,
  commentary,
  hint,
  revealedTrick,
  error,
  connected,
  muted,
  toggleMuted,
  sendAction,
  requestHint,
  clearHint,
  dismissCommentary,
  newMatch,
  newRecordRanks,
  headerExtra,
}: GameViewProps) {
  const [showScorecard, setShowScorecard] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const me = publicState.players[publicState.viewerSeatIndex];
  const myTurn = isMyTurn(publicState);
  const acting = publicState.players[publicState.actingSeat];
  const maxBid = HAND_SIZE_BY_PLAYER_COUNT[publicState.players.length] ?? 13;

  function avatarFor(playerId: string): string {
    const p = publicState.players.find((pl) => pl.id === playerId);
    if (!p) return '♠️';
    return seatAvatar({ type: p.isBot ? 'bot' : 'human', personality: p.personality, icon: playerIcons[p.id] });
  }

  function teamIndexFor(playerId: string): number {
    return publicState.rules.partnersMode ? publicState.groups.findIndex((g) => g.playerIds.includes(playerId)) : -1;
  }

  function scoreFor(playerId: string): number {
    return publicState.groups.find((g) => g.playerIds.includes(playerId))?.score ?? 0;
  }

  // Bags reset back to 0 the moment they cross BAG_PENALTY_THRESHOLD (the penalty applies right
  // then — see scoreGroupHand), so this is always a fresh count toward the NEXT penalty, not a
  // lifetime total.
  function bagsFor(playerId: string): number {
    return publicState.groups.find((g) => g.playerIds.includes(playerId))?.bags ?? 0;
  }

  function bagsTitle(bags: number): string {
    if (publicState.rules.simplifiedScoring) return 'Bags this match — no penalty under Simplified scoring';
    return `${bags} bag${bags === 1 ? '' : 's'} — ${BAG_PENALTY_THRESHOLD - bags} more costs ${BAG_PENALTY} points`;
  }

  function bidLabel(bid: Bid | null): string {
    if (bid === null) return '–';
    return bid === 'nil' ? 'Nil' : String(bid);
  }

  function handlePlayCard(id: string) {
    const card = me?.hand?.find((c) => cardId(c) === id);
    if (!card) return;
    sendAction({ type: 'playCard', card });
  }

  function statusText(): string {
    if (!myTurn) return acting ? `Waiting on ${acting.name}…` : '';
    if (publicState.phase === 'bidding') return 'How many tricks will you take?';
    if (publicState.phase === 'playing') {
      if (publicState.trick.length === 0) {
        return publicState.spadesBroken ? 'Lead any card.' : "Lead anything but a spade — they haven't broken yet.";
      }
      return `Follow ${SUIT_NAMES[publicState.ledSuit!]} if you can.`;
    }
    return '';
  }

  return (
    <div className="app">
      <SoundToggle muted={muted} onToggle={toggleMuted} />
      {headerExtra}
      {!connected && <div className="error-banner">Disconnected — try refreshing.</div>}
      {error && <div className="error-banner">{error}</div>}

      <div className="hole-banner">
        <span>
          Hand {publicState.handNumber} · {publicState.phase === 'bidding' ? 'Bidding' : 'Playing'}
          {publicState.rules.partnersMode && <span className="hole-banner__jokers" title="Seats 1+3 vs. seats 2+4"> · 🤝 Partners</span>}
          {publicState.rules.simplifiedScoring && <span className="hole-banner__jokers" title="No Nil bids, no bag penalty"> · 🧮 Simplified</span>}
        </span>
        <span className="hole-banner__buttons">
          <button type="button" onClick={() => setShowScorecard(true)}>
            📋 Scorecard
          </button>
          <button type="button" onClick={() => setShowLeaderboard(true)}>
            🏆 Leaderboard
          </button>
          <button type="button" onClick={() => setShowHowToPlay(true)}>
            ❓ How to Play
          </button>
        </span>
      </div>

      <div className="players-strip">
        {publicState.players.map((p) => {
          const team = teamIndexFor(p.id);
          return (
            <div
              key={p.id}
              className={[
                'player-chip',
                p.id === acting?.id ? 'player-chip--active' : '',
                p.id === me?.id ? 'player-chip--me' : '',
                team === 0 ? 'player-chip--team0' : team === 1 ? 'player-chip--team1' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="player-chip__avatar">{avatarFor(p.id)}</span>
              <span className="player-chip__name">
                {p.name}
                {p.id === me?.id && ' (you)'}
              </span>
              <span className="player-chip__count" title="This hand's bid">
                {bidLabel(p.bid)}
              </span>
              <span className="player-chip__count" title="Tricks won this hand">
                🎴{p.tricksWon}
              </span>
              <span
                className={`player-chip__count${
                  !publicState.rules.simplifiedScoring && bagsFor(p.id) >= BAG_PENALTY_THRESHOLD - 2 ? ' player-chip__count--bags-high' : ''
                }`}
                title={bagsTitle(bagsFor(p.id))}
              >
                🎒{bagsFor(p.id)}
              </span>
              <span className="player-chip__total" title="Running score">
                {scoreFor(p.id)}
              </span>
            </div>
          );
        })}
      </div>

      <TrickArea state={publicState} avatarFor={avatarFor} revealedTrick={revealedTrick} />

      <div className="status-bar">
        <span className="status-bar__prompt">{statusText()}</span>
      </div>

      {myTurn && publicState.phase === 'bidding' && (
        <BiddingPanel
          maxBid={maxBid}
          allowNil={!publicState.rules.simplifiedScoring}
          onBid={(value) => sendAction({ type: 'bid', value })}
        />
      )}

      <div className="action-bar">
        <HintPanel hint={hint} canRequest={myTurn} onRequest={requestHint} onDismiss={clearHint} />
      </div>

      {me?.hand && (publicState.phase === 'bidding' || publicState.phase === 'playing') && (
        <HandTray hand={me.hand} state={publicState} selectedCardId={null} onSelect={handlePlayCard} />
      )}

      <CommentaryFeed entries={commentary} onDismiss={dismissCommentary} />

      {showScorecard && <ScoreCard state={publicState} onClose={() => setShowScorecard(false)} />}
      {showLeaderboard && <LeaderboardPanel onClose={() => setShowLeaderboard(false)} />}
      {showHowToPlay && (
        <HowToPlay onClose={() => setShowHowToPlay(false)} simplifiedScoringInThisMatch={publicState.rules.simplifiedScoring} />
      )}
      {/* Both gates below also wait out `revealedTrick` — the hand (or match) can end on the
          very trick that's currently being held on screen (see TrickReveal), and without this
          the summary/match-over modal would pop up over it instantly, hiding the last trick
          the same bug this whole mechanism exists to fix. */}
      {publicState.phase === 'handOver' && publicState.handSummary && !revealedTrick && (
        <HandSummaryScreen
          key={publicState.handSummary.handNumber}
          state={publicState}
          onReady={() => sendAction({ type: 'readyForNextHand' })}
        />
      )}
      {publicState.phase === 'matchOver' && !revealedTrick && (
        <MatchOverScreen state={publicState} onPlayAgain={newMatch} newRecordRanks={newRecordRanks} />
      )}
    </div>
  );
}
