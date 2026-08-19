import { BotDifficulty } from '@spades/engine';
import { RoomDoc } from '../network/rooms';
import { DEFAULT_DIFFICULTY, DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS, DIFFICULTY_OPTIONS } from '../lib/difficulty';
import { MAX_SEATS, seatAvatar } from '../lib/players';
import { unlockAudio } from '../lib/audio';

interface LobbyScreenProps {
  code: string;
  room: RoomDoc;
  isHost: boolean;
  mySeatIndex: number;
  error: string | null;
  onAddOpenSeat: () => void;
  onAddBotSeat: () => void;
  onRemoveSeat: (index: number) => void;
  onSetPartnersRule: (partnersMode: boolean) => void;
  onSetSimplifiedScoringRule: (simplifiedScoring: boolean) => void;
  onSetBotDifficulty: (difficulty: BotDifficulty) => void;
  onStart: () => void;
  onLeave: () => void;
}

export function LobbyScreen({
  code,
  room,
  isHost,
  mySeatIndex,
  error,
  onAddOpenSeat,
  onAddBotSeat,
  onRemoveSeat,
  onSetPartnersRule,
  onSetSimplifiedScoringRule,
  onSetBotDifficulty,
  onStart,
  onLeave,
}: LobbyScreenProps) {
  const hasOpenSeat = room.seats.some((s) => s.type === 'human' && s.clientId === null);
  const canStart = isHost && room.seats.length >= 2 && !hasOpenSeat;
  const tableFull = room.seats.length >= MAX_SEATS;
  const canPartner = room.seats.length === 4;
  const partnersMode = canPartner && (room.rules?.partnersMode ?? false);
  const simplifiedScoring = room.rules?.simplifiedScoring ?? false;
  const hasBotSeat = room.seats.some((s) => s.type === 'bot');
  const difficulty = room.botDifficulty ?? DEFAULT_DIFFICULTY;

  function handleStart() {
    unlockAudio();
    onStart();
  }

  return (
    <div className="start-screen">
      <div className="start-screen__card">
        <button type="button" className="back-link" onClick={onLeave}>
          ‹ Leave
        </button>
        <h1>Room {code}</h1>
        <p className="start-screen__subtitle">Share this code with your friends — they'll enter it to join.</p>

        <ul className="lobby__seats">
          {room.seats.map((seat, i) => (
            <li key={seat.id} className="lobby__seat">
              <span className="lobby__seat-icon">
                {seat.type === 'human' && !seat.clientId ? '⏳' : seatAvatar(seat)}
              </span>
              <span className="lobby__seat-name">
                {seat.name}
                {i === mySeatIndex && ' (you)'}
              </span>
              {isHost && i !== mySeatIndex && (
                <button type="button" className="lobby__seat-remove" onClick={() => onRemoveSeat(i)} aria-label="Remove seat">
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost && (
          <div className="lobby__add-buttons">
            <button type="button" disabled={tableFull} onClick={onAddOpenSeat}>
              + Open seat (for a friend)
            </button>
            <button type="button" disabled={tableFull} onClick={onAddBotSeat}>
              + Add a bot
            </button>
          </div>
        )}

        {hasBotSeat && (
          <label className="start-screen__label">
            Bot difficulty
            <div className="start-screen__options">
              {DIFFICULTY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={difficulty === d ? 'active' : ''}
                  disabled={!isHost}
                  onClick={() => onSetBotDifficulty(d)}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
            <span className="start-screen__hint">{DIFFICULTY_DESCRIPTIONS[difficulty]}</span>
          </label>
        )}

        <label className="start-screen__checkbox">
          <input
            type="checkbox"
            checked={partnersMode}
            disabled={!isHost || !canPartner}
            onChange={(e) => onSetPartnersRule(e.target.checked)}
          />
          🤝 Partners (2v2 — seats 1+3 vs. seats 2+4){!canPartner && ' — needs a full table of 4'}
        </label>

        <label className="start-screen__checkbox">
          <input
            type="checkbox"
            checked={simplifiedScoring}
            disabled={!isHost}
            onChange={(e) => onSetSimplifiedScoringRule(e.target.checked)}
          />
          🧮 Simplified scoring (no Nil bids, no bag penalty)
        </label>

        {isHost ? (
          <button type="button" className="start-screen__submit" disabled={!canStart} onClick={handleStart}>
            {hasOpenSeat ? 'Waiting for everyone to join…' : 'Deal me in ♠️'}
          </button>
        ) : (
          <p className="lobby__waiting">Waiting for the host to start the match…</p>
        )}

        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
