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

The `reference/` folder is never committed, so it can't be exported.

## Publishing a version

1. Merge the work into `main` and check out a clean `main`.
2. Export into the public working copy (by default `..\homeworld-revelations-ttrpg` beside this repository):

   ```bash
   node tools/public/export.mjs
   ```

   The export stops if it finds anything that looks like an API key, a personal email, an LFS pointer instead of an image, or a file over 5 MB.
3. In the public copy, look over the changes, then commit with the version and tag it. For example: `git commit -m "HWR-App v1.1.0"`, then `git tag v1.1.0`, then `git push --follow-tags`.

## The Windows download

Each release can carry a portable build made without the private folder:

```bash
corepack pnpm package:win --no-private
```

Run it in the public copy, after installing there (`corepack pnpm install`), so the download matches the tagged code. It adds `LICENSE.txt`, `NOTICE.txt`, `THIRD-PARTY-NOTICES.txt` and `Start without launcher.cmd`. Zip `dist\HWR-App` and attach it to the release with its SHA-256. The export keeps the public copy's `node_modules` and `dist`, so exporting again doesn't delete a build waiting to be uploaded.

The launcher is unsigned and starts a hidden server process, so antivirus such as Norton can flag a freshly compiled `HWR-App.exe` as a generic threat. The README and the release notes say so, and the start script is the way round it.

## Where to look

| Piece | File |
|---|---|
| The export and its exclude list | `tools/public/export.mjs` |
| Public README, licence, notice, CI, Git attributes | `tools/public/` |
