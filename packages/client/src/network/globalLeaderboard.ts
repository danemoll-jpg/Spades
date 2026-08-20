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

/** Calls callback(entries) immediately with whatever's cached/known, then again on every
 * change. Returns an unsubscribe function. */
export function subscribeToGlobalLeaderboard(callback: (entries: LeaderboardEntry[]) => void): () => void {
  return onSnapshot(LEADERBOARD_REF, (snap) => {
    callback(snap.exists() ? (snap.data().entries as LeaderboardEntry[]) || [] : []);
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
    const existing: (LeaderboardEntry & { _id?: string })[] = snap.exists() ? snap.data().entries || [] : [];
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
