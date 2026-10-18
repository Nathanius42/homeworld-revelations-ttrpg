# Open Questions

Decisions and gaps found while reading the corebooks. Each needs a call before or during the build.

## Decided

| Date | Decision |
|---|---|
| 2026-10-16 | **Private build.** HWR-App is a learning project, played by the owner and a few friends, and never released publicly. Official art (such as the GM screen panorama and the Kushan crest) and transcribed stats may be used inside the app. The licensed source PDFs and the official data pack still stay out of git (CLAUDE.md). |
| 2026-10-16 | **Generated art is in.** Homeworld-style images (ships, portraits, locations, handouts) are generated as needed, for example with the local ComfyUI install, and stored in Git LFS. |
| 2026-10-16 | **d20 crest.** The Kushan symbol on the d20 replaces the 1 (a critical: 2 successes). |
| 2026-10-16 | **Tech stack.** A TypeScript web app, with a UE5 fleet viewer reserved: [ADR-0001](Decisions/ADR-0001-Tech-Stack.md). |
| 2026-10-16 | **Corebook build.** Use `Homeworld Corebook_Customer_Final.pdf`. The earlier `customer(1)` build has been removed. |

## Rules gaps and inconsistencies

| # | Issue | Proposed default |
|---|---|---|
| 4 | Kiith d20 table leaves 20 unassigned (Somtaaw is 18–19) | treat 20 as Somtaaw |
| 5 | NPC acting first: 1 Threat (ch. 2) or 2 Threat (ch. 9) | 1, configurable |
| 6 | Default difficulty: 1 (ch. 1) or 2 (ch. 9) | GM chooses; the AI GM uses 2 |
| 7 | Hazard stress table and cover table are referenced in ch. 9 but missing from the printed chapter | write our own table and mark it as a house rule |
| 8 | "Obtain Information" spend used by talents is not defined | same as Ask a Question |
| 9 | The text refers to an "Untapped Potential" talent that doesn't exist | it means Font of Potential |
| 10 | Some talents reference "Medicine" and "Presence" (*Star Trek Adventures* leftovers) | Medicine = Medical; Presence = Will or Insight |
| 11 | Ship weapon Piercing is per Effect at ship scale but flat at personal scale | follow each scale as written |
| 13 | Fortune invocation is once per scene (ch. 3) but ch. 1 sets no limit | once per scene per aspect |

## Product decisions

15. **Hosting:** for a private table: the host's own PC with a private tunnel, Azure, or a cheap host. See the stack options.
16. **AI provider and cost:** Claude through the API, with costs per session to watch. Use a smaller model for routine narration?
17. **Milestones or RU** as the default advancement scheme?
18. **Maximum table size:** a hard cap of 6 PCs, or allow 7–8 with a warning?
