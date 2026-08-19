// Firestore-backed "room" — the one shared document two (or more) browsers use to find each
// other and, once a match starts, to sync turns. Same pattern as every other project in the
// series.
//
// Room shape (Firestore doc at rooms/{code}):
//   {
//     createdAt: <ms epoch>,
//     hostClientId: <string>,
//     phase: "lobby" | "playing",
//     seats: [{ id, name, type: "human" | "bot", personality?, icon?, clientId: string | null }],
//     rules: { partnersMode, simplifiedScoring },
//     gameState: null | GameState,  // the full engine state, including every other player's
//       hidden hand — see the README's "Hand privacy" note: this is knowingly readable by
//       anyone with the room code, same trust model as the rest of the series.
//     commentary: [{ seq, speakerId, personality, text }],  // rolling window, newest last,
//       capped to COMMENTARY_LIMIT.
//     nextCommentarySeq: <number>,  // monotonic, so every commentary entry gets a unique seq
//     newRecordRanks: Record<string, number>,  // see updateNewRecordRanks below
//   }
// A seat with clientId === null and type "human" is an open seat — whoever calls joinRoom()
// next claims the first one they find.

import { doc, onSnapshot, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import {
  applyAction,
  BotDifficulty,
  BotPersonalityId,
  CommentaryLine,
  CommentaryProvider,
  createMatch,
  DEFAULT_RULES,
  GameState,
  MatchRules,
  TemplateCommentaryProvider,
} from '@spades/engine';
import { DEFAULT_DIFFICULTY } from '../lib/difficulty';
import { db } from './firebase';
import { getClientId } from './clientId';
import { commentaryForEvents } from '../lib/commentary';
import { BOT_DISPLAY_NAMES, buildPlayerConfigs, MAX_SEATS, nextBotName, nextBotPersonality } from '../lib/players';

const COMMENTARY_LIMIT = 30;

// No 0/O/1/I — easy to read aloud or type from a text message without second-guessing a
// character.
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RoomSeat {
  id: string;
  name: string;
  type: 'human' | 'bot';
  personality?: BotPersonalityId;
  icon?: string;
  clientId: string | null;
}

export interface RoomCommentaryEntry extends CommentaryLine {
  seq: number;
}

export interface RoomDoc {
  createdAt: number;
  hostClientId: string;
  phase: 'lobby' | 'playing';
  seats: RoomSeat[];
  rules: MatchRules;
  /** How well any bot seats play — a pure AI-tuning knob, not a rule of the game, so it lives
   * here on the room doc rather than inside the engine's GameState/MatchRules. */
  botDifficulty: BotDifficulty;
  gameState: GameState | null;
  commentary: RoomCommentaryEntry[];
  nextCommentarySeq: number;
  /** Player id → 1-based all-time rank, for whichever human players' final totals landed on
   * the shared top-10 leaderboard at the end of the current match. Written once by the host
   * (see useOnlineRoom) after the leaderboard save resolves, so every connected client's
   * match-over screen — not just the host's — can show the "New Record" badge. */
  newRecordRanks?: Record<string, number>;
}

function generateRoomCode(length = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function seatId(): string {
  return `seat-${Math.random().toString(36).slice(2, 9)}`;
}

function roomRef(code: string) {
  return doc(db, 'rooms', code.toUpperCase());
}

/** Creates a new room with the caller as seat 0 (host). Returns the room code. */
export async function createRoom(hostName: string, hostIcon: string): Promise<string> {
  const code = generateRoomCode();
  const clientId = getClientId();
  const room: RoomDoc = {
    createdAt: Date.now(),
    hostClientId: clientId,
    phase: 'lobby',
    seats: [{ id: seatId(), name: hostName.trim() || 'Player 1', type: 'human', icon: hostIcon, clientId }],
    rules: DEFAULT_RULES,
    botDifficulty: DEFAULT_DIFFICULTY,
    gameState: null,
    commentary: [],
    nextCommentarySeq: 0,
  };
  await setDoc(roomRef(code), room);
  return code;
}

/** Adds an open seat (type "human", unclaimed) for a remote player to join into. */
export async function addOpenSeat(code: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found.');
    const room = snap.data() as RoomDoc;
    if (room.seats.length >= MAX_SEATS) throw new Error('Table is full.');
    tx.update(ref, {
      seats: [...room.seats, { id: seatId(), name: 'Waiting for player…', type: 'human', clientId: null }],
    });
  });
}

