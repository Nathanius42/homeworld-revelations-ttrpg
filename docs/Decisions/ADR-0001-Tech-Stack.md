# ADR-0001: Tech stack

- **Status:** Accepted, 2026-10-16
- **Work items:** F01.1 (#182), story #270
- **Options considered:** [Tech Stack Options](../Tech-Stack-Options.md)

## Context

HWR-App is a private learning project: a digital table for *Homeworld: Revelations*, played by the owner and a few friends (up to 6 players), with an AI GM. It's mostly interface (character sheets, the GM Board, dice, AI GM chat), but it should also look striking: 3D dice, generated art everywhere, and fleet battles that feel like Homeworld.

## Decision

Build it as a **TypeScript web app** (option A). **Option D is reserved:** an Unreal Engine 5 "fleet viewer" that renders battles from the same server state, to add later if we want a cinematic treatment.

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Monorepo | pnpm workspaces + Turborepo |
| Packages | `rules-engine` (pure, no IO), `content` (schemas, data packs), `server`, `web` |
| Tests | Vitest, plus fast-check property tests for the rules engine |
| UI | React + Vite, Radix UI primitives; styling by CSS modules or Tailwind, chosen at scaffold |
| Client state | Zustand; server state arrives through the event stream |
| 3D | react-three-fiber (three.js) for dice and the fleet view; Rapier for dice physics |
| 2D zone map | SVG first, PixiJS if it outgrows that |
| Real-time | Colyseus rooms (state sync, reconnection) |
| Server | Node 22 LTS + Fastify |
| Database | SQLite event store (better-sqlite3 or libSQL), with snapshots |
| AI GM | Anthropic TypeScript SDK with tool use; a top model for GM reasoning and a cheaper tier for routine narration |
| Auth | invite links, plus passwordless email or Discord login |
| Art | local ComfyUI workflows with Homeworld style presets; WebP in the app; sources in Git LFS |
| Audio | Howler.js |
| Desktop wrapper | Tauri, optional, later |
| CI | Azure Pipelines |
| Hosting | the owner's PC + Tailscale to start; Azure App Service if it needs to be always on |

## Keeping option D open

These rules cost little now and keep the UE5 viewer possible:

- **All battle state lives on the server** as plain data (zones, ships, positions, breaches) and is described by a JSON schema in `content`. Nothing about a battle exists only in three.js scene objects.
- **The server publishes a read-only spectator feed** of battle events and snapshots. The UE5 viewer would join as a spectator client and never decide game outcomes.
- **3D assets are glTF**, so the same ship models load in three.js and in Unreal.
- **Fleet-view layout is driven by the zone graph**, not by hand-placed coordinates, so any renderer can lay it out the same way.

## Consequences

- **Good:** one language and one rules engine shared by the client, the server and the AI tools. Fast iteration. Friends join with a link. A modern full-stack, real-time and AI skill set to learn.
- **Costs:** 3D polish in three.js takes deliberate effort. UE5-level cinematics wait for option D.
- **Follow-ups:** the scaffold (#271), CI (#273–#275), and the reserved UE5 viewer feature F05.9 (#361).

## Amendments

### 2026-10-17: scaffold choices (#362, #367, #368)

Building the first playable slice settled the open choices and changed two of them:

| Layer | Decided | Why |
|---|---|---|
| Real-time | **Plain `ws` WebSockets**, not Colyseus | A table's state is a few KB, so the server sends the whole state after every change. With no diffs or schema there's nothing that can drift out of sync, and nothing magic to debug while learning. Reconnection is a saved player id. Colyseus is still an option if state grows. |
| Database | **`node:sqlite`** (built into Node 22.5+), not better-sqlite3 | No native module to compile on Windows. Each table saves a snapshot after every change, plus an append-only action log. |
| Server runtime | Node 24 | Current LTS line on this PC; needed for `node:sqlite`. |
| UI styling | Plain CSS with design tokens (`apps/web/src/styles.css`), no Tailwind or Radix yet | The Homeworld HUD look (clipped corners, corner brackets, sensor grid) is custom anyway. |
| Dice physics | Scripted tumble, no Rapier | The server decides every roll; the dice animate to the result, so they can never disagree with it. |
| AI GM | Claude Haiku 5.5 (`claude-haiku-5-5`) by default, adaptive thinking, five tools; `HWR_GM_MODEL` steps up to Sonnet 5.5 or Opus 5.5 | See [Getting Started](../Getting-Started.md). It improvises around the scripted Director, which runs without a key. |
| Art | ComfyUI + IP-Adapter + ControlNet, with real HWRM ship models rendered by a three.js ship studio | See [Art Pipeline](../Art-Pipeline.md). |
| End-to-end tests | Playwright (`tests/e2e`) | Plays the whole mission with three browsers and saves screenshots. |

