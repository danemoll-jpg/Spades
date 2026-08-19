// Runs a CommentaryProvider over a batch of new engine events. Awaits each call since the
// CommentaryProvider interface allows an async provider (e.g. a future Claude-powered one),
// even though the default TemplateCommentaryProvider resolves synchronously.
import { CommentaryLine, CommentaryProvider, GameEvent, GameState } from '@spades/engine';

export async function commentaryForEvents(
  provider: CommentaryProvider,
  events: GameEvent[],
  state: GameState,
): Promise<CommentaryLine[]> {
  const lines: CommentaryLine[] = [];
  for (const event of events) {
    lines.push(...(await provider.onEvent(event, state)));
  }
  return lines;
}
