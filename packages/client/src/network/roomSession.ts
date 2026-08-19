// Remembers "which room am I currently in" across a page refresh (or fully closing and
// reopening the browser) — separate from clientId.ts's permanent per-browser identity.
// Without this, a refresh mid-match wiped all in-memory React state (which room, which
// screen) with nothing to reconnect to: the host's browser refreshing to try to force a
// resync would instead get bounced back to the home screen with no way back in short of
// retyping a room code nobody had written down. Now a refresh — or reopening the tab days
// later — just re-subscribes to the same room and picks up wherever the match actually is.
const KEY = 'spadesRoomCode';

export function getSavedRoomCode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveRoomCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // localStorage unavailable (private browsing etc.) — refresh-to-resume just won't work,
    // no worse than before this feature existed.
  }
}

export function clearSavedRoomCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if it was never saved in the first place.
  }
}
