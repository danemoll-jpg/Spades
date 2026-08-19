import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAction,
  BotDifficulty,
  createMatch,
  deriveSoundCues,
  GameEvent,
  GameState,
  getHint,
  MatchRules,
  MoveHint,
  PlayerAction,
  PublicGameState,
  redactState,
  TemplateCommentaryProvider,
} from '@spades/engine';
import { isBotTurn, stepBot } from '../lib/bot';
import { commentaryForEvents } from '../lib/commentary';
import { DEFAULT_DIFFICULTY } from '../lib/difficulty';
import { BOT_DISPLAY_NAMES, buildPlayerConfigs, MAX_SEATS, nextBotPersonality, SeatConfig } from '../lib/players';
import { isMuted, playSound, setMuted, SoundName } from '../lib/audio';
import { DEFAULT_PLAYER_ICON } from '../lib/icons';
import { addScoresToGlobalLeaderboard } from '../network/globalLeaderboard';
import { CommentaryEntry } from './useOnlineRoom';

const HUMAN_ID = 'human';
const BOT_THINK_MIN_MS = 350;
const BOT_THINK_MAX_MS = 650;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSoundName(cue: ReturnType<typeof deriveSoundCues>[number], state: GameState): SoundName {
  if (cue !== 'matchOver') return cue;
  if (state.matchWinnerIds.length === 0) return 'matchOverDraw';
  return state.matchWinnerIds.includes(HUMAN_ID) ? 'matchOverWin' : 'matchOverLose';
}

let nextCommentaryId = 0;

export interface UseLocalGame {
  connected: true;
  publicState: PublicGameState | null;
  playerIcons: Record<string, string>;
  commentary: CommentaryEntry[];
  hint: MoveHint | null;
  error: string | null;
  muted: boolean;
  toggleMuted: () => void;
  startMatch: (humanName: string, totalPlayers: number, icon: string, rules: MatchRules, difficulty: BotDifficulty) => void;
  sendAction: (action: PlayerAction) => void;
  requestHint: () => void;
  newMatch: () => void;
  clearHint: () => void;
  dismissCommentary: (id: string) => void;
  /** Player id → 1-based all-time rank, for whichever human players' final totals just landed
   * on the shared top-10 leaderboard. Empty until the leaderboard write resolves after
   * matchOver; cleared again at the start of the next match. */
  newRecordRanks: Record<string, number>;
}

/** Runs a Spades match entirely in the browser — no server, no network. Local (vs-bots) play
 * calls the exact same engine functions (createMatch/applyAction/stepBot) that online play
 * and the bots use, just directly instead of round-tripping through Firestore. */
