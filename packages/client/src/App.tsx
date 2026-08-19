import { useState } from 'react';
import { GameView } from './components/GameView';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineHomeScreen } from './components/OnlineHomeScreen';
import { StartScreen } from './components/StartScreen';
import { useLocalGame } from './hooks/useLocalGame';
import { useOnlineRoom } from './hooks/useOnlineRoom';
import { getSavedRoomCode } from './network/roomSession';

type Mode = 'home' | 'local' | 'online';

export default function App() {
  // If this browser remembers being in an online room (see network/roomSession.ts), skip
  // straight past the home screen — a refresh, or reopening the tab later, should resume the
  // match, not strand you back at square one with no way to get back in.
  const [mode, setMode] = useState<Mode>(() => (getSavedRoomCode() ? 'online' : 'home'));

  if (mode === 'home') {
    return <HomeScreen onSelectLocal={() => setMode('local')} onSelectOnline={() => setMode('online')} />;
  }

  if (mode === 'local') {
    return <LocalGame onBack={() => setMode('home')} />;
  }

  return <OnlineGame onBack={() => setMode('home')} />;
}

function LocalGame({ onBack }: { onBack: () => void }) {
  const game = useLocalGame();

  if (!game.publicState) {
    return <StartScreen connected={game.connected} onStart={game.startMatch} onBack={onBack} />;
  }

  return (
    <GameView
      publicState={game.publicState}
      playerIcons={game.playerIcons}
      commentary={game.commentary}
      hint={game.hint}
      error={game.error}
      connected={game.connected}
      muted={game.muted}
      toggleMuted={game.toggleMuted}
      sendAction={game.sendAction}
      requestHint={game.requestHint}
      clearHint={game.clearHint}
      dismissCommentary={game.dismissCommentary}
      newMatch={game.newMatch}
      newRecordRanks={game.newRecordRanks}
    />
  );
}

function OnlineGame({ onBack }: { onBack: () => void }) {
  const room = useOnlineRoom();

  if (!room.room) {
    return <OnlineHomeScreen error={room.error} onCreate={room.createAndJoin} onJoin={room.joinExisting} onBack={onBack} />;
  }

  if (room.room.phase === 'lobby') {
    return (
      <LobbyScreen
        code={room.code!}
        room={room.room}
        isHost={room.isHost}
        mySeatIndex={room.mySeatIndex}
        error={room.error}
        onAddOpenSeat={room.addOpenSeat}
        onAddBotSeat={room.addBotSeat}
        onRemoveSeat={room.removeSeat}
        onSetPartnersRule={room.setPartnersRule}
        onSetSimplifiedScoringRule={room.setSimplifiedScoringRule}
        onSetBotDifficulty={room.setBotDifficulty}
        onStart={room.begin}
        onLeave={() => {
          room.leaveRoom();
          onBack();
        }}
      />
    );
  }

  if (!room.publicState) {
    // Briefly true right after phase flips to 'playing' but before this client's own
    // snapshot has arrived, or if this browser somehow isn't seated in the room at all.
    return (
      <div className="start-screen">
        <div className="start-screen__card">
          <p>Joining the table…</p>
        </div>
      </div>
    );
  }

  return (
    <GameView
      publicState={room.publicState}
      playerIcons={room.playerIcons}
      commentary={room.commentary}
      hint={room.hint}
      error={room.error}
      connected={room.connected}
      muted={room.muted}
      toggleMuted={room.toggleMuted}
      sendAction={room.sendAction}
      requestHint={room.requestHint}
      clearHint={room.clearHint}
      dismissCommentary={room.dismissCommentary}
      newMatch={room.newMatch}
      newRecordRanks={room.newRecordRanks}
      headerExtra={
        <button
          type="button"
          className="back-link back-link--floating"
          onClick={() => {
            room.leaveRoom();
            onBack();
          }}
        >
          ‹ Leave room
        </button>
      }
    />
  );
}
