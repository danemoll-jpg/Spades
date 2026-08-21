// A single shared top-10 leaderboard across every device/room — one Firestore document
// (leaderboard/global) so every client's realtime listener sees the same list. Ranked by
// FEWEST hands to win, ascending — same "lowest wins" direction as the rest of the series'
// leaderboards. Final score isn't a useful ranking metric here the way it is in, say, Par
// Five: a match always ends the moment someone crosses the fixed 500-point target, so every
// winner's score clusters in the same narrow band just past 500 regardless of how well they
// actually played — how many HANDS it took to get there is what actually reflects skill (sharp
// bidding, few bags, converting your bids cleanly). Humans only, and only the WINNING side —
// see useLocalGame.ts/useOnlineRoom.ts, which filter to just the winning group's human players
// (a losing player has no "hands to win" to record) before ever calling
// addScoresToGlobalLeaderboard, so the board reflects real players' actual wins, not however
// well the heuristic bot strategy happens to play. In Partners mode both partners share the
// same win, so both get an entry with the same hand count.
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

const LEADERBOARD_REF = doc(db, 'leaderboard', 'global');
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  name: string;
  /** How many hands the match took, start to finish, for this win — lower is better. */
  handsToWin: number;
  date: string;
  isAi: boolean;
}

/** True for an entry that can actually be ranked. Guards against a handful of legacy entries
 * that made it into the shared document with a missing/invalid `handsToWin` (an old write path
 * bug, since fixed) — `combined.sort((a, b) => a.handsToWin - b.handsToWin)` below returns NaN
 * for those, which most engines' sort treats as "leave roughly where it already was" rather
 * than "put it last," so a garbage entry could land anywhere, including displacing real ranks
 * near the top and skipping past #2 straight to #3/#4 in the UI's tie-aware rank numbering.
 * Filtering them out — both here (every read) and again in addScoresToGlobalLeaderboard (every
 * write) — self-heals the shared document the next time anyone wins a match, and keeps the
 * display honest even before that happens. */
function isValidEntry<T extends Partial<LeaderboardEntry>>(e: T | null | undefined): e is T {
  return (
    !!e &&
    typeof e.name === 'string' &&
    e.name.trim().length > 0 &&
    typeof e.handsToWin === 'number' &&
    Number.isFinite(e.handsToWin) &&
    e.handsToWin > 0
  );
}

/** Calls callback(entries) immediately with whatever's cached/known, then again on every
 * change. Returns an unsubscribe function. */
export function subscribeToGlobalLeaderboard(callback: (entries: LeaderboardEntry[]) => void): () => void {
  return onSnapshot(LEADERBOARD_REF, (snap) => {
    const raw = snap.exists() ? (snap.data().entries as LeaderboardEntry[]) || [] : [];
    callback(raw.filter(isValidEntry));
  });
}

/** results: one finished match's winning hand-count for every human player on the winning
 * side, saved together (ranking everyone against the SAME merged list, not one at a time, so
 * whoever gets processed first doesn't end up with an incorrectly-good rank). Returns an array
 * of ranks (1-based, or null if that result didn't make the top 10) in the same order as
 * `results`. */
export async function addScoresToGlobalLeaderboard(
  results: Array<{ name: string; handsToWin: number; isAi: boolean }>,
): Promise<Array<number | null>> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(LEADERBOARD_REF);
    const rawExisting: (LeaderboardEntry & { _id?: string })[] = snap.exists() ? snap.data().entries || [] : [];
    // Drop any legacy invalid entries here too — this is what actually cleans the shared
    // document up, since every future win writes through this path (see isValidEntry's comment).
    const existing = rawExisting.filter(isValidEntry);
    const date = new Date().toISOString().slice(0, 10);
    const tagged = results.map((r, i) => ({
      ...r,
      date,
      _id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    }));
    const combined = [...existing, ...tagged];
    combined.sort((a, b) => a.handsToWin - b.handsToWin); // fewest hands first — fastest win ranks best
    const trimmed = combined.slice(0, MAX_ENTRIES);
    tx.set(LEADERBOARD_REF, { entries: trimmed });
    return tagged.map((t) => {
      const madeTheCut = trimmed.some((e) => e._id === t._id);
      return madeTheCut ? combined.filter((e) => e.handsToWin < t.handsToWin).length + 1 : null;
    });
  });
}