/** Adds a bot seat: the first two get a named personality (Gus, Mabel) with their own
 * commentary voice; any bot seat beyond that is a plain heuristic opponent with a generic
 * name and no personality — see lib/players.ts's nextBotName. */
export async function addBotSeat(code: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found.');
    const room = snap.data() as RoomDoc;
    if (room.seats.length >= MAX_SEATS) throw new Error('Table is full.');
    const personality = nextBotPersonality(room.seats.map((s) => s.personality));
    const newSeat: RoomSeat = personality
      ? { id: seatId(), name: BOT_DISPLAY_NAMES[personality], type: 'bot', personality, clientId: null }
      : { id: seatId(), name: nextBotName(room.seats.map((s) => s.name)), type: 'bot', clientId: null };
    tx.update(ref, { seats: [...room.seats, newSeat] });
  });
}

/** Removes a seat by index. */
export async function removeSeat(code: string, index: number): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found.');
    const room = snap.data() as RoomDoc;
    tx.update(ref, { seats: room.seats.filter((_, i) => i !== index) });
  });
}

/** Claims the first open (unclaimed, type "human") seat in the room for this browser.
 * Wrapped in a transaction so two people joining at the same instant can't both claim the
 * same seat. Throws if the room doesn't exist or has no open seat. */
export async function joinRoom(code: string, name: string, icon: string): Promise<string> {
  const clientId = getClientId();
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No room found with that code.');
    const room = snap.data() as RoomDoc;

    // Already in this room (e.g. reconnecting after a refresh) — nothing to do.
    if (room.seats.some((s) => s.clientId === clientId)) return;

    const openIndex = room.seats.findIndex((s) => s.type === 'human' && s.clientId === null);
    if (openIndex === -1) throw new Error('That room is full — ask the host to open another seat.');

    const seats = [...room.seats];
    seats[openIndex] = { ...seats[openIndex], name: name.trim() || 'Player', icon, clientId };
    tx.update(ref, { seats });
  });
  return code.toUpperCase();
}

/** Subscribes to realtime updates for a room. callback(roomData | null) is called
 * immediately with the current state, then again on every change. Returns an unsubscribe
 * function. */
export function subscribeToRoom(code: string, callback: (room: RoomDoc | null) => void): () => void {
  return onSnapshot(roomRef(code), (snap) => {
    callback(snap.exists() ? (snap.data() as RoomDoc) : null);
  });
}

/** Host action: deals hand 1 (using whatever house rules are currently set on the room) and
 * moves the room into "playing". */
export async function startMatch(code: string, seats: RoomSeat[], rules: MatchRules): Promise<void> {
  const playerConfigs = buildPlayerConfigs(
    seats.map((s) => ({ id: s.id, name: s.name, isBot: s.type === 'bot', personality: s.personality })),
  );
  const gameState = createMatch({ playerConfigs, rules });

  // Generate commentary for hand 1's opening events (matchStarted, handStarted) right here —
  // local play does this via notifyEvents immediately after createMatch (see
  // useLocalGame.ts's startMatch); online play needs the same thing so the room doc carries
  // an opening line from its very first write, instead of staying silent until whatever
  // happens to be the first commentary-worthy move later in the match. A fresh provider is
  // fine — there's no prior-line dedup history worth carrying into a brand new match.
  const commentary = (await commentaryForEvents(new TemplateCommentaryProvider(), gameState.log, gameState)).map(
    (line, i) => ({ ...line, seq: i }),
  );

  await updateDoc(roomRef(code), { phase: 'playing', gameState, commentary, nextCommentarySeq: commentary.length });
}

