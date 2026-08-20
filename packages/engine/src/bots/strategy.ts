import { getLegalActions, handSize } from '../rules.js';
import { trickWinnerPlayerId } from '../scoring.js';
import { BidAction, Card, GameState, PlayCardAction, PlayerAction, RANK_VALUES, Suit, SUITS } from '../types.js';

/**
 * Heuristic bidding + card-play scorer shared by the bots and the human hint generator —
 * fast rules of thumb, not a full expected-value search (see the "v1 heuristic" framing used
 * across the rest of the series). Good enough to be a real opponent, not good enough to be
 * unbeatable.
 */
export interface ScoredAction {
  action: PlayerAction;
  score: number;
  reason: ReasonTag;
}

export type ReasonTag = 'onlyOption' | 'safeBid' | 'nilBid' | 'winCheap' | 'duckLow' | 'discardSafe' | 'deferToPartner';

function cardsBySuit(hand: Card[]): Record<Suit, Card[]> {
  const bySuit: Record<Suit, Card[]> = { S: [], H: [], D: [], C: [] };
  for (const c of hand) bySuit[c.suit].push(c);
  for (const suit of SUITS) bySuit[suit].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  return bySuit;
}

/** Rough "how many tricks does this hand look like it's worth" estimate: an Ace almost
 * always wins eventually, a King or Queen wins often enough IF it's not sitting alone in its
 * suit (nothing to protect it from being forced out early), and every spade — even a low one
 * — carries some late-hand trump potential the longer the hand goes. Ignores what anyone
 * else might be holding entirely; this is a solo read of the hand, same spirit as the
 * simpler heuristics used elsewhere in the series.
 *
 * The raw card-strength count below is implicitly calibrated for a 4-player table (3
 * opponents contesting every trick) — a mediocre card wins a lot more often with only 1 or 2
 * opponents instead of 3, since there's less competition for the same trick. Rescaled by
 * `fairShareScale` so bidding stays sane at every table size: a hand worth "average" gets
 * scaled to roughly this table's actual fair share of the tricks on offer (handSize /
 * playerCount) rather than always landing near the 4-player fair share regardless of how many
 * are actually at the table. Without this, bots at a 2-player table drastically underbid every
 * single hand (only ~half the tricks a 4-player hand of the same cards would suggest, when
 * really a 2-player hand should expect roughly double), racking up huge bag penalties hand
 * after hand and never converging toward the target score. */
function estimateTricks(hand: Card[], playerCount: number, handCardCount: number): number {
  const bySuit = cardsBySuit(hand);
  let estimate = 0;

  for (const suit of ['H', 'D', 'C'] as const) {
    const cards = bySuit[suit];
    if (cards[0]?.rank === 'A') estimate += 1;
    if (cards[1]?.rank === 'K') estimate += 1;
    if (cards[2]?.rank === 'Q') estimate += 0.5;
  }

  bySuit.S.forEach((c, i) => {
    // The top few spades in sequence from the very top of the suit (A, then K, then Q, ...)
    // are close to guaranteed; anything past that is just long-spade potential.
    estimate += RANK_VALUES[c.rank] >= 14 - i ? 1 : 0.3;
  });

  const fairShareScale = handCardCount / playerCount / (13 / 4);
  return estimate * fairShareScale;
}

/** Higher = riskier to bid Nil on this hand. Every spade is inherently dangerous (they're
 * trump — hard to avoid winning with one eventually), and so is a high card sitting with
 * little cover in its own suit (nothing lower to hide behind if that suit gets led early).
 * Scaled by the same `fairShareScale` as estimateTricks — a card is more likely to win a
 * trick (and so more dangerous to be holding on a Nil bid) the fewer opponents there are to
 * contest it. */
function nilRisk(hand: Card[], fairShareScale: number): number {
  const bySuit = cardsBySuit(hand);
  let risk = bySuit.S.length * 1.5;
  for (const suit of ['H', 'D', 'C'] as const) {
    bySuit[suit].forEach((c, i) => {
      const value = RANK_VALUES[c.rank];
      if (value >= 12 && i < 2) risk += value - 9;
    });
  }
  return risk * fairShareScale;
}

function scoreBids(state: GameState, seatIndex: number, legal: BidAction[]): ScoredAction[] {
  const hand = state.players[seatIndex].hand;
  const max = handSize(state);
  const fairShareScale = max / state.players.length / (13 / 4);
  const estimate = estimateTricks(hand, state.players.length, max);
  const rounded = Math.max(0, Math.min(max, Math.round(estimate)));
  const safeForNil = estimate < 1.2 && nilRisk(hand, fairShareScale) <= 3;

  return legal.map((a) => {
    if (a.value === 'nil') {
      return { action: a, score: safeForNil ? 95 : -200, reason: 'nilBid' };
    }
    const diff = Math.abs(a.value - rounded);
    return { action: a, score: 100 - diff * 20, reason: 'safeBid' };
  });
}

