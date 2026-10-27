# Crash

The three-card hand game for 3 or 4 players, as an installable web app (PWA).

- **Play the computer** offline, at Easy, Normal or Hard.
- **Pass & play**: 2–4 people share one phone, with a hand-over screen before each private decision.
- **Play friends online**: pairing codes, invite links, messages, table chat (shown on the speaker's seat), presence, rejoin your open tables, watch friends' games, records and a friends leaderboard.
- **Game length**: Quick (one leg), Standard (first to 3 legs) or Full (first to 3 sets).
- **Hand odds**: win chance per hand, expected points and Crash chance while you build and bet.
- Sound, vibration and odds settings; your record against the computer; screen stays awake at the table.

## Rules

| | 4 players | 3 players |
|---|---|---|
| Cards each | 13 | 17 (1 card undealt) |
| Hands of 3 | 4 | 5 |

- **Hands, best first:** Prile (three of a kind) · Stiff (three in a row, same suit) · Run (three in a row) · Flush (same suit). Nothing else counts. Ties go to the highest card, then the next. A-2-3 is the best run (it beats Q-K-A), and runs don't wrap (K-A-2 isn't a run).
- **Order:** hands line up strongest first, weakest last. A hand you can't make can be **declined**; a declined hand loses to any real hand.
- **Play:** hands are played one at a time. Each hand is compared with every opponent's hand in the same position, and each win scores 1 point.
- **Betting:** everyone starts with 10,000 tokens. At the beginning of each deal, before any hand is revealed, choose a **bet** (at least 100 per playable hand) or **Crash**. That stake is locked and applied automatically to the remaining playable hands; the best hand takes each pot. You can bet on credit down to −5,000; reach that and you're out.
- **Crash:** on their opening betting turn, before hand 1 is revealed, a player can choose a stake and call Crash, predicting they'll win every hand. Everyone is told straight away.
  - Pull it off and each opponent pays you **half your chosen stake**.
  - Miss and you pay **half your chosen stake**, shared among the opponents, and sit out the rest of the leg.
  - Crash bets are at least 500.
- **Match:** first to 10 points wins a leg, 3 legs win a set, and 3 sets win the game. Being the last player standing also wins.

## Develop

```sh
pnpm install
pnpm dev                     # local dev server
pnpm test                    # rules engine tests (Vitest)
pnpm build                   # typecheck + production build to dist/
pnpm preview                 # serve the build (service worker active)
node scripts/e2e-smoke.mjs   # browser smoke test against `pnpm preview`
node scripts/e2e-passplay.mjs  # pass-and-play through the UI
pnpm cf:dev, then:
  node --experimental-transform-types scripts/online-smoke.ts   # API + live tables
  node scripts/e2e-online.mjs http://localhost:8787/            # two browsers play online
# Browser scripts take CHROMIUM_PATH if Playwright's own browser isn't installed.
pnpm icons                   # regenerate PNG icons from public/icon.svg
```

## Layout

- `src/engine/`: pure TypeScript rules (no UI). `match.ts` covers legs, sets, betting, Crash, debt and match options. `partition.ts` and `ai.ts` are the computer player (three skill levels) and the hand odds. `tally.ts` keeps records. `ai-tables.json` is regenerated with `pnpm ai:tables`.
- `src/ui/`: React screens and animations. `src/ui/online/` covers accounts, the online hub, messages and live tables.
- `src/net/`: API client and the live-table protocol.
- `worker/`: Cloudflare Worker (API and auth) and the `GameRoom` Durable Object (live tables, watchers, records). `migrations/` holds the D1 schema; `0002` adds presence, table membership and online records (the deploy command applies it).

## Deploy

Hosted on Cloudflare Workers as an assets-only Worker (`wrangler.jsonc`, `public/_headers`).

```sh
pnpm cf:dev      # build and serve through the Workers runtime on :8787
pnpm cf:check    # build and do a deploy dry run
pnpm cf:deploy   # build and deploy
```

For full setup (Git-connected Workers Builds, custom domain, rollback), see [`docs/cloudflare-workers-setup.md`](docs/cloudflare-workers-setup.md).

See `strike-crash-card-game-plan-2026-09-29.md` for the build plan and open decisions.
