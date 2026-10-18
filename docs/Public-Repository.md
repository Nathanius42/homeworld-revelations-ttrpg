# Public repository

A shareable copy of HWR-App lives on GitHub as **homeworld-revelations-ttrpg**, for a work portfolio. It's a snapshot, not a mirror: one commit per major version, with its own history, so this repository's commits, branches and board links never appear there.

## What goes public

Everything committed here, except:

| Left out | Why |
|---|---|
| `docs/Rules-Model/`, `Rules-Model.md`, `Setting-Reference.md` | Page-by-page summaries of the Modiphius corebook |
| `docs/Tooling.md` | Board access and personal identity details |
| `tools/likeness/`, `tools/private/` | Family-likeness and private-folder tooling |
| `.claude/`, `CLAUDE.md`, `azure-pipelines.yml` | Internal workflow and notes about this PC; GitHub gets its own CI |
| `README.md`, `.gitattributes` | Replaced by public versions (no Git LFS there) |

Links from the remaining docs to left-out pages become plain text. The public copy gets its own README, a plain MIT licence for the code, a NOTICE setting the Homeworld and Revelations rights and the fan art apart, and a GitHub Actions workflow that typechecks, tests and builds.

The `reference/` folder is never committed, so it can't be exported. The one exception is on purpose: **mission packs**.

### Mission packs

A pack is a set of missions written privately and shared deliberately, such as the Dreadnought arc. `tools/public/packs.json` lists each pack's missions in the private folder. The export:
1. copies those missions into `packs/<name>/missions/` of the public copy;
2. rewrites their art paths from `/local/missions/…` to `/packs/<name>/…`;
3. copies only the pictures they use;
4. drops the "Private: never shared." note from the GM notes.

The server loads every pack it finds (`apps/server/src/mission-packs.ts`), checked like a private mission, and serves its art at `/packs/<name>/`. The Windows build copies `packs/` into `app/packs`, shared or not. This repository has no `packs/` folder, so here the same missions come from the private folder as usual.

A pack never carries the soundtrack, ship models or voices. A mission's music set or Kokoro voice falls back to the general moods and the browser's voices when they aren't there.

## Publishing a version

1. Merge the work into `main` and check out a clean `main`.
2. Export into the public working copy (by default `..\homeworld-revelations-ttrpg` beside this repository):

   ```bash
   node tools/public/export.mjs
   ```

   The export stops if it finds anything that looks like an API key, a personal email, an LFS pointer instead of an image, or a file over 5 MB.
3. In the public copy, look over the changes, then commit with the version and tag it. For example: `git commit -m "HWR-App v1.1.0"`, then `git tag v1.1.0`, then `git push --follow-tags`.

## The Windows download

Each release carries a portable build made without the private folder. After tagging the public copy, run this from this repository:

```bash
node tools/public/release.mjs v1.1.0
```

It checks the public copy is clean and at that tag, then:
- installs and builds the folder with `--no-private`, which adds `LICENSE.txt`, `NOTICE.txt`, `THIRD-PARTY-NOTICES.txt` and `Start without launcher.cmd`;
- starts the built server the way the start script does and checks it answers with no private files;
- zips it with Windows' own `tar` (Git's GNU tar on the PATH can't write zips) and checks nothing private is inside;
- writes `dist\RELEASE-NOTES-v1.1.0.md` with the download section and SHA-256 filled in.

Fill in the notes, then attach the zip and paste them into a GitHub release. The script uploads nothing. The export keeps the public copy's `node_modules` and `dist`, so exporting again doesn't delete a build waiting to be uploaded.

The launcher is unsigned and starts a hidden server process, so antivirus such as Norton can flag a freshly compiled `HWR-App.exe` as a generic threat. The README and the release notes say so, and the start script is the way round it.

## Where to look

| Piece | File |
|---|---|
| The export and its exclude list | `tools/public/export.mjs` |
| The Windows download and release notes | `tools/public/release.mjs` |
| Public README, licence, notice, CI, Git attributes | `tools/public/` |
