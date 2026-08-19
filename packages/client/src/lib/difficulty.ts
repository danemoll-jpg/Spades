// Shared display info for the bot difficulty picker — used by both the local StartScreen and
// the online LobbyScreen, so the two never drift.
import { BotDifficulty } from '@spades/engine';

export const DIFFICULTY_OPTIONS: BotDifficulty[] = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY: BotDifficulty = 'normal';

export const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export const DIFFICULTY_DESCRIPTIONS: Record<BotDifficulty, string> = {
  easy: 'Forgiving — good for a newer or younger player.',
  normal: 'Competent, beatable — a casual kitchen-table player.',
  hard: 'Bids sharp and never wastes a trick. A real fight.',
};