function scoreCardPlays(state: GameState, seatIndex: number, legal: PlayCardAction[]): ScoredAction[] {
  const player = state.players[seatIndex];
  const iAmNil = player.bid === 'nil';
  const tricksNeeded = typeof player.bid === 'number' ? Math.max(0, player.bid - player.tricksWon) : 0;

  if (state.trick.length === 0) {
    // Leading a fresh trick: a Nil bidder always leads their lowest, safest card. Otherwise,
    // lead a probable winner (an Ace or King) cheaply while tricks are still needed;
    // otherwise just lead low and see what develops.
    return legal.map((a) => {
      if (iAmNil) return { action: a, score: 1000 - RANK_VALUES[a.card.rank], reason: 'duckLow' };
      const looksLikeAWinner = a.card.suit !== 'S' && (a.card.rank === 'A' || a.card.rank === 'K');
      if (tricksNeeded > 0 && looksLikeAWinner) {
        return { action: a, score: 500 - RANK_VALUES[a.card.rank], reason: 'winCheap' };
      }
      return { action: a, score: 200 - RANK_VALUES[a.card.rank], reason: 'discardSafe' };
    });
  }

  const ledSuit = state.ledSuit!;
  const currentWinnerId = trickWinnerPlayerId(state.trick, ledSuit);
  const currentBest = state.trick.find((t) => t.playerId === currentWinnerId)!.card;

  // Partners mode only: is the trick currently sitting with my own teammate? Group membership
  // (not the mode flag) is what decides this — Cutthroat groups are solo (see buildGroups), so
  // partnerId is always undefined there and none of the logic below ever engages.
  const myGroup = state.groups.find((g) => g.playerIds.includes(player.id))!;
  const partnerId = myGroup.playerIds.find((id) => id !== player.id);
  const partnerIsWinning = partnerId !== undefined && currentWinnerId === partnerId;
  // Seats still to act after mine this trick — if that's zero, the trick is already safe the
  // instant I play (nobody left to snipe it from my partner), so there's never anything to
  // defend. Otherwise it's genuinely at some unknown risk from whoever plays after me.
  const seatsStillToAct = state.players.length - state.trick.length - 1;
  const groupTricksStillNeeded = myGroup.playerIds
    .map((id) => state.players.find((p) => p.id === id)!)
    .reduce((sum, m) => sum + (typeof m.bid === 'number' ? Math.max(0, m.bid - m.tricksWon) : 0), 0);
  // Overtaking a partner who's already winning only ever makes sense as insurance against
  // someone still to act snatching the trick away from the team — and that insurance is only
  // worth spending a good card on when either the team still needs the trick toward its
  // COMBINED bid (bidding/scoring is per-group, not per-player — see scoreGroupHand — so it
  // doesn't matter which of us actually takes it) or bags don't cost anything this match
  // anyway (simplifiedScoring), so there's no downside to playing it safe. Otherwise: never
  // take a trick my partner's already got locked up — no benefit either way, just a wasted
  // card that could've won something later.
  const worthDefendingPartnersTrick = seatsStillToAct > 0 && (state.rules.simplifiedScoring || groupTricksStillNeeded > 0);

  return legal.map((a) => {
    const wins = cardBeats(a.card, currentBest, ledSuit);

    if (iAmNil) {
      // Winning is the one thing a Nil bidder can never afford — heavily penalized even when
      // it's the only card that follows suit (isActionLegal already guarantees this list is
      // never empty, so "least bad" still gets picked). Applies even when it's my own partner
      // winning: a Nil bid is a solo promise, not a team one.
      return { action: a, score: wins ? -1000 + RANK_VALUES[a.card.rank] : 1000 - RANK_VALUES[a.card.rank], reason: 'duckLow' };
    }

    const overtakingPartner = wins && partnerIsWinning;
    if (overtakingPartner && !worthDefendingPartnersTrick) {
      // My partner already has this trick — taking it myself instead buys the team nothing
      // (same trick, same team either way) and just burns a card that could win a later one.
      // Ranked below every legal duck, same as any trick I'm not trying to win; only played
      // when literally forced (nothing in hand loses to my partner's card either).
      return { action: a, score: 10 - RANK_VALUES[a.card.rank], reason: 'deferToPartner' };
    }

    const wantsThisTrick = tricksNeeded > 0 || (overtakingPartner && worthDefendingPartnersTrick);
    if (wins && wantsThisTrick) {
      return { action: a, score: 500 - RANK_VALUES[a.card.rank], reason: 'winCheap' };
    }
    if (!wins) {
      // Ducking: prefer shedding the LOWEST card that still loses, keeping stronger cards in
      // hand for tricks they can actually win later — this matters most for spades
      // specifically, since as trump they only get MORE likely to win a trick as higher ones
      // get played out (playing a King here right after someone's Ace is pure waste: it can't
      // win this trick either way, and now it's not around to win a future one as the
      // new-highest spade).
      return { action: a, score: 100 - RANK_VALUES[a.card.rank], reason: 'discardSafe' };
    }
    // Wins, but the bid's already met (or there was never a numeric bid needing more tricks)
    // — an extra trick here is a bag, not a gain, so this ranks BELOW every legal duck (never
    // above, at any rank — a forced Ace is still worse than a free 2 that loses). Still scored
    // internally by rank so that when winning truly can't be avoided (everything in hand beats
    // the board), the cheapest winner gets picked over the most wasteful one.
    return { action: a, score: 10 - RANK_VALUES[a.card.rank], reason: 'winCheap' };
  });
}

