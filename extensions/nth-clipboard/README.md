# Nth Clipboard Item

Local Raycast extension that pastes or copies the nth item from Raycast's
clipboard history. Built because script commands (`~/Documents/raycast`) can
only see the current clipboard via `pbpaste`; history access requires the
extension API.

## Commands

- **Paste Nth Clipboard Item** - takes an argument n (1-6), pastes that item
  into the frontmost app. n = 1 is the current clipboard.
- **Copy Nth Clipboard Item** - takes n (1-6), moves that item to the top of
  the clipboard and shows a HUD with a preview.
- **Paste 2nd / 3rd / 4th / 5th / 6th Clipboard Item** - no-argument versions
  so each can get its own hotkey (Raycast Settings → Extensions → Nth
  Clipboard Item → record hotkey). 4th-6th are disabled by default; enable
  them in the same settings pane.

## Hard limit

Raycast's `Clipboard.read({ offset })` API caps offset at 5, so only the 6
most recent history items are reachable. Deeper history is stored encrypted
and has no API.

## Development

```bash
npm install
npx ray develop   # rebuilds on save and (re)imports into Raycast; Ctrl+C when done
```

The extension stays installed in Raycast after the dev session ends. After
editing source, run `npx ray develop` again briefly to pick up changes.

Deeplink launch (used for testing):

```
raycast://extensions/jesse_gilbert/nth-clipboard/copy-nth?arguments=%7B%22n%22%3A%222%22%7D
```

`assets/icon.png` is generated (stdlib-only Python script, no PIL); regenerate
by tweaking the fill/glyph coordinates if the design ever needs changing.
