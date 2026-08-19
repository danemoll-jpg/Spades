import { useState } from 'react';
import { unlockAudio } from '../lib/audio';
import { DEFAULT_PLAYER_ICON } from '../lib/icons';
import { IconPicker } from './IconPicker';

interface OnlineHomeScreenProps {
  error: string | null;
  onCreate: (name: string, icon: string) => void;
  onJoin: (code: string, name: string, icon: string) => void;
  onBack: () => void;
}

export function OnlineHomeScreen({ error, onCreate, onJoin, onBack }: OnlineHomeScreenProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_PLAYER_ICON);
  const [joinCode, setJoinCode] = useState('');

  function handleCreate() {
    unlockAudio();
    onCreate(name, icon);
  }

  function handleJoin() {
    if (!joinCode.trim()) return;
    unlockAudio();
    onJoin(joinCode, name, icon);
  }

  return (
    <div className="start-screen">
      <div className="start-screen__card">
        <button type="button" className="back-link" onClick={onBack}>
          ‹ Back
        </button>
        <h1>Play online</h1>
        <p className="start-screen__subtitle">Create a room and share the code, or join one your friends already started.</p>

        <label className="start-screen__label">
          Your name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dan" maxLength={20} />
        </label>

        <label className="start-screen__label">
          Your avatar
          <IconPicker value={icon} onChange={setIcon} />
        </label>

        <button type="button" className="start-screen__submit" onClick={handleCreate}>
          Create a room ♠️
        </button>

        <div className="online-home__divider">or</div>

        <label className="start-screen__label">
          Room code
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={4}
            style={{ textTransform: 'uppercase', letterSpacing: '0.2em', textAlign: 'center' }}
          />
        </label>
        <button type="button" className="start-screen__submit" disabled={!joinCode.trim()} onClick={handleJoin}>
          Join room
        </button>

        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
