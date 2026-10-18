# Tech Stack Options

> **Decided:** option A, with option D reserved. See [ADR-0001](Decisions/ADR-0001-Tech-Stack.md).

The options for building HWR-App, compared against what this project actually needs.

## What the stack has to do

- **A UI-heavy tabletop:** character sheets, the GM Board, dice, a zone map, and lots of text and panels.
- **Shiny:** 3D dice, art everywhere, fleet battles that look like Homeworld.
- **Multiplayer for up to 6 friends**, with one authoritative game state.
- **An AI GM** using Claude tool calls.
- **Private:** a handful of players, so there's no scaling concern. Friends should be able to join easily.
- **A learning exercise:** the stack should teach something worth knowing.
- **Already on hand:** Windows, Azure DevOps, UE5 experience (UE5-Continuum), and a local ComfyUI install for art.

## The four realistic options

| | A. Web (TypeScript) | B. Godot 4 | C. Unreal Engine 5 | D. Web app + UE5 viewer |
|---|---|---|---|---|
| Shape | browser app: React UI, three.js for 3D | a game engine app with built-in UI | a full game client | web app for the table; UE5 renders fleet battles |
| Dense UI (sheets, GM Board) | **excellent** | good | weak (UMG is laborious) | excellent |
| Shiny 3D (dice, fleets) | good (three.js / react-three-fiber) | very good | **best** | best |
| Friends joining | **open a link** | download a build (or web export) | download a large build | link, plus an optional download |
| Multiplayer | Node + Colyseus or WebSockets; easy | built-in high-level networking | replication; powerful but complex | web server owns the state |
| Claude integration | official TypeScript SDK | HTTP calls from GDScript or C# | HTTP from C++ or Blueprints | TS SDK on the server |
| Iteration speed | **fastest** (hot reload) | fast | slow (compiles, big editor) | mixed |
| Rules engine sharing | one TS package on client, server and AI tools | GDScript/C# in-engine, separate from the server | C++ in-engine | TS package; UE5 only renders |
| Art pipeline | ComfyUI → PNG/WebP; glTF for 3D | ComfyUI images; glTF/Blender | ComfyUI + full 3D asset pipeline | both |
| What you learn | modern full-stack web, real-time, AI tools | a second engine; 2D/3D UI | deeper UE5 (overlaps Continuum) | both, plus integration |
| Effort to MVP | **lowest** | medium | highest | high |
| Risk | 3D polish takes care | web export limits; C# web export immature | UI cost; slow loop | two codebases |

## Recommendation: A, with a path to D

Build it as a **TypeScript web app**. This kind of game is about 80% interface (sheets, GM Board, dice, chat with the AI GM), and the web is the best and fastest place to build that. Friends join with a link. The rules engine is one package shared by the client, the server and the AI GM's tools. You still get shiny visuals: 3D dice and the fleet tactical view run on three.js, and the generated art fills the screens.

If the fleet battles later deserve a cinematic treatment, add a UE5 **"fleet viewer"** that reads the same battle state over the network. That's option D, and it reuses your Unreal skills without making every character sheet a UMG job.

## Option A in detail

| Layer | Pick | Alternatives |
|---|---|---|
| Language | TypeScript (strict) | – |
| Monorepo | pnpm workspaces + Turborepo | Nx |
| Rules engine | pure TS package, Vitest + fast-check property tests | – |
| UI | React + Vite, Tailwind or CSS modules, Radix UI primitives | SvelteKit, Vue |
| State (client) | Zustand or Redux Toolkit; server state via the event stream | – |
| 3D | react-three-fiber (three.js) for dice and the fleet view; cannon-es or Rapier for dice physics | Babylon.js |
| 2D zone map | SVG, or PixiJS if it gets big | Konva |
| Real-time | Colyseus (rooms, state sync, reconnection built in) | Socket.IO, plain `ws`, PartyKit |
| Server | Node 22 + Fastify | Hono, NestJS |
| Database | SQLite (better-sqlite3 or libSQL) event store; Postgres later only if needed | Postgres from day one |
| AI GM | Anthropic TypeScript SDK with tool use; a top model for GM reasoning, a cheaper tier for routine narration | – |
| Auth | invite links + passwordless email or Discord login | Microsoft account (Entra ID) |
| Art | ComfyUI (local) with a Homeworld style workflow; WebP output; Git LFS for sources | – |
| Audio | Howler.js | Web Audio directly |
| Desktop wrapper (optional) | Tauri, for a "real app" feel on your PC | Electron |
| CI | Azure Pipelines | – |
| Hosting | **your PC + Tailscale** (free and private); or Azure App Service when you want it always on | Fly.io, Railway |

## Hosting for a private table

1. **Home PC + Tailscale:** run the server on your machine and invite friends to the tailnet. Free and private, and nothing is exposed to the internet. It's only up when your PC is.
2. **Azure App Service, basic tier:** always on, in the existing Azure DevOps world, with a small monthly cost.
3. **A cheap VPS or PaaS (Fly.io, Railway):** simple deploys from CI, with a small monthly cost.

Start with option 1. The code doesn't change when you move.

