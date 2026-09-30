# Crash: Cloudflare Workers Setup

How Crash runs on Cloudflare, and how to get it live. The app itself is static files, and one Worker adds the online side. That covers accounts, friends, invites, messages and live tables.

## 1. What runs where

| Piece | Cloudflare product | Where in the repo |
|---|---|---|
| The app (PWA) | Workers static assets | `dist/` (built by Vite), headers in `public/_headers` |
| API: `/api/*` | Worker | `worker/index.ts` |
| Passwords and sessions | Worker (Web Crypto) | `worker/auth.ts` |
| Accounts, friends, invites, messages, table history | **D1** (SQL database) `crash-db` | `migrations/0001_init.sql` |
| Live tables (one per pairing code) | **Durable Object** `GameRoom`, WebSockets | `worker/room.ts` |
| Rules engine (shared by app and server) | — | `src/engine/` |

Only `/api/*` runs Worker code (`run_worker_first`). Every other request is a free static-asset hit.

### Security notes

- **Passwords** are hashed with PBKDF2-SHA256: 100,000 iterations (the Workers maximum) and a unique salt per user. Logins take the same time whether or not the username exists, so response times don't reveal valid usernames.
- **Sessions** use a random 256-bit token in an `HttpOnly; Secure; SameSite=Lax` cookie. The database stores only its SHA-256 hash, and sessions expire after 30 days.
- **Cross-site requests:** writes must be JSON, and requests from another site (checked via the `Origin` header) are refused.
- **The server holds the real game.** Each player receives only their own cards, and other players' hands are blanked until they're turned over. So nobody can cheat by inspecting network traffic.
- **Timeouts:** if a player goes quiet, the server acts for them after a timeout, so one person can't stall the table.

## 2. Current status

| Item | State |
|---|---|
| D1 database `crash-db` | **Created** in your account (Western Europe), id `dd8df0ae-f8e1-4132-9a1b-b7b6a5a3e8a9` |
| Schema | **Applied** to the live database |
| `wrangler.jsonc` | Points at that database; declares the `GameRoom` Durable Object |
| Preview D1 database `crash-preview-db` | **Created** in Western Europe, id `ba4744cc-dde2-4f8f-b4b6-17d81cdcc811`; separate from production |

## 3. Deploy

The Durable Object and the Worker are created on the first deploy. Choose one of these:

### A. Workers Builds (recommended): deploys on every push

1. Cloudflare dashboard: **Workers & Pages** → **Create** → **Import a repository** → `ChrisNicholson30/Crash`.
2. Build settings:

| Setting | Value |
|---|---|
| Worker name | `crash` (must match `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `npx wrangler d1 migrations apply crash-db --remote && npx wrangler deploy` |
| Preview command | `npx wrangler preview` |
| Environment variable | `NODE_VERSION` = `22` |

3. Save and deploy. The site goes live at `https://crash.<your-subdomain>.workers.dev`.

Pull-request previews use `crash-preview-db` through the `previews` block in `wrangler.jsonc`; they never bind to the production D1 database. Each preview also gets its own Durable Object namespace. When adding a D1 migration, apply it to the preview database before deploying the preview:

```sh
npx wrangler d1 migrations apply PREVIEW_DB --remote --config wrangler.preview-migrations.jsonc
```

### B. From your own machine

```sh
pnpm install
npx wrangler login              # once; opens a browser
pnpm db:migrate:remote          # safe to re-run; the schema uses IF NOT EXISTS
pnpm build && npx wrangler deploy
```

### Custom domain (optional)

Worker `crash` → **Settings → Domains & Routes → Add → Custom domain**, for example `crash.cn-design.co.uk`. Invite links automatically use whichever domain people open.

## 4. Local development

| Command | What it does |
|---|---|
| `pnpm cf:dev` | Builds, applies migrations to the **local** database, and runs everything (app, API, live tables) at `localhost:8787` |
| `pnpm dev` | Vite with hot reload; it forwards `/api` to `localhost:8787`, so run `pnpm cf:dev` alongside it |
| `pnpm test` | Rules engine tests, covering Crash, sitting out, multiplayer and privacy |
| `node --experimental-transform-types scripts/online-smoke.ts` | API and live-table test against `localhost:8787` |
| `node scripts/e2e-online.mjs` | Two browsers sign up, pair by code, chat and play three deals |
| `node scripts/e2e-smoke.mjs http://localhost:8787/` | Solo game at phone size, plus offline reload |

Local data lives in `.wrangler/` (git-ignored). Nothing local touches the live database.

## 5. Pairing and invites

- **Table code:** the host taps *New table* and gets a 6-character code, e.g. `VTLHCH`. It uses 32 characters with no 0/O or 1/I, and uniqueness is checked. Friends enter it under **Join**.
- **Invite link:** *Share invite link* opens the phone's share sheet. Opening the link signs the person up or in, makes them friends with the host, and puts them straight at the table.
- **Friend invites:** from the lobby, *Invite* sends a friend a message with a **Join table** button.
- Empty seats are filled by computer players when the host deals.

## 6. Rollback

- **Dashboard:** Worker → **Deployments** → choose an earlier version → **Rollback**.
- **CLI:** `npx wrangler rollback`.
- Database changes are additive (`CREATE … IF NOT EXISTS`), so rolling the code back doesn't need a schema rollback.

#crash #cloudflare #workers #d1 #durable-objects #cn-design
