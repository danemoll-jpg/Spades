// Shared seat/personality bookkeeping used by both local (vs-bots) and online (Firestore
// room) game setup, so the two don't drift.
import { BotPersonalityId, EngineConfig, PERSONALITIES } from '@spades/engine';
import { DEFAULT_PLAYER_ICON } from './icons';

export const BOT_PERSONALITIES: BotPersonalityId[] = ['gus', 'mabel'];
export const BOT_DISPLAY_NAMES: Record<BotPersonalityId, string> = { gus: 'Gus', mabel: 'Mabel' };

/** Capped at 4 seats total — matches the rest of the series. Play up to 3 bots at once (a
 * solo human can fill a full 4-seat table, enabling Partners) — only the first two get a
 * named personality (Gus, Mabel) with their own commentary voice; any further bot seat is a
 * plain heuristic opponent with a generic name (see nextBotName below) and no commentary
 * lines of its own (TemplateCommentaryProvider simply never picks a speaker with no
 * personality). They play exactly the same strategy either way — personality is cosmetic. */
export const MAX_SEATS = 4;

// A generic, deliberately diverse pool of first names for bot seats beyond the two named
// personalities — not modeled on any real person, just enough variety that a full table
// rarely repeats. Same idea as Par Five's randomAiName.
const GENERIC_BOT_NAMES = [
  'Ava', 'Milo', 'Zara', 'Kenji', 'Nadia', 'Leo', 'Priya', 'Finn', 'Amara', 'Theo',
  'Luna', 'Omar', 'Ines', 'Diego', 'Sasha', 'Wren', 'Kofi', 'Maya', 'Ravi', 'Elin',
];

/** Picks a display name for a personality-less bot seat, avoiding names already at the
 * table. Falls back to allowing a repeat only if every name in the pool is somehow already
 * taken (never happens at a 4-seat max table). */
export function nextBotName(usedNames: string[]): string {
  const taken = new Set(usedNames);
  const available = GENERIC_BOT_NAMES.filter((n) => !taken.has(n));
  const pool = available.length > 0 ? available : GENERIC_BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface SeatConfig {
  id: string;
  name: string;
  isBot: boolean;
  personality?: BotPersonalityId;
}

export function buildPlayerConfigs(seats: SeatConfig[]): EngineConfig['playerConfigs'] {
  return seats.map((s) => ({
    id: s.id,
    name: s.name.trim() || 'Player',
    isBot: s.isBot,
    personality: s.personality,
  }));
}

/** Picks the first bot personality not already sitting at the table, or null if both
 * available personalities are taken. */
export function nextBotPersonality(used: Array<BotPersonalityId | undefined>): BotPersonalityId | null {
  return BOT_PERSONALITIES.find((p) => !used.includes(p)) ?? null;
}

/** Single source of truth for "what avatar does this seat show" — used by both the lobby and
 * the in-game player badges. Bots always show their personality's fixed avatar; humans show
 * whatever they picked (see lib/icons.ts), falling back to the default if unset (e.g. an
 * unclaimed open seat). */
export function seatAvatar(seat: { type: 'human' | 'bot'; personality?: BotPersonalityId; icon?: string }): string {
  if (seat.type === 'bot') return seat.personality ? PERSONALITIES[seat.personality].avatar : '🤖';
  return seat.icon || DEFAULT_PLAYER_ICON;
}
