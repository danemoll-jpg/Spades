import { useState } from 'react';
import { BotDifficulty, MatchRules } from '@spades/engine';
import { unlockAudio } from '../lib/audio';
import { DEFAULT_DIFFICULTY, DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS, DIFFICULTY_OPTIONS } from '../lib/difficulty';
import { DEFAULT_PLAYER_ICON } from '../lib/icons';
import { IconPicker } from './IconPicker';

interface StartScreenProps {
  connected: boolean;
  onStart: (humanName: string, totalPlayers: number, icon: string, rules: MatchRules, difficulty: BotDifficulty) => void;
  onBack: () => void;
}

export function StartScreen({ connected, onStart, onBack }: StartScreenProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_PLAYER_ICON);
  const [totalPlayers, setTotalPlayers] = useState(3);
  const [simplifiedScoring, setSimplifiedScoring] = useState(false);
  const [difficulty, setDifficulty] = useState<BotDifficulty>(DEFAULT_DIFFICULTY);

  function handleStart() {
    // Browsers require a real user gesture before audio can play — this click is it.
    unlockAudio();
    // Partners mode needs a full table of 4, and there are only two bot personalities (Gus &
    // Mabel) — a local vs-bots table can only ever seat 3 total, so Partners is never
    // reachable here. It's only offered once a real 4th seat can exist: the online lobby, via
    // an open seat for a friend. See LobbyScreen.
    onStart(name, totalPlayers, icon, { partnersMode: false, simplifiedScoring }, difficulty);
  }

  return (
    <div className="start-screen">
      <div className="start-screen__card">
        <button type="button" className="back-link" onClick={onBack}>
          ‹ Back
        </button>
        <h1>♠️ Spades</h1>
        <p className="start-screen__subtitle">
          Bid your tricks, then take (or duck) exactly what you promised. Spades are always trump, and the first side
          to 500 wins.
        </p>

        <label className="start-screen__label">
          What should Gus &amp; Mabel call you?
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dan"
            maxLength={20}
          />
        </label>

        <label className="start-screen__label">
          Your avatar
          <IconPicker value={icon} onChange={setIcon} />
        </label>

        <label className="start-screen__label">
          Table size
          <div className="start-screen__options">
            <button type="button" className={totalPlayers === 2 ? 'active' : ''} onClick={() => setTotalPlayers(2)}>
              You vs. 1
            </button>
            <button type="button" className={totalPlayers === 3 ? 'active' : ''} onClick={() => setTotalPlayers(3)}>
              You vs. 2
            </button>
          </div>
          <span className="start-screen__hint">
            Want a 2v2 Partners game? That needs a full table of 4 — head to "Play online" and invite three friends
            (or two friends plus a bot).
          </span>
        </label>

        <label className="start-screen__checkbox">
          <input type="checkbox" checked={simplifiedScoring} onChange={(e) => setSimplifiedScoring(e.target.checked)} />
          🧮 Simplified scoring (no Nil bids, no bag penalty)
        </label>

        <label className="start-screen__label">
          Bot difficulty
          <div className="start-screen__options">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button key={d} type="button" className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
          <span className="start-screen__hint">{DIFFICULTY_DESCRIPTIONS[difficulty]}</span>
        </label>

        <button type="button" className="start-screen__submit" disabled={!connected} onClick={handleStart}>
          {connected ? 'Deal me in ♠️' : 'Connecting…'}
        </button>

        <details className="start-screen__rules">
          <summary>I don't really know how to play — quick rules?</summary>
          <ul>
            <li>Each hand, everyone bids how many tricks they'll take — or Nil, betting on exactly zero.</li>
            <li>Spades are always trump. You can't lead a spade until one's been played (or it's all you have left).</li>
            <li>Follow the suit that was led if you can; otherwise play anything, including a spade.</li>
            <li>Make your bid: 10 points per trick bid, plus 1 per extra trick ("bag"). Miss it: lose 10 per trick bid.</li>
            <li>10 bags accumulated costs you a 100-point penalty and resets the bag count.</li>
            <li>Nil made is worth +100; Nil failed costs -100 (any tricks it wins become bags for the group).</li>
            <li>At exactly 4 players, turn on Partners to play 2v2 — you share a bid and a score with your partner.</li>
            <li>First to 500 points wins.</li>
          </ul>
          <p>Stuck mid-turn? Hit the "What should I play?" button any time.</p>
        </details>
      </div>
    </div>
  );
}
