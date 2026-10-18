# Private folder

`reference/` holds everything this PC may use but must never share: licensed game material, the soundtracks, and photos of real people. It's git-ignored, a test fails if anything in it is ever committed (`apps/server/test/private-folder.test.ts`, which also runs in CI), and the app only uses each kind when it's present. A copy of HWR-App for someone else is simply the repo without this folder; it runs with stock art and synthesised sound.

To play on the laptop with everything, copy the whole folder across (the portable build, #536, will do this).

## Layout

`python tools/private/setup.py` creates any missing subfolders and writes `reference/README.md`.

| Folder | What | Made by | Used at |
| --- | --- | --- | --- |
| `ships/` | Homeworld Remastered ship models | `tools/ship-studio/prep.py` | `/local/ships/`, Fleet Archive, ship cards |
| `renders/`, `compose/` | Ship renders and scene compositing work | ship studio, `tools/art/compose.py` | Making committed art |
| `art-refs/` | Reference images, including `avatars/` for family portrait seeds | by hand | Art and portrait tools |
| `likeness/` | Prepared seeds, painted variants, `people.json` | `tools/likeness/*.py` | Family portraits |
| `portraits/` | Published family portraits and `index.json` | `tools/likeness/pick.py` | `/local/portraits/`, the designer, the stock gallery slots |
| `music/` | Soundtrack tracks by mood, mission music sets such as `kharak/`, and `playlist.json` | `tools/music/build.py` | `/api/music`, `/local/music/` |
| `sfx/` | Game sound effects for story events, as Ogg | `tools/sfx/build.py` (needs vgmstream) | `/api/sfx`, `/local/sfx/` |
| `missions/` | Missions adapted from licensed books, such as the quickstart's *The Khar-Toba*, with their art | by hand, art by `tools/art/generate.py --spec` | `/api/missions`, `/local/missions/` |
| `badges/` | The game's kiith badges, tinted cyan, as WebP, and `index.json` (kiith name to file) | `tools/branding/badges.py` | `/api/badges`, `/local/badges/` |
| `tts/kokoro/` | The Kokoro-82M voice model (quantised ONNX, 92 MB) and 16 English voices, Apache 2.0 | downloaded from Hugging Face (`onnx-community/Kokoro-82M-v1.0-ONNX`) | `/api/tts` |
| `*.pdf` | The corebook and quickstart | | Rules reference; never quoted at length |

`/api/health` reports which kinds this PC has: `{"private": {"ships": true, "portraits": true, "music": true, "sfx": true, "missions": true, "badges": true}}`.

## Private missions

The quickstart adventure in the corebook is licensed, so its adaptation can't be committed. `apps/server/src/private-missions.ts` reads `reference/missions/index.json` (`{"missions": ["khar-toba.json"]}`) when the server starts, checks each mission with the same `validateMission` as the built-in ones, and adds it to the mission list. From then on tables, saves, the Director and the Claude GM treat it like any other mission. A file that fails the check, isn't valid JSON or reuses a built-in id is skipped with a warning in the server log, so a broken file never stops the game.

A mission file is the `Mission` type from `packages/content/src/mission.ts` written as JSON: weapons and ships are spelled out instead of imported. Its art lives beside it and is referenced as `/local/missions/...`.

**The Khar-Toba** (#626) retells the quickstart in our own words: the race to the wreck, three ways in, the living quarters and the engines, the Temple Plaza, the Guidestone under its sealing pillar, and the escape in a stolen Gaalsien craft. Its eight scene paintings were generated locally with Deserts of Kharak's concept art (from the game's technical manual) as IP-Adapter references:

```bash
D:\ComfyUI_windows_portable\python_embeded\python.exe tools/art/generate.py --spec reference/missions/art.json --out reference/missions --variants 2
```

To balance it, `HWR_MISSION=khar-toba npx tsx test/sim.ts` in `apps/server` (the simulator loads private missions too).

## Mission music sets

A mission can name a music set (`"music": "kharak"` in its definition). The table carries it as `missionMusic`, and the client plays that set's tracks for each mood, falling back to the general moods for any gap. `tools/music/build.py` builds the sets listed in `SETS` into `reference/music/<set>/<mood>/`. **kharak** is Deserts of Kharak's score (35 tracks), including cues written for the Khar-Toba itself, such as *Arrival at the Khar Toba Site* and *The First City of Kharak*. Tracks with speech in them are left out.

## Narration voices (Kokoro)

Kokoro is a small open text-to-speech model that runs on the game PC's CPU. Here it generates speech about twice as fast as it plays, so the first sentence of a line is ready in two or three seconds. `apps/server/src/tts.ts` loads it with `kokoro-js` from `reference/tts/kokoro`, with loading from the internet switched off. `POST /api/tts {text, voice, speed}` returns a WAV; lines are generated one at a time and the last 300 are cached, so the TV and phones asking for the same line share one generation. The client (`apps/web/src/speech.ts`) splits narration into sentences, fetches the next while one plays, and falls back to the browser's voices if the server can't speak.

To set it up on another PC, download these from the Hugging Face repository into `reference/tts/kokoro/`, keeping the folder layout: `config.json`, `tokenizer.json`, `tokenizer_config.json`, `onnx/model_quantized.onnx` and `voices/<voice>.bin`. The voices used are the American and British ones listed in `VOICES` in `tts.ts`.

## Kiith badges

Homeworld Remastered ships its badges as 256-pixel white stencils (`Source Files/Homeworld RM/badges/*.tga` on this PC), with the five kiithid Paktu, Manaan, S'jet, Soban and Naabal beside the Kushan emblem. Homeworld Mobile's textures (`Source Files/Homeworld Mobile/Client/Assets/Texture2D/kiith_logo_*`) add Somtaaw and Kaalel, and the Deserts of Kharak expedition guide (`TechnicalManual/package.nw`, a zip, in the game's Steam folder) adds Hraal, Siidim and Gaalsien, all in the same style. No game has a badge for Sagald, Jaraci or Tambuur, so `tools/branding/badges.py` draws simple ones of our own for them: a cog with a spade, a sensor dish and a scalpel through a ring. The tool paints all thirteen and the emblem the launcher's cyan (#2ec4d6), sizes them to 128 pixels and writes them to `reference/badges/` with `index.json`:

    D:\ComfyUI_windows_portable\python_embeded\python.exe tools/branding/badges.py

`/api/badges` answers `{"kiith": {"Paktu": "/local/badges/paktu.webp", ...}}`, or an empty map on a PC without them. The client (`apps/web/src/badges.tsx`) shows each badge beside the kiith on crew cards, the personnel file, the TV's crew cards and the designer. A kiith without a badge shows the name alone; to add one, put a white stencil with transparency under the source folder and its path in `KIITHID` in the tool. The e2e server's private folder leaves the badges out, so the wiki's screenshots never show them.

## Game sound effects

The game's `.fda` sounds are AIFF-C compressed with Relic's own codec, which ffmpeg can't read. [vgmstream](https://github.com/vgmstream/vgmstream) decodes them: unzip the official `vgmstream-win64.zip` release into `reference/tools/vgmstream/` (this PC has r2117). `tools/sfx/build.py` picks the sounds for each story event, decodes them with `vgmstream-cli` (by default from `reference/tools/vgmstream/`), compresses them to Ogg Opus with ffmpeg, and writes `reference/sfx/sfx.json`.

| Event | Game sound | Plays when |
| --- | --- | --- |
| comms | Sensors contact found | Fleet Command speaks |
| objective | Fleet Intelligence objective ping | A new advantage, complication or threat |
| combat | Combat detected | A fight or ship battle starts |
| success | Unit build complete | A roll passes |
| threat | Battle momentum bad | A roll fails or Threat rises |
| jumpOut, jumpIn | Hyperspace out and in | The mission starts; the mission ends |
| explosion | Medium fiery explosion | An enemy ship is destroyed |
| hullHit | Heavy sparks, creaking hull | Our ship takes damage |
| weapon, click | Corvette cannon; command click | Spare cues |

Each cue falls back to a synthesised one when the sounds aren't there. The dice keep their own rattle.

## Mood music

`tools/music/build.py` copies the soundtrack tracks tagged in its `MOODS` table from `~/OneDrive/Music/Paul Ruskay` (or a folder you pass) into `reference/music/<mood>/`, and writes the playlist. Only the table of track names is committed; the music isn't.

| Mood | When | Examples |
| --- | --- | --- |
| lobby | Before the mission | *Revelations*, the DoK menu theme |
| briefing | Scenes the mission marks as briefings | *The Guidestone*, *The Signal*, *Secret Briefing* |
| exploring | Calm scenes, and the default | *Kharak System*, *Stellar Drifts*, HW3 ambients |
| mystery | Derelicts and the unknown | *Progenitor Derelict*, *Ship Graveyard* |
| tension | Danger scenes, or Threat of 10 or more | *Heavy Radiation*, *Imminent Threat* |
| combat | Any fight or ship battle | *Vaygr Battle Theme*, *Counterattack* |
| victory, loss | The mission's ending | *Hiigara System*; *Return to Kharak* |

Missions set a scene's mood with `mood` in its scene setup. In the browser (`apps/web/src/music.ts`) tracks crossfade over three seconds when the mood changes, move on to another track of the same mood when one ends, avoid recent repeats, and dip while a voice is reading. The drone steps aside while music plays and comes back without it.

**Music** in the top bar (and in the lobby) switches it per device: on by default on the TV view, off on phones so they don't all play at once. **Sound off** mutes everything.

To retag, edit `MOODS` in `tools/music/build.py` and run it again.
