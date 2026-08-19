# Spades ♠️

A web version of **Spades** — bid how many tricks you'll take (or Nil, for zero), then go make
it. Spades are always trump. First player or team to 500 points wins.

Includes:
- **2, 3, or 4 players**, any mix of humans and bots. At exactly 4 players, optional
  **Partners mode** pairs seats 1+3 against seats 2+4 and scores them as two teams instead of
  four individuals — everywhere else (2 or 3 players) it's Cutthroat: everyone for themselves.
- Full standard rules by default — **Nil bids** (+100 if you take zero tricks all hand, -100
  if you don't) and the **bag penalty** (-100 every 10 bags accumulated) — with an optional
  **Simplified scoring** house rule that turns both off for a more straightforward
  bid-and-make-it game.
- **Online play**: create a room, share the 4-letter code, and play a real match with up to 3
  friends from anywhere — synced live via Firestore, no server to run or keep alive.
- **Up to 3 bots at once** — play fully solo against a full table if you want. The first two
  bot seats get a named personality with their own commentary voice: **Gus** (old-school,
  unbothered, never rushes) and **Mabel** (runs the table like she's hosted game night every
  Thursday for forty years). Any further bot seat plays the exact same heuristic strategy,
  just with a plain generic name and no commentary lines of its own. Bot difficulty
  (Easy/Normal/Hard) is adjustable in both local and online play.
- A **"What should I play?" hint button** — powered by the exact same logic the bots use, so
  it never suggests an illegal move.
- **Snarky commentary** that reacts to what's happening at the table — Nil bids, spades
  breaking, and the final result.
- A **shared top-10 leaderboard** (highest score toward 500 wins, humans only — bot scores
  never get submitted), with a "New Record" badge when a match's final score lands on it.
- A live **scorecard** (📋 button, any time) showing every group's running score and bags,
  plus the current hand's bids vs. tricks taken.
- **Sound effects** — synthesized in the browser via the Web Audio API (no audio files to
  ship). Mute anytime with the 🔊 button, top-right.
- A **"Game Hub"** link (top-left / match-over screen) back to the launcher for this whole
  series of games.

## Quick start

```bash
npm install
npm run dev
```

That builds the shared game engine, then starts the Vite dev server for the client (no
separate backend process — the app is a pure static site). The terminal will print the URL —
Vite defaults to `http://localhost:5173`, but picks the next free port (5174, 5175, …) if
that one's taken.

Local (vs-bots) play works immediately with zero setup, including a full 4-seat table (you +
3 bots) with Partners mode on. Online play and the leaderboard need a Firebase project's
config filled into `packages/client/src/network/firebase.ts` first — see "Deploying" below;
until then, "Play online" will fail to create/join a room, and the leaderboard button will
just show
"Loading…" forever.

### Tests

```bash
npm run test
```

Runs the engine's test suite: bidding/play legality checks (follow-suit, spades-breaking,
Nil), scoring math (bid made/set, bags, the bag penalty, Nil bonus/penalty, Partners vs.
Cutthroat grouping), and simulated full matches (bots playing bots — 2/3/4-player tables and
Partners mode, several seeds each) that assert card conservation at every step and every match
terminates with a valid winner.

## How to play (short version)

- Each hand, everyone bids how many tricks they'll take — or Nil, betting on exactly zero.
- Spades are always trump. You can't lead a spade until one's been played (or it's all you
  have left in hand).
- Follow the suit that was led if you can; otherwise play anything, including a spade.
- Made your bid? 10 points per trick bid, plus 1 per extra trick ("bag"). Missed it? Lose 10
  points per trick bid, no partial credit.
- 10 bags accumulated costs a 100-point penalty and resets the bag count.
- Nil made is worth +100; Nil failed costs -100 (and any tricks it wins become bags).
- At exactly 4 players, turn on Partners to play 2v2 — you and your partner share one bid and
  one score.
- First to 500 points wins.

Click **"What should I play?"** any time it's your turn if you want a suggested move and why.

## Project structure

```
packages/
  engine/   Pure game logic — rules, state machine, scoring, bot strategy, hints, and
            commentary. No UI or network dependencies; fully unit-tested (vitest).
  client/   React + Vite UI. No backend of its own:
            - Local (vs-bots) play runs the engine directly in the browser
              (src/hooks/useLocalGame.ts).
            - Online play syncs through a shared Firestore document
              (src/network/, src/hooks/useOnlineRoom.ts).
```

The engine is deliberately framework-free so the exact same "what moves are legal right now"
and "what's the best move" logic is shared by local play, online play, the bots, and the
human hint feature — a hint can never suggest something illegal, and a bot can never cheat by
seeing a card nobody's played yet.

### A note on bot strength at smaller tables

The bots' hand-strength heuristic (`packages/engine/src/bots/strategy.ts`) is rescaled by a
`fairShareScale` factor for the table size in play. A given set of cards is worth noticeably
more tricks with only 1 or 2 opponents contesting them than with 3 — without that scaling,
bots at a 2- or 3-player table underbid badly and never converge toward 500. Every full-match
test in the suite covers 2p, 3p, and 4p tables specifically because of this.

