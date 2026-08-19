import { BotPersonalityId, GameEvent, GameState } from '../types.js';

export interface CommentaryLine {
  speakerId: string;
  personality: BotPersonalityId;
  text: string;
}

/**
 * Swappable commentary source. `TemplateCommentaryProvider` (the default) picks randomized
 * canned lines with no network calls. A future `ClaudeCommentaryProvider` can implement this
 * same interface — using the Claude API to generate the line text instead — and be swapped in
 * via config, with zero changes to game logic.
 */
export interface CommentaryProvider {
  /**
   * Called after each engine event. Return commentary lines to surface (usually zero or
   * one), spoken by whichever bot(s) it makes sense for. `state` is the state *after* the
   * event.
   */
  onEvent(event: GameEvent, state: GameState): CommentaryLine[] | Promise<CommentaryLine[]>;
}
