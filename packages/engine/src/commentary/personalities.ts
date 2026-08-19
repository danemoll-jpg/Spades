import { BotPersonalityId } from '../types.js';

export type CommentaryKey =
  | 'handStart'
  | 'nilBidSelf'
  | 'nilBidOther'
  | 'spadesBrokenSelf'
  | 'spadesBrokenOther'
  | 'matchWinSelf'
  | 'matchWinOther'
  | 'matchDraw';

export interface Personality {
  id: BotPersonalityId;
  displayName: string;
  avatar: string;
  tagline: string;
  lines: Record<CommentaryKey, string[]>;
}

export const PERSONALITIES: Record<BotPersonalityId, Personality> = {
  gus: {
    id: 'gus',
    displayName: 'Gus',
    avatar: '🎩',
    tagline: "Been playing this game since before you were born. Never bluffs, never rushes.",
    lines: {
      handStart: [
        "Hand {hand}. New cards, same principles.",
        "Deal 'em out. Hand {hand}.",
        "Alright, hand {hand}. Count your spades before you bid, folks.",
        "Hand {hand}. Take your time.",
      ],
      nilBidSelf: [
        "Nil. I know exactly what I'm doing.",
        "Zero tricks. Watch closely.",
        "I'll take my chances on nil.",
      ],
      nilBidOther: [
        "Nil, huh? Bold. We'll see.",
        "{player}'s going for nil. That's a real bet.",
        "Nil. Either brilliant or a disaster — no in between.",
      ],
      spadesBrokenSelf: [
        "Spades are in play now.",
        "Well, somebody had to break them. Might as well be me.",
      ],
      spadesBrokenOther: [
        "There it is — {player} broke spades.",
        "And the spades come out. Thanks, {player}.",
      ],
      matchWinSelf: [
        "That's the match. No surprises there.",
        "Five hundred. That's how it's done.",
      ],
      matchWinOther: [
        "Well played, {player}. You earned that.",
        "{player} takes it. Good game.",
      ],
      matchDraw: [
        "A tie. Well, that's a first.",
        "Dead even. Nobody's going to believe this.",
      ],
    },
  },
  mabel: {
    id: 'mabel',
    displayName: 'Mabel',
    avatar: '💎',
    tagline: "Runs the table like she's hosted this game every Thursday for forty years — because she has.",
    lines: {
      handStart: [
        "Hand {hand}! Let's see what everybody's holding.",
        "New hand, new hand! Number {hand}, here we go!",
        "Hand {hand}, and I'm feeling good about my cards already.",
        "Alright, hand {hand} — bid smart, people.",
      ],
      nilBidSelf: [
        "Nil! Watch me pull this off.",
        "Zero tricks, baby. I've got this in the bag.",
        "Nil — somebody's gotta live dangerously.",
      ],
      nilBidOther: [
        "{player} called NIL?! Oh, this I have to see.",
        "Nil! {player}'s feeling brave today.",
        "A nil bid! The nerve on this one.",
      ],
      spadesBrokenSelf: [
        "And I break the spades! You're welcome, everybody.",
        "Spades are OUT. Let's get interesting.",
      ],
      spadesBrokenOther: [
        "{player} broke the spades — now it's a real game!",
        "Ooh, spades are loose! Thanks for that, {player}.",
      ],
      matchWinSelf: [
        "Five hundred! I told you all I had this!",
        "That's a win, that's a WIN, thank you very much!",
      ],
      matchWinOther: [
        "Ugh, fine, {player}. Good game. GOOD game.",
        "{player} wins it! ...I still think I played better.",
      ],
      matchDraw: [
        "A TIE?! After all that?! Unbelievable.",
        "We're tied! Rematch. Right now.",
      ],
    },
  },
};