## How online play is synced

There's no custom backend — every connected browser talks directly to a shared Firestore
document at `rooms/{code}` (same approach as the author's other projects in this series):

- **Single writer per turn**: whoever's turn it is computes their move locally with the same
  engine code as local play, then writes the resulting state to the room. Everyone else's
  live subscription picks it up.
- **Only the host's browser drives bot turns** — avoids two clients racing to step the same
  bot's move, batching consecutive bot actions into one Firestore write per real turn
  boundary.
- **Readying up between hands is the one exception to "single writer"**: any number of human
  players can legitimately click "Next hand" within the same pause, so that action goes
  through a Firestore transaction instead of a blind overwrite — see
  `sendReadyForNextHand` in `src/network/rooms.ts`.
- **Sound cues** are deterministic given the event log, so every client re-derives and plays
  them independently — no sync needed. **Commentary** is randomized (which bot speaks, which
  canned line), so it's computed once by whoever wrote the move and shared via the room doc,
  so every player sees the same reaction.
- **The host submits final scores to the leaderboard** exactly once per finished match — a
  match's scores don't get added once per connected device.

### Hand privacy

Your own hand is fully known to you and hidden from everyone else in the UI, but the room
document still holds the *full* authoritative game state (every player's hand), because
that's what every browser needs to sync the match. There's no Auth/Cloud-Functions-based
redaction in place — a technically determined player could read the raw Firestore document
instead of the redacted view the UI shows them. Same accepted tradeoff every other project in
this series makes for hidden hands/cards — fine for a casual game against friends, not a
competitive-integrity guarantee against strangers. See `firestore.rules` for the same caveat
in the security-rules comments.

## Deploying

1. **Firebase**: create a project at [console.firebase.google.com](https://console.firebase.google.com),
   enable **Firestore** (Standard edition). In Project Settings → General → Your apps, add a
   Web app and copy its config object into `packages/client/src/network/firebase.ts` (it
   currently has `REPLACE_ME` placeholders). Then paste this repo's `firestore.rules` into
   Firestore → Rules → Publish.
2. **Build**: `npm run build` (root) builds the engine, then the client to
   `packages/client/dist`.
3. **Host the static build** anywhere that serves static files — Netlify, Vercel, GitHub
   Pages, Cloudflare Pages, etc. all work with zero server-side config since this is a plain
   static site. For Netlify specifically: this repo's `netlify.toml` already has the build
   command and publish directory set — just "Import from Git" and deploy.

No environment variables are needed at build time — the Firebase web config isn't a secret
(access control is enforced by `firestore.rules`, not by hiding the config), so it just gets
committed directly in `firebase.ts` once you've filled it in.

## Extending this later

- **Claude-powered commentary**: bot lines currently come from `TemplateCommentaryProvider`
  (`packages/engine/src/commentary/templateProvider.ts`), which picks randomized canned lines
  — no API key, no network calls. It implements the `CommentaryProvider` interface
  (`packages/engine/src/commentary/types.ts`); a `ClaudeCommentaryProvider` implementing that
  same interface (calling the Claude API, e.g. Haiku, with the game event as context) can be
  swapped in wherever `new TemplateCommentaryProvider()` is currently constructed
  (`useLocalGame.ts`, `useOnlineRoom.ts`), with no changes to game logic.
  See [claude.com/platform/api](https://claude.com/platform/api) for API keys.
- **More bot personalities**: only Gus and Mabel have a named personality (with their own
  commentary voice) today; a full table of bots still works past that — the 3rd/4th bot seat
  just uses a generic name from the pool in `packages/client/src/lib/players.ts`
  (`GENERIC_BOT_NAMES`/`nextBotName`) and never speaks. To give a 3rd or 4th bot its own
  personality and commentary lines instead, add an entry to `PERSONALITIES` in
  `packages/engine/src/commentary/personalities.ts` and to `BOT_PERSONALITIES`/
  `BOT_DISPLAY_NAMES` in `packages/client/src/lib/players.ts`.
- **Real access control on rooms**: swap the "anyone with the code can read/write" Firestore
  rules for Firebase Auth + Cloud Functions doing the actual writes server-side, if this ever
  needs to be trustworthy for strangers rather than just friends.

## A couple of simplifications versus some house rules

- **2-player Spades** here is straightforward "Cutthroat for two": 13 cards dealt to each of
  the two players, the other 26 sit unused in the kitty. No blind/widow-style dummy-hand
  mechanic some 2-player house rules use.
- Only one scoring convention is modeled for 3-player Spades: the 2♣ is removed so the deck
  splits evenly (17 cards each). Some tables instead deal a dummy hand or use a different
  removed-card convention — not modeled here.

Neither affects who ends up winning a well-played match — just some minor table-size flavor.
