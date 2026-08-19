import { BotPersonalityId, GameEvent, GameState, PlayerState } from '../types.js';
import { CommentaryKey, PERSONALITIES, Personality } from './personalities.js';
import { CommentaryLine, CommentaryProvider } from './types.js';

type BotPlayer = PlayerState & { personality: BotPersonalityId };

type BaseKey = 'handStart' | 'nilBid' | 'spadesBroken' | 'matchWin' | 'matchDraw';

interface BaseEvent {
  key: BaseKey;
  actorId?: string;
}

function baseEventFor(event: GameEvent): BaseEvent | null {
  switch (event.type) {
    case 'handStarted':
      return { key: 'handStart' };
    case 'bidPlaced':
      return event.bid === 'nil' ? { key: 'nilBid', actorId: event.by } : null;
    case 'spadesBroken':
      return { key: 'spadesBroken', actorId: event.by };
    case 'matchOver':
      return event.isDraw ? { key: 'matchDraw' } : { key: 'matchWin', actorId: event.winnerIds[0] };
    default:
      return null;
  }
}

function resolveKey(base: BaseEvent, speakerId: string): CommentaryKey {
  if (base.key === 'handStart' || base.key === 'matchDraw') return base.key;
  const isSelf = base.actorId === speakerId;
  return `${base.key}${isSelf ? 'Self' : 'Other'}` as CommentaryKey;
}

function fillTemplate(template: string, event: GameEvent, state: GameState): string {
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  let text = template;
  if (event.type === 'handStarted') {
    text = text.replaceAll('{hand}', String(event.handNumber));
  } else if (event.type === 'bidPlaced') {
    text = text.replaceAll('{player}', nameOf(event.by));
  } else if (event.type === 'spadesBroken') {
    text = text.replaceAll('{player}', nameOf(event.by));
  } else if (event.type === 'matchOver' && event.winnerIds[0]) {
    text = text.replaceAll('{player}', nameOf(event.winnerIds[0]));
  }
  return text;
}

/** Picks who speaks — Mabel runs the table and talks about twice as often as the quieter
 * Gus, matching their personalities (same weighting shape as Carol/Ed on the Mexican Train
 * sibling project). */
function pickSpeaker(bots: BotPlayer[]): BotPlayer {
  const weighted: BotPlayer[] = [];
  for (const b of bots) {
    for (let i = 0; i < (b.personality === 'mabel' ? 2 : 1); i++) weighted.push(b);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

/**
 * Default commentary source: randomized templated one-liners, keyed off engine events. No
 * network calls, no API key required. Implements {@link CommentaryProvider}, so a future
 * Claude-powered provider can be swapped in without touching game logic.
 */
export class TemplateCommentaryProvider implements CommentaryProvider {
  private lastLineByPersonality = new Map<string, string>();

  onEvent(event: GameEvent, state: GameState): CommentaryLine[] {
    const base = baseEventFor(event);
    if (!base) return [];

    const bots = state.players.filter(
      (p): p is PlayerState & { personality: NonNullable<PlayerState['personality']> } => p.isBot && !!p.personality,
    );
    if (bots.length === 0) return [];
    const speaker = pickSpeaker(bots);

    const key = resolveKey(base, speaker.id);
    const pool: string[] | undefined = PERSONALITIES[speaker.personality].lines[key];
    if (!pool || pool.length === 0) return [];

    const last = this.lastLineByPersonality.get(speaker.personality);
    const candidates = pool.length > 1 ? pool.filter((l) => l !== last) : pool;
    const template = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastLineByPersonality.set(speaker.personality, template);

    return [{ speakerId: speaker.id, personality: speaker.personality, text: fillTemplate(template, event, state) }];
  }
}

// Re-exported for convenience — callers that only need the key/type shape (e.g. hint text)
// don't need to reach into './personalities.js' directly.
export type { Personality };
