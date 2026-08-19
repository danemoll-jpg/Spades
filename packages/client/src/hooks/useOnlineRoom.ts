import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction,
  BotDifficulty,
  BotPersonalityId,
  deriveSoundCues,
  DEFAULT_RULES,
  GameEvent,
  getHint,
  MoveHint,
  PlayerAction,
  PublicGameState,
  redactState,
  SfxCue,
  TemplateCommentaryProvider,
} from '@spades/engine';
import { isBotTurn, stepBot } from '../lib/bot';
import { commentaryForEvents } from '../lib/commentary';
import { DEFAULT_DIFFICULTY } from '../lib/difficulty';
import { isMuted, playSound, setMuted, SoundName } from '../lib/audio';
import { addScoresToGlobalLeaderboard } from '../network/globalLeaderboard';
import { getClientId } from '../network/clientId';
import { clearSavedRoomCode, getSavedRoomCode, saveRoomCode } from '../network/roomSession';
import {
  addBotSeat as addBotSeatRequest,
  addOpenSeat as addOpenSeatRequest,
  createRoom,
  joinRoom,
  removeSeat as removeSeatRequest,
  resetToLobby,
  RoomDoc,
  sendReadyForNextHand,
  setRoomDifficulty,
  setRoomRules,
  startMatch as startMatchRequest,
  subscribeToRoom,
  updateNewRecordRanks,
  writeGameState,
} from '../network/rooms';

export interface CommentaryEntry {
  id: string;
  speakerId: string;
  personality: BotPersonalityId;
  text: string;
}

// Deliberately shorter than local play's pause — a single "turn" online can involve several
// chained bot actions in a row for the other games in the series; Spades doesn't chain (one
// bid or one card per turn), but the same short delay still reads naturally here.
const BOT_THINK_MIN_MS = 250;
const BOT_THINK_MAX_MS = 450;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSoundName(cue: SfxCue, state: PublicGameState | null): SoundName {
  if (cue !== 'matchOver') return cue;
  if (!state || state.matchWinnerIds.length === 0) return 'matchOverDraw';
  const me = state.players[state.viewerSeatIndex]?.id;
  return me && state.matchWinnerIds.includes(me) ? 'matchOverWin' : 'matchOverLose';
}

export interface UseOnlineRoom {
  connected: boolean;
  room: RoomDoc | null;
  code: string | null;
  isHost: boolean;
  mySeatIndex: number;
  error: string | null;
  createAndJoin: (hostName: string, hostIcon: string) => Promise<void>;
  joinExisting: (code: string, name: string, icon: string) => Promise<void>;
  leaveRoom: () => void;
  addOpenSeat: () => void;
  addBotSeat: () => void;
  removeSeat: (index: number) => void;
  setPartnersRule: (partnersMode: boolean) => void;
  setSimplifiedScoringRule: (simplifiedScoring: boolean) => void;
  setBotDifficulty: (difficulty: BotDifficulty) => void;
  begin: () => void;
  publicState: PublicGameState | null;
  /** Human players' chosen avatars, keyed by player id — see GameView's playerIcons prop. */
  playerIcons: Record<string, string>;
  commentary: CommentaryEntry[];
  hint: MoveHint | null;
  muted: boolean;
  toggleMuted: () => void;
  sendAction: (action: PlayerAction) => void;
  requestHint: () => void;
  clearHint: () => void;
  dismissCommentary: (id: string) => void;
  newMatch: () => void;
  /** Player id → 1-based all-time rank, for whichever human players' final totals just landed
   * on the shared top-10 leaderboard. Empty until the host's leaderboard write resolves and
   * syncs into the room doc. */
  newRecordRanks: Record<string, number>;
}

/** Online (Firestore-synced) room: mirrors the shape of the local-play hook, but backed by a
 * shared `rooms/{code}` document instead of in-memory state. See src/network/rooms.ts for the
 * sync model — single writer per turn, host-driven bots, independently re-derived sound cues,
 * shared commentary. */
