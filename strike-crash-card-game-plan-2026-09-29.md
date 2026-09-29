# Crash — Card Game PWA: Build Plan

Owner: Christopher Nicholson
Company: CN-DESIGN LTD
Date: 2026-09-29
Route: A — engine first, single-device vs AI, installable PWA
Status: Built — STK-001 to STK-007 complete

## Objective

A player can install Crash on their phone and play a complete 3- or 4-player game against computer opponents, online or offline, with the house rules enforced exactly.

## Rules (settled)

| Item | Rule |
|---|---|
| Players | 3 or 4 (1 human + AI) |
| Deal — 4 players | 13 cards each → 4 hands of 3, 1 spare |
| Deal — 3 players | 17 cards each → 5 hands of 3, 2 spares; 1 card undealt |
| Ranking (high → low) | Prile · Stiff · Run · Flush · Pair · High card |
| Tie-break within a category | Highest card, then next highest (pair rank before kicker) |
| Aces | High (Q-K-A) or low (A-2-3); no wrap (K-A-2 is not a run) |
| Placement | All players arrange hands freely and secretly, then reveal simultaneously |
| Scoring | Each position compared **pairwise** between every pair of players; winner +1, exact tie 0 |
| Target | 4 players: 10 · 3 players: 21 (configurable) |
| Game end | First to target; if several cross in one deal, highest total wins; level → play another deal |
| Spares | Discarded, no effect |

## Definition of done

1. Engine unit tests pass for every category, every tie-break, both ace positions, and the multi-crosser tiebreak.
2. A full game runs end to end at 3 and 4 players (simulated AI-vs-AI test reaches a winner).
3. `pnpm build` produces an installable PWA with a service worker; the app loads offline.
4. The layout works at 375px wide.

## Non-goals

Online multiplayer · accounts · betting · rich animation · native app-store builds.

## Stack

Vite · React · TypeScript (strict) · pnpm · Vitest · vite-plugin-pwa · Cloudflare Pages (static `dist/`).

## Work items

| ID | Title | Where | Effort | Depends on | Verify | Door |
|---|---|---|---|---|---|---|
| STK-001 | Scaffold Vite + React + TS + Vitest | repo root | S | none | `pnpm build` and `pnpm test` exit 0 | two-way |
| STK-002 | Card model, deck, shuffle, deal | `src/engine/cards.ts` | S | 001 | Test: 4p deal = 4×13, 3p = 3×17 + 1 leftover, no duplicates | two-way |
| STK-003 | Hand evaluation + comparison | `src/engine/hands.ts` | M | 002 | Tests: each category detected; A-2-3 and Q-K-A are runs; K-A-2 is not; tie-breaks ordered | two-way |
| STK-004 | Pairwise scoring + game state machine | `src/engine/game.ts` | M | 003 | Tests: 4p deal awards ≤ 12 per player; ties score 0; multi-crosser rule | two-way |
| STK-005 | AI arrangement (best partition + ordering) | `src/engine/ai.ts` | L | 003 | Test: 17-card arrangement < 500ms; never worse than naive sort | two-way |
| STK-006 | Game UI: setup, arrange, reveal, scoreboard | `src/ui/` | L | 004, 005 | Manual play-through at 3p and 4p to a winner | two-way |
| STK-007 | PWA manifest, icons, offline | `vite.config.ts`, `public/` | S | 006 | Built app has manifest + SW; loads with network off | two-way |

**Critical path:** 001 → 002 → 003 → 004 → 006 → 007. STK-005 runs alongside 004.

## Milestones

1. **Engine** — `pnpm test` green, and an AI-vs-AI simulated game reaches a winner.
2. **Playable** — a human plays a full game in the browser.
3. **Shippable** — installs and plays offline.

## Risks

| Risk | Likelihood | Impact | Early warning | Mitigation |
|---|---|---|---|---|
| AI too slow on 17 cards | Med | High | Test over 500ms | Keep only the top-N partitions; fall back to greedy |
| 4p game too short (pairwise scoring gives ~6 pts per deal) | High | Med | Games end in 1–2 deals | Target is a config value; play-test |
| Arranging hands on mobile is fiddly | Med | Med | Hard to tap cards at 375px | Tap-to-select plus an "Auto-arrange" button |

## Cut line

If time halves: STK-001 to STK-004 plus a greedy AI and a minimal UI. PWA polish is dropped, but the manifest stays.

## Open decisions

1. **4-player target**: keep 10, or raise to around 20 to match 3-player game length? (Recommend: play-test first.)
2. **Pass-and-play mode** for several humans on one device: a cheap later addition.
3. **Online multiplayer**: reuse `src/engine/` on the server (Supabase Edge Function) when wanted.

#crash #cn-design #plan
