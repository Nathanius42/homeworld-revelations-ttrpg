# Conventions

## Writing

- Australian English everywhere, with the Macquarie Dictionary as the reference: armour, colour, centre, defence, manoeuvre, organise, licence (noun), program, Sabre.
- The exceptions are code identifiers (`color` in an engine call stays `color`) and direct quotations, which keep their original spelling.

## Code

- Comments describe the current state and the reasons behind it, never the history. History belongs in commit messages.

## Version control

- New projects use Git in Azure DevOps: one project per product, with Boards and a `docs/` code wiki.
- The HWRM mods stay in SourceForge SVN. Keep SVN commits path-scoped.
- Large binary art does not go in plain Git.

## Wikis

- Each repository's `docs/` folder is published as that project's code wiki. Edit locally and push, or edit on the web and pull.
- `.order` sets page order. Each `.md` file is a page, and a folder next to a page of the same name holds its sub-pages.