export function useOnlineRoom(): UseOnlineRoom {
  const myClientId = useMemo(() => getClientId(), []);
  // Starts from whatever room (if any) this browser was last connected to — see
  // network/roomSession.ts — so a refresh (or reopening the tab later) resumes the same match
  // instead of losing it.
  const [code, setCode] = useState<string | null>(() => getSavedRoomCode());
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<MoveHint | null>(null);
  const [dismissedSeqs, setDismissedSeqs] = useState<Set<number>>(new Set());
  const [muted, setMutedState] = useState(() => isMuted());

  const lastSeenLogLength = useRef(0);
  const botLoopRunning = useRef(false);
  const commentaryProvider = useRef(new TemplateCommentaryProvider());
  const submittedLeaderboard = useRef(false);

  useEffect(() => {
    if (!code) return undefined;
    const unsubscribe = subscribeToRoom(code, (next) => {
      setRoom(next);
      if (next) {
        setError(null);
      } else {
        // The room this browser remembered no longer exists (expired, deleted, or a stale/
        // mistyped code) — stop trying to resume it on the next reload.
        setError('That room no longer exists.');
        clearSavedRoomCode();
      }
    });
    return unsubscribe;
  }, [code]);

  const mySeatIndex = room?.seats.findIndex((s) => s.clientId === myClientId) ?? -1;
  const isHost = room?.hostClientId === myClientId;
  const gameState = room?.gameState ?? null;

  // Independently re-derive + play sound cues for any newly-arrived events. Deterministic
  // given the same event log, so every connected client computing this separately is fine.
  useEffect(() => {
    if (!gameState) {
      lastSeenLogLength.current = 0;
      return;
    }
    const newEvents = gameState.log.slice(lastSeenLogLength.current);
    lastSeenLogLength.current = gameState.log.length;
    if (newEvents.length === 0) return;
    const publicNow = mySeatIndex >= 0 ? redactState(gameState, room!.seats[mySeatIndex].id) : null;
    for (const cue of deriveSoundCues(newEvents)) playSound(resolveSoundName(cue, publicNow));
  }, [gameState, mySeatIndex, room]);

  // Host's browser drives every bot turn — a bid, or a single card play. Batches consecutive
  // steps into one Firestore write, flushing whenever the acting seat changes (a real turn
  // boundary another client should see) or the hand/match ends.
  useEffect(() => {
    if (!isHost || !code || !room || !gameState) return;
    if (!isBotTurn(gameState)) return;
    if (botLoopRunning.current) return;
    botLoopRunning.current = true;

    const roomCode = code; // local const alias — TS won't carry the `!code` narrowing above into the nested `flush` function below
    let current = gameState;
    let currentRoom = room;
    const difficulty = room.botDifficulty ?? DEFAULT_DIFFICULTY;
    (async () => {
      let batchStartSeat = current.actingSeat;
      let batchEvents: GameEvent[] = [];

      async function flush() {
        if (batchEvents.length === 0) return;
        const lines = await commentaryForEvents(commentaryProvider.current, batchEvents, current);
        const written = await writeGameState(roomCode, currentRoom, current, lines);
        // Keep our local copy in step with what we just wrote (rather than waiting for the
        // snapshot round-trip) so the next batch doesn't clobber it.
        currentRoom = { ...currentRoom, ...written };
        batchEvents = [];
      }

      while (isBotTurn(current)) {
        await delay(BOT_THINK_MIN_MS + Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
        const { state: next, newEvents } = stepBot(current, difficulty);
        current = next;
        batchEvents.push(...newEvents);

        if (current.actingSeat !== batchStartSeat || current.phase === 'matchOver' || current.phase === 'handOver') {
          await flush();
          batchStartSeat = current.actingSeat;
        }
      }
      await flush(); // whatever's left in the batch when a human's turn arrives
    })().finally(() => {
      botLoopRunning.current = false;
    });
  }, [isHost, code, room, gameState]);

  // Host submits final totals to the shared leaderboard exactly once per finished match —
  // every connected client sees the same matchOver moment via its own subscription, so
  // without this host-only gate, a match's scores would get added once PER connected device
  // instead of once total.
  useEffect(() => {
    if (!isHost || !code || !gameState || gameState.phase !== 'matchOver' || submittedLeaderboard.current) return;
    submittedLeaderboard.current = true;
    // Bots don't compete for leaderboard spots — only human results get submitted, so the
    // board reflects real players, not however well the heuristic bot strategy happens to
    // play. In Partners mode a player's score IS their team's score (both partners share it).
    const humans = gameState.players.filter((p) => !p.isBot);
    if (humans.length === 0) return;
    const results = humans.map((p) => ({
      name: p.name,
      score: gameState.groups.find((g) => g.playerIds.includes(p.id))!.score,
      isAi: false,
    }));
    addScoresToGlobalLeaderboard(results)
      .then((ranks) => {
        const next: Record<string, number> = {};
        ranks.forEach((rank, i) => {
          if (rank !== null) next[humans[i].id] = rank;
        });
        if (Object.keys(next).length > 0) return updateNewRecordRanks(code, next);
      })
      .catch(() => {
        // Leaderboard is a nice-to-have — a failed write shouldn't disrupt the game-over screen.
      });
  }, [isHost, code, gameState]);

  const createAndJoin = useCallback(async (hostName: string, hostIcon: string) => {
    setError(null);
    try {
      const newCode = await createRoom(hostName, hostIcon);
      saveRoomCode(newCode);
      setCode(newCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a room.');
    }
  }, []);

  const joinExisting = useCallback(async (joinCode: string, name: string, icon: string) => {
    setError(null);
    try {
      const joined = await joinRoom(joinCode, name, icon);
      saveRoomCode(joined);
      setCode(joined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that room.');
    }
  }, []);

  const leaveRoom = useCallback(() => {
    clearSavedRoomCode();
    setCode(null);
    setRoom(null);
    setError(null);
    setHint(null);
    setDismissedSeqs(new Set());
  }, []);

  const addOpenSeat = useCallback(() => {
    if (code) addOpenSeatRequest(code).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
  }, [code]);

  const addBotSeat = useCallback(() => {
    if (code) addBotSeatRequest(code).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
  }, [code]);

  const removeSeat = useCallback(
    (index: number) => {
      if (code) removeSeatRequest(code, index).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
    },
    [code],
  );

  const setPartnersRule = useCallback(
    (partnersMode: boolean) => {
      if (code && room) setRoomRules(code, { ...(room.rules ?? DEFAULT_RULES), partnersMode }).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
    },
    [code, room],
  );

  const setSimplifiedScoringRule = useCallback(
    (simplifiedScoring: boolean) => {
      if (code && room) setRoomRules(code, { ...(room.rules ?? DEFAULT_RULES), simplifiedScoring }).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
    },
    [code, room],
  );

  const setBotDifficulty = useCallback(
    (difficulty: BotDifficulty) => {
      if (code) setRoomDifficulty(code, difficulty).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
    },
    [code],
  );

  const begin = useCallback(() => {
    if (code && room) {
      startMatchRequest(code, room.seats, room.rules ?? DEFAULT_RULES).catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed.'),
      );
    }
  }, [code, room]);

  const publicState = gameState && mySeatIndex >= 0 ? redactState(gameState, room!.seats[mySeatIndex].id) : null;

  const sendAction = useCallback(
    (action: PlayerAction) => {
      if (!code || !room || !gameState || mySeatIndex < 0) return;

      // 'readyForNextHand' isn't turn-based, and — unlike every other action — more than one
      // player can legitimately send it during the same hand-over pause, so it goes through a
      // Firestore transaction (see sendReadyForNextHand) instead of the optimistic
      // compute-locally-then-overwrite path every other action uses below.
      if (action.type === 'readyForNextHand') {
        setError(null);
        setHint(null);
        sendReadyForNextHand(code, room.seats[mySeatIndex].id, commentaryProvider.current).catch((err) => {
          setError(err instanceof Error ? err.message : 'That move was rejected.');
        });
        return;
      }

      if (gameState.actingSeat !== mySeatIndex) {
        setError("It's not your turn.");
        return;
      }
      setError(null);
      setHint(null);
      (async () => {
        try {
          const prevLogLength = gameState.log.length;
          const next = applyAction(gameState, mySeatIndex, action);
          const newEvents = next.log.slice(prevLogLength);
          const lines = await commentaryForEvents(commentaryProvider.current, newEvents, next);
          await writeGameState(code, room, next, lines);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'That move was rejected.');
        }
      })();
    },
    [code, room, gameState, mySeatIndex],
  );

  const requestHint = useCallback(() => {
    if (!gameState || mySeatIndex < 0) return;
    setHint(getHint(gameState, mySeatIndex));
  }, [gameState, mySeatIndex]);

  const clearHint = useCallback(() => setHint(null), []);

  const dismissCommentary = useCallback((id: string) => {
    const seq = Number(id);
    if (Number.isNaN(seq)) return;
    setDismissedSeqs((prev) => new Set(prev).add(seq));
  }, []);

  const newMatch = useCallback(() => {
    if (code) {
      resetToLobby(code).catch((err) => setError(err instanceof Error ? err.message : 'Failed.'));
      setHint(null);
      setDismissedSeqs(new Set());
      submittedLeaderboard.current = false;
    }
  }, [code]);

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      setMuted(next);
      return next;
    });
  }, []);

  const commentary: CommentaryEntry[] = (room?.commentary ?? [])
    .filter((c) => !dismissedSeqs.has(c.seq))
    .map((c) => ({ id: String(c.seq), speakerId: c.speakerId, personality: c.personality, text: c.text }));

  const playerIcons: Record<string, string> = Object.fromEntries(
    (room?.seats ?? []).filter((s): s is typeof s & { icon: string } => !!s.icon).map((s) => [s.id, s.icon]),
  );

  return {
    connected: room !== null,
    room,
    code,
    isHost,
    mySeatIndex,
    error,
    createAndJoin,
    joinExisting,
    leaveRoom,
    addOpenSeat,
    addBotSeat,
    removeSeat,
    setPartnersRule,
    setSimplifiedScoringRule,
    setBotDifficulty,
    begin,
    publicState,
    playerIcons,
    commentary,
    hint,
    muted,
    toggleMuted,
    sendAction,
    requestHint,
    clearHint,
    dismissCommentary,
    newMatch,
    newRecordRanks: room?.newRecordRanks ?? {},
  };
}
