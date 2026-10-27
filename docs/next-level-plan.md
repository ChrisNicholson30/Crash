# Crash — "Next level" plan

Date: 2026-10-27
Status: built on `claude/next-level` (all items NL-01 to NL-15).
Starting point: `main` at 690506a (solo vs computer, online tables with friends, chat, invites).

## Ground rules kept

- House rules unchanged (hands, betting, Crash, legs/sets).
- Look unchanged: black, red and silver; shark back; no emojis; no motion
  animations (`MotionGlobalConfig.skipAnimations` stays on).

## What was missing

| Area | Gap |
|---|---|
| Strategy | No sense of how strong a hand is, so betting and Crash calls are guesswork |
| Solo | One computer strength; one (long) match length; no way to play friends in the same room on one phone |
| Online | Socket gives up after ~30s; a backgrounded phone drops out silently; no way back to a game except the code; no presence; invites only show up as a DM badge; nobody can watch a game |
| Social | No stats, records or leaderboard; chat lives in a sheet, not at the table |
| Feel | Silent; no settings; no install prompt; screen sleeps mid-game; no "your turn" nudge |

## Work items

| ID | Item | Where |
|---|---|---|
| NL-01 | Match options on the match itself: length (Quick 1 leg / Standard 1 set / Full 3 sets) and computer skill | `engine/match.ts` |
| NL-02 | Computer skill levels: Easy (loose arranging, timid betting), Normal (today), Hard (reads the table, sharper Crash calls) | `engine/ai.ts` |
| NL-03 | Hand odds: win chance per hand while building, on the board, and Crash odds on the bet dock | `engine/odds.ts`, UI |
| NL-04 | Pass-and-play: 2–4 people on one device (computer fills the rest), with a privacy screen between turns | `ui/PassPlay` |
| NL-05 | Settings: sound, vibration, hand odds, default card sort | `ui/settings.ts` |
| NL-06 | Sound: small synthesised effects (no audio files), off-able | `ui/sound.ts` |
| NL-07 | Reliable live tables: endless back-off reconnect, reconnect on wake / network return, heartbeat, status pill | `net/api.ts`, `worker/room.ts` |
| NL-08 | Presence and "your tables": friends online / at a table; rejoin any game you're seated at | D1 `0002`, `worker/index.ts`, Hub |
| NL-09 | Table invites app-wide: banner with Join anywhere in the app | `/api/me`, App |
| NL-10 | Watch a game: anyone with the code can spectate a game in progress (no hidden cards) | `worker/room.ts` |
| NL-11 | Table talk at the seat: chat and quick calls show as a bubble on the player's seat | SeatRail |
| NL-12 | Host options in the lobby: match length and computer skill | Lobby |
| NL-13 | Stats: solo record on the device; online record in D1; friends leaderboard | `ui/stats.ts`, D1, Hub |
| NL-14 | PWA polish: install button (and iOS how-to), screen wake lock at the table, app badge, manifest shortcuts, "your turn" title + buzz | various |
| NL-15 | Tests: engine tests for options/skill/odds; browser smoke for new flows; online smoke for presence, spectating, stats | `src/engine`, `scripts/` |

## Order

NL-01 → 02 → 03 (engine, tested) → 05/06 → 04 → 07 → 08–13 → 14 → 15 throughout.