/** True if `candidate` would currently win the trick against `currentBest` (the strongest
 * card played so far) — spades always beat non-spades, higher spade beats lower spade,
 * otherwise only a higher card of the LED suit can win. */
function cardBeats(candidate: Card, currentBest: Card, ledSuit: Suit): boolean {
  const candidateIsSpade = candidate.suit === 'S';
  const bestIsSpade = currentBest.suit === 'S';
  if (candidateIsSpade !== bestIsSpade) return candidateIsSpade;
  if (candidateIsSpade && bestIsSpade) return RANK_VALUES[candidate.rank] > RANK_VALUES[currentBest.rank];
  if (candidate.suit !== ledSuit) return false;
  return RANK_VALUES[candidate.rank] > RANK_VALUES[currentBest.rank];
}

/** Scores every legal action for `seatIndex` and returns them best-first. This is the one
 * "brain" behind both the human hint button and every bot's play — difficulty (see
 * chooseBotAction below) only changes how reliably a bot acts on this ranking, never the
 * ranking itself. */
export function scoreActions(state: GameState, seatIndex: number): ScoredAction[] {
  const legal = getLegalActions(state, seatIndex);
  if (legal.length === 0) return [];
  if (legal.length === 1) return [{ action: legal[0], score: 0, reason: 'onlyOption' }];

  const scored =
    state.phase === 'bidding'
      ? scoreBids(state, seatIndex, legal as BidAction[])
      : scoreCardPlays(state, seatIndex, legal as PlayCardAction[]);

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** Always the single best-ranked move — this is what the "What should I play?" hint uses, so
 * a hint is never sandbagged and never wrong about what the strongest play actually is. */
export function chooseBestAction(state: GameState, seatIndex: number): ScoredAction | null {
  const scored = scoreActions(state, seatIndex);
  return scored[0] ?? null;
}

export type BotDifficulty = 'easy' | 'normal' | 'hard';

/**
 * Picks a bot's actual move for a given difficulty, drawing from the exact same ranking a
 * hint would use — difficulty only changes how consistently the bot acts on it:
 *  - 'hard' always takes the top-ranked option — a genuinely sharp opponent.
 *  - 'normal' usually takes the best option but sometimes settles for the next-best or an
 *    outright weaker one — competent, beatable.
 *  - 'easy' takes the best option less than half the time — forgiving, good for a newer or
 *    younger player.
 */
export function chooseBotAction(
  state: GameState,
  seatIndex: number,
  difficulty: BotDifficulty = 'normal',
  rng: () => number = Math.random,
): ScoredAction | null {
  const scored = scoreActions(state, seatIndex);
  if (scored.length === 0) return null;
  if (difficulty === 'hard' || scored.length === 1) return scored[0];

  const roll = rng();
  if (difficulty === 'normal') {
    if (roll < 0.72) return scored[0];
    if (roll < 0.92 && scored.length > 1) return scored[1];
    return scored[Math.floor(rng() * scored.length)];
  }

  // easy
  if (roll < 0.35) return scored[0];
  if (roll < 0.65) return scored[Math.floor(rng() * Math.min(3, scored.length))];
  return scored[Math.floor(rng() * scored.length)];
}
