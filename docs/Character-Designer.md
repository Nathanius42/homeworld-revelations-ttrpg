# Character Designer

Builds and edits PCs, supporting characters, NPCs and ships. It sits on the rules in NPCs and Ship Combat.

## What's built so far (prototype)

The lobby has a **Design your own** card that opens the *Personnel office*: a single-screen point-buy builder rather than the full lifepath.

![The personnel office](images/screens/14-character-designer.png)

- **Identity**: name, portrait (a generated gallery plus the crew's own), kiith (thirteen kiithid from the games' lore of the Mothership era, after [Encyclopedia Hiigara](https://homeworld.fandom.com/wiki/Kiith), each with its outlook, and the game's badge beside the picker on a PC that has the badges: see *Kiith badges* in [Private Folder](Private-Folder.md)), one line about them and an aspect.
- **Role**: one of the six crew roles. Talents, weapons, armour and kit come from the pregenerated crew member in that role, so every design is ready to play.
- **Attributes and skills**: steppers with live budgets, and the finished-character rules from the corebook enforced by `validateFinishedCharacter` (attributes 7–12 totalling 54 with only one 12; skills 1–5 totalling 14 with only one 5).
- **Focuses**: three to six, from the role's suggestions or typed in.
- The server rebuilds and re-checks the sheet (`buildCustomSheet` in `packages/content/src/designer.ts`), adds it to the table and hands it to its designer. Options come from `/api/designer`, so the browser never loads mission content.

The lifepath wizard and the other modes below are still to come.

## Modes

| Mode | For | Flow |
|---|---|---|
| **Lifepath wizard** | new PCs | 7 steps, each *choose* or *roll*, with a live sheet preview |
| **Quick build** | big tables, drop-in players | Creation in Play: role → attribute array → Kiith → two skills → a neutral aspect → play. The empty slots are filled during play. |
| **Random character** | one-shots | rolls every table, then lets you lock and re-roll single steps |
| **Pregen picker** | first session | the five Quickstart pregens, plus saved templates |
| **Supporting character** | the group | the 10/9/8/8/7/7 and 4/3/2/2/2/1 arrays; the growth options tracked per reintroduction |
| **NPC forge** (GM) | minor, notable, major | tier arrays, heritage, special-rule frameworks, identifying detail, name tables |
| **Shipwright** | the home ship, NPC ships | ready-made, quick or construction, with point budgets and requirement checks |

## Lifepath wizard details

- **Live rules validation** on every change: attribute total 54, skill total 14, caps, one-at-max, *Font of Potential* caps, talent requirements, role-track requirements, rank constraints.
- **"Fix over-caps" helper** for step 7: suggests where to move excess points.
- **Explain panel:** why this option grants what it grants, with a page reference for owners of the book.
- **Backstory prompts:** the career-event questions become text fields. Answers are saved as **hooks** the campaign generator can use.
- **Defining aspect helper:** positive, negative and neutral examples; the AI suggests aspects from the backstory, and the player edits them.
- **Party view:** the other players' characters as they're built, with role clashes flagged (one CO and one Captain) and skill-coverage gaps shown (no medic? no pilot?).
- **Undo and branching:** go back to any step without losing later choices that are still valid.

## Character sheet

- A digital sheet following the corebook layout (attributes, skills, focuses, aspects, truths and talents, weapons, equipment, stress and injury track, Fortune, RU).
- **Interactive:** tapping an attribute + skill pair prefills the [Dice Roller](Dice-Roller.md). Talents that apply to the current test are highlighted.
- **Play state vs build state:** stress, injuries and Fortune change in play. Stats change only through advancement, and every change is logged.
- **Advancement screen:** RU costs or milestone options, filtered to what's legal.
- **Export:** a printable PDF sheet, JSON (for import and sharing), and a share link.

## Inventory (#630)

Every character carries an inventory: their sheet's starting equipment, plus anything they pick up. The personnel file lists each item with its size, where it came from, its history (used, damaged, stowed) and the character's load.

- **Using an item.** On a test, the roll card offers *Use an item*. It makes the test one step easier (difficulty minus 1). Each item helps once per scene, and consumables such as "Researcher's toolkit (3 uses)" spend a charge.
- **Wear and tear.** A complication rolled while using an item damages it, and a second one breaks it. Broken, lost and used-up items can't help.
- **Picking things up.** The Claude GM has `give_item` and `change_item`. It hands over anything plausible, like the old pair of swords from the first playtest, and can damage, break, lose, stow or repair gear as a consequence. It sees everyone's kit and load in its situation summary. The Director's missions hand out a few finds too, such as a Hiigaran glyph key, the miners' cutting charges and Vaal's sidearm.
- **No hammerspace.** Every item has a size, which counts against the character's load: small (pocket or belt) is 1, medium (a hand or a strap: a rifle, a toolkit, a pair of swords) is 2, and large (both arms: a crate, an engine part) is 4. A character can carry 10 plus half their Brawn. Anything that won't fit is refused: drop it, stow something, or hand it to someone with room. Stowed gear stays aboard the ship, out of reach and not counting towards load. A mission find that nobody can carry is stowed automatically.

Code: `apps/server/src/inventory.ts` (rules), `Game.giveItem`, `changeItem` and `loadOf` in `engine.ts`, and the item tools in `claude-gm.ts`.

## Portraits and identity

- An upload, or a portrait library of generated Homeworld-style art, plus Kiith colours and insignia.
- **Name generator** per culture (Kushan doubled vowels, Taiidani, Turani and so on).
- AI portrait generation from appearance notes and Kiith (local ComfyUI pipeline), with re-roll and pick.
- **Play as yourselves** (#594): portraits in the likeness of friends and family, made on the local ComfyUI from a few photos of each person. Only with their consent (a parent decides for children). Children are drawn grown up, as crew in their twenties, recognisably themselves but clearly adults; each person can have a target age that feeds the prompt. The photos and portraits stay in git-ignored `reference/` and are served only on a PC that has them, like the HWRM ship models. They never go to git, CI, the wiki or any online service. Built: see *Portraits of friends and family* in [Art Pipeline](Art-Pipeline.md).

## Shipwright

- Chassis picker, then the attribute-point and upgrade-point budgets, with live derived stats (hull, fuel, CD).
- A special-function catalogue filtered by requirements; dependent functions are shown as a tree.
- **Ship sheet:** the breach track per system, fuel pips, and station assignments (who is at helm, tactical, sensors, comms, command).
- Ship advancement and technology install, with research shown as an extended-test tracker.
