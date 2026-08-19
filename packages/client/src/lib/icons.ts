// Human player avatars — a small curated set the player picks from when they set their name
// (StartScreen for local play, OnlineHomeScreen for online). Kept separate from bot avatars
// (packages/engine/src/commentary/personalities.ts), which are fixed per personality since
// they're part of that character, not a per-player choice.
export const PLAYER_ICON_CHOICES = ['🙂', '😎', '🥸', '🧢', '🤠', '🐺', '🦊', '🐻', '🥷', '🎩'];

export const DEFAULT_PLAYER_ICON = PLAYER_ICON_CHOICES[0];