export function useLocalGame(): UseLocalGame {
  const [state, setState] = useState<GameState | null>(null);
  const [myIcon, setMyIcon] = useState(DEFAULT_PLAYER_ICON);
  const [commentary, setCommentary] = useState<CommentaryEntry[]>([]);
  const [hint, setHint] = useState<MoveHint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(() => isMuted());
  const commentaryProvider = useRef(new TemplateCommentaryProvider());
  // Remembered so "Play again" (newMatch) can redeal immediately with the same settings
  // instead of dumping the player back at a blank setup screen.
  const lastConfig = useRef<{
    humanName: string;
    totalPlayers: number;
    icon: string;
    rules: MatchRules;
    difficulty: BotDifficulty;
  } | null>(null);
  const difficultyRef = useRef<BotDifficulty>(DEFAULT_DIFFICULTY);
  const submittedLeaderboard = useRef(false);
  const [newRecordRanks, setNewRecordRanks] = useState<Record<string, number>>({});

  const notifyEvents = useCallback(async (events: GameEvent[], forState: GameState) => {
    if (events.length === 0) return;
    for (const cue of deriveSoundCues(events)) playSound(resolveSoundName(cue, forState));
    const lines = await commentaryForEvents(commentaryProvider.current, events, forState);
    if (lines.length > 0) {
      setCommentary((prev) =>
        [...prev, ...lines.map((line) => ({ ...line, id: `c${nextCommentaryId++}` }))].slice(-30),
      );
    }
  }, []);

  const runBotsToCompletion = useCallback(
    async (from: GameState): Promise<GameState> => {
      let current = from;
      while (isBotTurn(current)) {
        await delay(BOT_THINK_MIN_MS + Math.random() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
        const { state: next, newEvents } = stepBot(current, difficultyRef.current);
        current = next;
        setState(current);
        await notifyEvents(newEvents, current);
      }
      return current;
    },
    [notifyEvents],
  );

  const startMatch = useCallback(
    (humanName: string, totalPlayers: number, icon: string, rules: MatchRules, difficulty: BotDifficulty) => {
      lastConfig.current = { humanName, totalPlayers, icon, rules, difficulty };
      difficultyRef.current = difficulty;
      setMyIcon(icon);
      submittedLeaderboard.current = false;
      setNewRecordRanks({});
      const count = Math.min(MAX_SEATS, Math.max(2, Math.floor(totalPlayers) || 4));
      const seats: SeatConfig[] = [{ id: HUMAN_ID, name: humanName.trim() || 'You', isBot: false }];
      const used: SeatConfig['personality'][] = [];
      for (let i = 0; i < count - 1; i++) {
        const personality = nextBotPersonality(used);
        if (!personality) break;
        used.push(personality);
        seats.push({ id: `bot${i}`, name: BOT_DISPLAY_NAMES[personality], isBot: true, personality });
      }

      commentaryProvider.current = new TemplateCommentaryProvider();
      setCommentary([]);
      setHint(null);
      setError(null);

      const fresh = createMatch({ playerConfigs: buildPlayerConfigs(seats), rules });
      setState(fresh);
      (async () => {
        await notifyEvents(fresh.log, fresh);
        await runBotsToCompletion(fresh);
      })();
    },
    [notifyEvents, runBotsToCompletion],
  );

  const sendAction = useCallback(
    (action: PlayerAction) => {
      if (!state) return;
      const seatIndex = state.players.findIndex((p) => p.id === HUMAN_ID);
      // 'readyForNextHand' isn't turn-based — it's legal any time the hand-over screen is up,
      // regardless of whose turn it was when the hand ended.
      if (action.type !== 'readyForNextHand' && state.actingSeat !== seatIndex) {
        setError("It's not your turn.");
        return;
      }
      setError(null);
      setHint(null);
      (async () => {
        try {
          const prevLogLength = state.log.length;
          const next = applyAction(state, seatIndex, action);
          setState(next);
          await notifyEvents(next.log.slice(prevLogLength), next);
          await runBotsToCompletion(next);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'That move was rejected.');
        }
      })();
    },
    [state, notifyEvents, runBotsToCompletion],
  );

  const requestHint = useCallback(() => {
    if (!state) return;
    const seatIndex = state.players.findIndex((p) => p.id === HUMAN_ID);
    setHint(getHint(state, seatIndex));
  }, [state]);

  const clearHint = useCallback(() => setHint(null), []);

  const dismissCommentary = useCallback((id: string) => {
    setCommentary((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const newMatch = useCallback(() => {
    if (lastConfig.current) {
      const { humanName, totalPlayers, icon, rules, difficulty } = lastConfig.current;
      startMatch(humanName, totalPlayers, icon, rules, difficulty);
      return;
    }
    setState(null);
    setCommentary([]);
    setHint(null);
    setError(null);
  }, [startMatch]);

  const toggleMuted = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      setMuted(next);
      return next;
    });
  }, []);

  // Submit final totals to the shared leaderboard exactly once per finished match.
  useEffect(() => {
    if (!state || state.phase !== 'matchOver' || submittedLeaderboard.current) return;
    submittedLeaderboard.current = true;
    // Bots don't compete for leaderboard spots — only human results get submitted, so the
    // board reflects real players, not however well the heuristic bot strategy happens to
    // play. In Partners mode a player's score IS their team's score (both partners share it).
    const humans = state.players.filter((p) => !p.isBot);
    if (humans.length === 0) return;
    const results = humans.map((p) => ({
      name: p.name,
      score: state.groups.find((g) => g.playerIds.includes(p.id))!.score,
      isAi: false,
    }));
    addScoresToGlobalLeaderboard(results)
      .then((ranks) => {
        const next: Record<string, number> = {};
        ranks.forEach((rank, i) => {
          if (rank !== null) next[humans[i].id] = rank;
        });
        setNewRecordRanks(next);
      })
      .catch(() => {
        // Leaderboard is a nice-to-have — a failed write (e.g. Firebase not configured yet)
        // shouldn't disrupt the game-over screen.
      });
  }, [state]);

  const publicState = state ? redactState(state, HUMAN_ID) : null;
  const playerIcons = { [HUMAN_ID]: myIcon };

  return {
    connected: true,
    publicState,
    playerIcons,
    commentary,
    hint,
    error,
    muted,
    toggleMuted,
    startMatch,
    sendAction,
    requestHint,
    newMatch,
    clearHint,
    dismissCommentary,
    newRecordRanks,
  };
}
