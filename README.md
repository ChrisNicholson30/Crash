# Crash

The three-card hand game for 3 or 4 players, as an installable offline web app (PWA). You play against computer opponents.

## Rules

| | 4 players | 3 players |
|---|---|---|
| Cards each | 13 | 17 (1 card left undealt) |
| Hands of 3 | 4 (1 spare) | 5 (2 spare) |
| Points to win | 10 | 21 |

**Hands, best first:** Prile (three of a kind) · Stiff (three in a row, same suit) · Run (three in a row, any suit) · Flush (same suit) · Pair · High card.

- Same type: highest card wins, then the next. Aces are high (Q-K-A) or low (A-2-3); runs don't wrap (K-A-2).
- Arrange your hands in any order, in secret. All players reveal together.
- Each hand position is compared against **every** opponent's hand in the same position. Each win scores 1 point; an exact tie scores nothing.
- Spare cards are thrown away.
- First to the target wins. If several players cross it in one deal, the highest total wins; if they're level, play another deal.

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

- `src/engine/`: pure TypeScript rules (no UI). This covers cards and dealing, hand evaluation, scoring and game state, plus the computer player (`ai.ts`).
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
