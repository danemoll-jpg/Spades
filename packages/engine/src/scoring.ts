import {
  BAG_PENALTY,
  BAG_PENALTY_THRESHOLD,
  NIL_BONUS,
  PlayerState,
  RANK_VALUES,
  ScoringGroup,
  Suit,
  TrickCard,
} from './types.js';

/** Which player won a completed trick: highest spade if any were played (spades are always
 * trump in Spades — there's no separate configurable trump suit, unlike Durak), else highest
 * card of the suit that was led. */
export function trickWinnerPlayerId(trick: TrickCard[], ledSuit: Suit): string {
  const spadesPlayed = trick.filter((t) => t.card.suit === 'S');
  const contest = spadesPlayed.length > 0 ? spadesPlayed : trick.filter((t) => t.card.suit === ledSuit);
  return contest.reduce((best, t) => (RANK_VALUES[t.card.rank] > RANK_VALUES[best.card.rank] ? t : best)).playerId;
}

export interface HandGroupResult {
  groupId: string;
  handScore: number;
  bagsAdded: number;
  /** The group's running total AFTER this hand — same number `group.score` now holds. */
  total: number;
}

/** Scores one group's hand and mutates `group` in place (score/bags/handScores) — the
 * group's combined bid (sum of its non-nil members' bids) against their combined non-nil
 * tricks, PLUS each nil bidder scored independently at +/-100, PLUS whatever bags either of
 * those produces folded into the group's running bag count (crossing the threshold costs
 * -100 and wraps, same rule either way). Works identically for a Cutthroat "group" of one
 * player or a Partners group of two — see ScoringGroup's doc comment. */
export function scoreGroupHand(group: ScoringGroup, members: PlayerState[], simplifiedScoring: boolean): HandGroupResult {
  const nilMembers = members.filter((m) => m.bid === 'nil');
  const bidMembers = members.filter((m) => m.bid !== 'nil');
  const combinedBid = bidMembers.reduce((sum, m) => sum + (m.bid as number), 0);
  const combinedTricks = bidMembers.reduce((sum, m) => sum + m.tricksWon, 0);

  let handScore = 0;
  let bagsAdded = 0;

  // A group where EVERY member bid nil has no combined bid to make or set — only the nil
  // bonuses/penalties below apply.
  if (bidMembers.length > 0) {
    if (combinedTricks >= combinedBid) {
      handScore += combinedBid * 10;
      bagsAdded += combinedTricks - combinedBid;
    } else {
      // Set (failed to make the bid): lose the whole amount, no partial credit, and none of
      // those tricks count as bags — you simply didn't make it.
      handScore -= combinedBid * 10;
    }
  }

  for (const nilPlayer of nilMembers) {
    if (nilPlayer.tricksWon === 0) {
      handScore += NIL_BONUS;
    } else {
      // Failed nil: the bonus flips to a penalty, and — since these tricks were never part of
      // any bid — every one of them becomes an unplanned bag for the group.
      handScore -= NIL_BONUS;
      bagsAdded += nilPlayer.tricksWon;
    }
  }

  group.bags += bagsAdded;
  if (simplifiedScoring) {
    // Bags are still tracked for the scorecard even under the simplified house rule — they
    // just never cost anything. Keep the counter from growing unbounded (purely cosmetic).
    group.bags = group.bags % BAG_PENALTY_THRESHOLD;
  } else {
    while (group.bags >= BAG_PENALTY_THRESHOLD) {
      handScore -= BAG_PENALTY;
      group.bags -= BAG_PENALTY_THRESHOLD;
    }
  }

  group.score += handScore;
  group.handScores.push(handScore);

  return { groupId: group.id, handScore, bagsAdded, total: group.score };
}
