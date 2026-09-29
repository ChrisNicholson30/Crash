# Crash: Cloudflare Workers Setup

How Crash is hosted on Cloudflare Workers, and the steps to get it live. Crash is a static app, so the Worker only serves the built files (Cloudflare calls this an *assets-only Worker*). There's no server code, no database and no secrets.

## 1. What's in the repo

| File | Purpose |
|---|---|
| `wrangler.jsonc` | Worker config: name `crash`, serves `./dist`, sends unknown paths to `index.html` |
| `public/_headers` | Response headers: security headers, 1-year caching for hashed files, no caching for the service worker |
| `package.json` → `cf:*` scripts | Build, run locally and deploy |
| `.gitignore` | Ignores `.wrangler/` and `.dev.vars*` |

### Key config decisions

- **Assets only.** `wrangler.jsonc` has no `main` entry, so Cloudflare serves files straight from `dist/`. Static asset requests are free and don't count towards Worker request limits.
- **`not_found_handling: "single-page-application"`.** Any unknown path returns the app with status 200, so a PWA launched from the home screen never gets a 404.
- **Service worker files are never cached.** `sw.js`, `registerSW.js`, `index.html` and `manifest.webmanifest` are all served with `Cache-Control: no-cache`. Without this, players could be stuck on an old version.
- **Hashed build files** (`/assets/*`) are cached for a year, because their names change on every build.
- **No Cloudflare Vite plugin.** Plain Wrangler serving `dist/` keeps the build separate from the PWA plugin. Add the Vite plugin only if Crash later needs server code, such as an online multiplayer API.

## 2. One-time setup

### Step 1: Cloudflare account

1. Sign in at dash.cloudflare.com with the CN-DESIGN LTD account.
2. Go to **Workers & Pages**. If you've never used Workers, pick a `*.workers.dev` subdomain when prompted.

### Step 2: Choose how it deploys

Option **A** is recommended.

| | A. Workers Builds (Git) | B. Deploy from your machine |
|---|---|---|
| How | Cloudflare builds and deploys on every push | You run `pnpm cf:deploy` |
| Secrets in GitHub | None | None |
| Previews | Automatic preview for each branch | Manual |
| Best for | Normal use | A first deploy or a quick fix |

### Step 3A: Workers Builds (recommended)

1. **Workers & Pages** → **Create** → **Import a repository**.
2. Connect GitHub and choose `ChrisNicholson30/Crash-`.
3. Enter these build settings:

| Setting | Value |
|---|---|
| Project / Worker name | `crash` (**must match `name` in `wrangler.jsonc`**, or the build fails) |
| Production branch | `main` |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` (default) |
| Root directory | `/` |

4. **Environment variables:** add `NODE_VERSION` = `22`. No other variables or secrets are needed.
5. Save. The first build runs straight away and the site goes live at `https://crash.<your-subdomain>.workers.dev`.
6. Optional: **Settings → Builds → Branch control**. Turn on preview builds so each branch gets its own preview URL.

### Step 3B: Deploy from your machine

```sh
pnpm install
npx wrangler login      # opens a browser once to authorise
pnpm cf:deploy          # build, then wrangler deploy
```

### Step 4: Custom domain (optional)

1. The domain must be a zone in the same Cloudflare account.
2. Worker `crash` → **Settings → Domains & Routes → Add → Custom domain**, e.g. `crash.cn-design.co.uk`.
3. Cloudflare creates the DNS record and the SSL certificate itself. Allow a few minutes.

Alternatively, add this to `wrangler.jsonc` and it will be applied on the next deploy:

```jsonc
"routes": [{ "pattern": "crash.cn-design.co.uk", "custom_domain": true }]
```

## 3. Everyday commands

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server with fast refresh. Use this for UI work (the service worker is off) |
| `pnpm cf:dev` | Build, then serve through the real Workers runtime at `localhost:8787`, with headers and routing as in production |
| `pnpm cf:check` | Build and do a deploy dry run. Validates the config without uploading anything |
| `pnpm cf:deploy` | Build and deploy to production |
| `node scripts/e2e-smoke.mjs http://localhost:8787/` | Browser smoke test against `cf:dev` |

## 4. Verified locally (2026-09-29, Wrangler 4.143.0)

| Check | Result |
|---|---|
| `wrangler deploy --dry-run` | 13 files read from `dist`, no bindings |
| `GET /` | 200, security headers present |
| `GET /some/deep/link` | 200, returns the app |
| `GET /sw.js`, `/manifest.webmanifest` | `Cache-Control: no-cache`; manifest has the correct content type |
| `GET /assets/*.js` | `max-age=31536000, immutable` |
| `GET /_headers` | Not served itself |
| Browser smoke test on `wrangler dev` | Full 3-player game played, fits the screen, loads offline, no errors |

## 5. After the first real deploy

1. Open the `workers.dev` URL on a phone → **Add to Home Screen**. It should launch full screen with the Crash icon.
2. Turn on airplane mode and relaunch. The game should still load.
3. Run a Lighthouse PWA/performance check, or use the website-performance-audit skill on the live URL.
4. Worker → **Observability**. Logs are switched on in `wrangler.jsonc`; confirm requests are showing up.

## 6. Rollback

- **Dashboard:** Worker → **Deployments** → choose an earlier version → **Rollback**.
- **CLI:** `npx wrangler rollback`.
- Rollbacks take effect straight away. The service worker picks up the rolled-back files on the next launch, because the service worker files aren't cached.

## 7. If Crash gets a server later (online multiplayer)

1. Add `"main": "./worker/index.ts"` and `"run_worker_first": ["/api/*"]` under `assets`.
2. Headers set in `_headers` don't apply to responses from Worker code, so set them in the Worker for `/api/*`.
3. Add bindings (Durable Objects for game rooms, D1 or Supabase for accounts) and secrets using `wrangler secret put`. Keep local values in `.dev.vars`, which is already git-ignored.

#crash #cloudflare #workers #deploy #cn-design
