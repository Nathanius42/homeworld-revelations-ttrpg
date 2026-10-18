# GM Board

A digital version of the *Homeworld: Revelations* gamemaster screen. The physical screen has a wide fleet-battle panorama on the players' side and quick-reference tables on the GM's side. The app copies that split: **one shared surface with a public face and a private face**.

## Two faces

### Player face (everyone sees it)

- A **panorama header** using the screen's battle art, rotated with generated Homeworld art per location or scene (private build; see [Open Questions](Open-Questions.md)). The current scene's name and location truths are overlaid on it.
- The **Momentum pool** as six pips, with the end-of-scene decay shown.
- The **turn tracker** for action scenes: alternating sides, who has acted, the Keep the Initiative chain, and for ships, the NPC turns remaining (scale-based).
- **Zone map:** the scene's zone graph with tokens, the truths on each zone, and the range from the selected token.
- **Party strip:** each PC or SC portrait with stress, injuries, Fortune, who controls them, and who is uncontrolled.
- **Roll feed:** the live dice results from the [Dice Roller](Dice-Roller.md).

### GM face (GM, or the AI GM's console)

| Panel | Contents |
|---|---|
| Threat | pool size, quick-spend buttons (complication 2, reinforcements 1/2/scale, Reversal 2 × PCs), and an event history graph (the rise and fall of tension) |
| Quick reference | difficulty ladder, Momentum and Threat spend tables, injury rules, range table, ship damage and breach rules, crew quality table, encounter budget |
| NPC roster | the active NPCs by tier, with stress, injuries and once-per-scene flags; promote minor → notable → major; fill an open slot (a major NPC reveal) |
| Encounter builder | a PC-equivalent budget meter, drag from faction pools, strike-force grouping |
| Hidden truths | truths not yet revealed to the players, with a reveal button |
| Clocks | timed challenges, consequence tracks, NPC agendas |
| Mission graph | the challenge DAG from the [Campaign Engine](Campaign-Engine.md), with completed, available and locked nodes |
| Requests | player requisitions (RU), create-truth proposals, and supporting-character introductions awaiting approval |
| Notes | per-scene notes that the AI GM also writes into |

## Modes

- **Human GM:** a person drives the GM face, with the AI as an optional assistant (it can suggest a difficulty, draft an NPC, or narrate).
- **AI GM:** Claude runs the GM face through tool calls. The human host can watch, override or pause. Every AI action passes through the same visible controls, so the table can see *why* Threat went up.
- **Shared screen:** for in-person play, the player face goes on a TV and the GM face on the host's tablet.

## Layout notes

- Desktop: player face across the top (panorama, then the zone map), GM panels docked below or to the side.
- Tablet: tabs.
- Phone: the **player view only**; the full GM face needs more room than a phone has.
- Colours: deep space navy, Hiigaran cyan highlights, warning amber for Threat. Australian English in all UI text ("armour", "manoeuvre", "colour").
