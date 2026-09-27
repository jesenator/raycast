# Push Check

Local Raycast extension that answers "what goes out on my next push, and is it safe?" for a
repo and all of its git worktrees. Built to replace the GitLens commit-explorer and
working-tree-vs-origin/main compare views that used to be the main reason to keep Cursor open.

## What it shows

One `Push Check` command opens a list with a detail pane:

- **Worktree dropdown** (top right): every worktree of the configured repo, with
  `↑ahead ↓behind ✎dirty` counts vs the base ref. Switching re-runs everything for that worktree.
- **Overview → Outgoing**: commits the base ref lacks, files changed, a verdict tag, and a detail
  pane with the verdict sentence, the AI summary, files grouped by folder, and the commit list.
  The pane is markdown only (no metadata column) so the summary reads at full width.
- **Overview → Incoming**: the reverse (what a pull brings in), with its own summary.
- **Uncommitted**, **Outgoing files**, **Incoming files**: one collapsible tree each, starting fully
  collapsed at the top level. Folder rows show a chevron, the number of files underneath, and a red
  or orange tag when something under them sits in a deploy target's watch paths (`+added −deleted`
  is in the tooltip and the detail pane). Enter on a folder expands or collapses it, ⌘E expands a
  whole tree, ⌘⇧E collapses it. Children are indented with one en dash plus a Braille blank (U+2800) per level, because
  Raycast collapses runs of ordinary spaces. Single-child chains are compacted into one row like GitHub's
  tree view: `lab/spar/slack` for folders, and a folder whose only change is one file becomes that
  file's row (`.claude/skills/x/SKILL.md`). Typing in the search bar switches to a flat view so
  every file is searchable. Selecting a file shows its diff; selecting a folder lists its files.

## Verdict

- **safe to push** (green): no changed file sits under an auto-deploying target's watch paths.
- **deploys N** (red): the push would trigger Workers Builds for N workers, or the Convex CI deploy.
- **pull first** (yellow): the branch is behind the base ref.
- A manual-deploy app (wrangler config but not in the auto list) touched by the push shows in
  orange and does not make the verdict red, since nothing ships until someone runs a deploy.

## How the deploy targets are computed

Nothing is hardcoded per app. On each load the extension reads the worktree's root
`package.json` workspaces, every workspace `package.json`, and builds the internal dependency
graph. A workspace with a `wrangler.{jsonc,json,toml}` is a Cloudflare worker; its watch paths
are its own directory, every workspace package it depends on (transitively), `bun.lock`, and
the root `package.json`, mirroring the Workers Builds watch-path convention. A workspace with a
`convex.json` is the Convex backend and counts as auto-deploying because CI deploys it on push
to main. Which workers are git-connected (auto) comes from the "Auto-deploying workers"
preference, since that is dashboard state and not visible in the repo.

## Actions

| Action                  | Shortcut | Where            |
| ----------------------- | -------- | ---------------- |
| Open Diff in Editor     | ⏎        | file items       |
| Expand / Collapse       | ⏎        | folder rows      |
| Expand All / Collapse All | ⌘E / ⌘⇧E | tree sections   |
| Open File in Editor     | ⌘O       | file items       |
| Show in Finder          | ⌘⇧F      | files, worktree  |
| Copy Relative Path      | ⌘C       | file items       |
| Copy Absolute Path      | ⌘⇧C      | file items       |
| Copy Summary            |          | overview items   |
| Copy Commit List        | ⌘⇧C      | overview items   |
| Fetch and Refresh       | ⌘R       | everywhere       |
| Regenerate Summaries    | ⌘⇧S      | everywhere       |
| Open Worktree in Editor | ⌘⇧O      | everywhere       |

"Open Diff in Editor" writes the base-ref version of the file to a temp tree under
`$TMPDIR/push-check/<ref>-<sha>/<path>` (keeping the basename, so the editor tab reads
`file.ts (origin-main) ↔ file.ts`) and runs `<editor cli> -r --diff <before> <after>`.
Outgoing diffs are base → working file, incoming diffs are working file → base, uncommitted
diffs are HEAD → working file. Added or deleted files diff against an empty placeholder.

## AI summaries

Provider is OpenRouter by default (model `anthropic/claude-opus-5`, switchable to
`anthropic/claude-haiku-4.5` for about a fifth of the cost), with an Anthropic API option. Bullets
are ordered risk first, then behaviour changes, then docs and notes. The key comes from the "API key" preference or, when that is empty, from
`OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` in the configured dotenv file (defaults to the Kairos
repo's `lab/ashby/.env`). Summaries are cached per (provider, model, side, base sha, head sha) in
Raycast's Cache, so reopening the command costs nothing; ⌘⇧S forces a regeneration. The prompt
asks for paths and identifiers in backticks, and `codifyPaths` in `src/lib/summary.ts` wraps any
bare path the model left as plain text (outside existing backticks, URLs excluded). Lockfiles and
binaries are dropped from the diff sent to the model, and the diff is truncated at "Max diff
characters" (80k by default).

## Preferences

Repository (main checkout), base ref (`origin/main`), fetch on open, editor CLI (Cursor's
bundled `cursor` binary by default), auto-deploying workers, AI provider, auto-summarize, model,
API key, API key env file, max diff characters.

## Development

```bash
npm install
npx ray develop   # builds, imports into Raycast, rebuilds on save; Ctrl+C when done
npx ray build -e dist   # type-check and build without importing
```

The extension stays installed after the dev session ends. Logic that does not touch the Raycast
API (`src/lib/git.ts`, `src/lib/deploy.ts`) can be bundled with the bundled esbuild and run
under plain node for testing.

Deeplink: `raycast://extensions/jesse_gilbert/push-check/push-check`
