import { GAME_HUB_URL } from '../lib/hub';

interface HomeScreenProps {
  onSelectLocal: () => void;
  onSelectOnline: () => void;
}

export function HomeScreen({ onSelectLocal, onSelectOnline }: HomeScreenProps) {
  return (
    <div className="start-screen">
      <a className="back-link back-link--floating" href={GAME_HUB_URL}>
        🎮 All Games
      </a>
      <div className="start-screen__card">
        <h1>♠️ Spades</h1>
        <p className="start-screen__subtitle">
          Bid how many tricks you'll take, then go make it — spades are always trump. First side (or player) to 500
          points wins. 2-4 players, and Partners mode kicks in automatically at a full table of 4.
        </p>

        <div className="home-screen__choices">
          <button type="button" className="home-screen__choice" onClick={onSelectLocal}>
            <span className="home-screen__choice-emoji">🤖</span>
            <span className="home-screen__choice-title">Play against AI</span>
            <span className="home-screen__choice-sub">Just you and this browser — no one else needed.</span>
          </button>
          <button type="button" className="home-screen__choice" onClick={onSelectOnline}>
            <span className="home-screen__choice-emoji">🌐</span>
            <span className="home-screen__choice-title">Play online vs. friends</span>
            <span className="home-screen__choice-sub">Create a room, share the code, play from anywhere.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
