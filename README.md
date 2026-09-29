# Crash

The three-card hand game for 3 or 4 players, as an installable offline web app (PWA). You play against computer opponents.

## Rules

| | 4 players | 3 players |
|---|---|---|
| Cards each | 13 | 17 (1 card undealt) |
| Hands of 3 | 4 | 5 |

- **Hands, best first:** Prile (three of a kind) · Stiff (three in a row, same suit) · Run (three in a row) · Flush (same suit). Nothing else counts. Ties go to the highest card, then the next. Aces are high (Q-K-A) or low (A-2-3, the lowest run), and runs don't wrap.
- **Order:** hands line up strongest first, weakest last. A hand you can't make can be **declined**; a declined hand loses to any real hand.
- **Play:** hands are played one at a time. Each hand is compared with every opponent's hand in the same position, and each win scores 1 point.
- **Betting:** everyone starts with 1,000 Barney tokens. Before each hand, players bet in turn into the pot, and the best hand among those who bet takes it. You can bet on credit down to −5,000; reach that and you're out.
- **Crash:** before hand 1, any player can call Crash, predicting they'll win every hand.
  - Pull it off and each opponent pays double their bets for the deal.
  - Miss and the caller pays each opponent double their own bets.
  - Crash callers must bet at least 50 on every hand.
- **Match:** first to 10 points wins a leg, 3 legs win a set, and 3 sets win the game. Being the last player standing also wins.

## Develop

```sh
pnpm install
pnpm dev                     # local dev server
pnpm test                    # rules engine tests (Vitest)
pnpm build                   # typecheck + production build to dist/
pnpm preview                 # serve the build (service worker active)
node scripts/e2e-smoke.mjs   # browser smoke test against `pnpm preview`
pnpm icons                   # regenerate PNG icons from public/icon.svg
```

## Layout

- `src/engine/`: pure TypeScript rules (no UI). `match.ts` covers legs, sets, betting, Crash and debt. `partition.ts` and `ai.ts` are the computer player. `ai-tables.json` is regenerated with `pnpm ai:tables`.
- `src/ui/`: React screens: setup, arranging hands, reveal, scoreboard.

## Deploy

Hosted on Cloudflare Workers as an assets-only Worker (`wrangler.jsonc`, `public/_headers`).

```sh
pnpm cf:dev      # build and serve through the Workers runtime on :8787
pnpm cf:check    # build and do a deploy dry run
pnpm cf:deploy   # build and deploy
```

For full setup (Git-connected Workers Builds, custom domain, rollback), see [`docs/cloudflare-workers-setup.md`](docs/cloudflare-workers-setup.md).

See `strike-crash-card-game-plan-2026-09-29.md` for the build plan and open decisions.