/** Host-only: updates the house rules while still in the lobby (before dealing). */
export async function setRoomRules(code: string, rules: MatchRules): Promise<void> {
  await updateDoc(roomRef(code), { rules });
}

/** Host-only: updates the bot difficulty while still in the lobby (before dealing). */
export async function setRoomDifficulty(code: string, botDifficulty: BotDifficulty): Promise<void> {
  await updateDoc(roomRef(code), { botDifficulty });
}

/** Writes a new game state (after a human or bot move) plus any commentary lines it
 * produced. Called by whoever computed the move locally — see useOnlineRoom. Returns the new
 * commentary array/seq so a caller stepping several moves in a row (the host driving a run of
 * bot turns) can keep its own local copy accurate between snapshot round-trips, instead of
 * re-deriving from a stale `room` and clobbering just-written lines. */
export async function writeGameState(
  code: string,
  room: RoomDoc,
  nextState: GameState,
  newCommentary: CommentaryLine[],
): Promise<{ commentary: RoomCommentaryEntry[]; nextCommentarySeq: number }> {
  let seq = room.nextCommentarySeq;
  const appended = newCommentary.map((line) => ({ ...line, seq: seq++ }));
  const commentary = [...room.commentary, ...appended].slice(-COMMENTARY_LIMIT);
  await updateDoc(roomRef(code), { gameState: nextState, commentary, nextCommentarySeq: seq });
  return { commentary, nextCommentarySeq: seq };
}

/** Marks a seat ready for the next hand during the 'handOver' pause. Unlike every other move
 * in the game, ready-ing up is NOT turn-based — any number of players can legitimately click
 * it within the same pause, each from their own possibly-stale local `gameState`. A plain
 * writeGameState() (read-nothing, blind overwrite) would let two humans clicking within the
 * same round-trip silently clobber one another's ready flag and hang the room waiting on
 * someone who already clicked. So this re-reads the room and applies the action inside a
 * transaction instead — Firestore retries it automatically on write contention. */
export async function sendReadyForNextHand(code: string, seatId: string, provider: CommentaryProvider): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(code);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found.');
    const room = snap.data() as RoomDoc;
    if (!room.gameState) throw new Error('No game in progress.');
    const seatIndex = room.seats.findIndex((s) => s.id === seatId);
    if (seatIndex === -1) throw new Error('Not seated in this room.');

    const prevLogLength = room.gameState.log.length;
    const next = applyAction(room.gameState, seatIndex, { type: 'readyForNextHand' });
    // Readying up can, once everyone's in, cascade straight into dealing the next hand or
    // ending the match — same commentary-worthy events (handStarted, matchOver, …) those
    // produce anywhere else in the game, so they still deserve a line here.
    const newCommentary = await commentaryForEvents(provider, next.log.slice(prevLogLength), next);
    let seq = room.nextCommentarySeq;
    const appended = newCommentary.map((line) => ({ ...line, seq: seq++ }));
    const commentary = [...room.commentary, ...appended].slice(-COMMENTARY_LIMIT);

    tx.update(ref, { gameState: next, commentary, nextCommentarySeq: seq });
  });
}

/** Host-only: syncs the just-computed leaderboard ranks (see useOnlineRoom's leaderboard
 * effect) into the room doc, so every connected client's match-over screen can show the "New
 * Record" badge — not just the host's own, which already has it locally. */
export async function updateNewRecordRanks(code: string, ranks: Record<string, number>): Promise<void> {
  await updateDoc(roomRef(code), { newRecordRanks: ranks });
}

/** Resets a room back to its lobby, keeping the same seats — "New match" without leaving the
 * room. */
export async function resetToLobby(code: string): Promise<void> {
  await updateDoc(roomRef(code), {
    phase: 'lobby',
    gameState: null,
    commentary: [],
    nextCommentarySeq: 0,
    newRecordRanks: {},
  });
}

export function isRoomHost(room: RoomDoc, clientId: string): boolean {
  return room.hostClientId === clientId;
}

export { getClientId };
