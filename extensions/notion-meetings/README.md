# Notion Meetings

Raycast extension for getting to the next page of each recurring meeting in Notion, adding
agenda items without opening it, and creating the page from its Notion template when nobody
has made it yet.

## Setup

1. `npm install`
2. `cp src/meetings.config.example.ts src/meetings.config.ts` and fill in your meetings (see
   Configuration). `meetings.config.ts` is gitignored: it maps your private Notion pages and
   your calendar, so it stays on your machine.
3. Connect your Notion integration to each meeting database and 1:1 page (••• →
   Connections in Notion).
4. `npx ray develop` to build and import it into Raycast (Ctrl+C when done; it stays
   installed).
5. In the extension's preferences, set the Notion token (or an env file with
   `NOTION_API_KEY`), the Google login folder for calendar lookups, and your initials.

## What it shows

One `Meetings` command lists your meetings in the order and sections (`group`) of
`meetings.config.ts`. Rows come in two kinds.

**Database rows** (`kind: "database"`) have one page per meeting in a Notion database. Each
row is the soonest meeting of that kind:

- **Page exists**: the page dated today or later whose Name starts with one of the row's
  prefixes. A page's date is the @date mention in its title when there is one, else its
  date column: templates stamp the creation day into both, and when a meeting moves people
  tend to fix only the title. Subtitle is the day plus the calendar time when an event matches. Extra title
  words (e.g. "discuss the offer") show on the right.
- **Not created** (orange tag): no page for the soonest meeting yet. The date comes from the
  next matching Google Calendar event, else the meeting's usual weekday(s). This also fires
  when a page exists for a later date but the calendar has an earlier occurrence without one.
- **Date not set** (blue tag, rows with `adoptUndated`): a Notion automation makes the page
  ahead of time with no Date. A page like that created in the last 10 days stands in for the
  next meeting, and Enter or Add Item sets its Date to the next matching calendar event. The
  title is left alone unless it holds a literal "@Today", which becomes the usual @date
  title. ⌥⏎ opens it without touching anything.
- **Unscheduled** (grey tag, rows with `weekdays: []`): no upcoming page and nothing on the
  calendar. Enter opens the latest page, and ⌘N makes one for a date you pick.

**Running-page rows** (`kind: "page"`) are 1:1s kept on one page ("Me <> Name 1:1s") with a
dated entry per meeting: a heading carrying an @date mention, newest first, usually below a
"Template" toggle and a divider (`src/lib/sessions.ts`). Entries are toggle headings holding
the meeting's blocks, or plain headings followed by them. The row shows the next calendar
meeting, and a grey **No entry yet** tag until the page has an entry for that date.

- **⏎** opens the page scrolled to that entry (a `#<block id>` link), or at the top if none.
- **⌘⏎ Add Item** adds under a heading inside the entry (Agenda by default, remembered per
  row), making the entry first when it's missing. Entries with no sub-headings take the
  items directly. The form has a date field in case the calendar guess is wrong.
- **⌘N** adds the entry and opens it. A new entry copies the page's Template contents (two
  levels deep, nested toggles included) and goes right under the template's divider, or at
  the top of pages without one. Pages without a template get the headings of their latest
  entry.
- **⌘[** opens the most recent past entry, and **⌘]** the meeting after the one shown (its
  entry, or a confirm step that adds one from the Template).

## Actions (database rows)

| Action                         | Shortcut | Where                  |
| ------------------------------ | -------- | ---------------------- |
| Open in Notion (new tab)       | ⏎        | page exists            |
| Open and Set Date              | ⏎        | date not set           |
| Open Without Setting Date      | ⌥⏎       | date not set           |
| Add Item                       | ⌘⏎       | page exists            |
| Create Page from Template      | ⏎        | not created            |
| Create Page and Add Item       | ⌘⏎       | not created            |
| Copy Link                      | ⌘C       | page exists            |
| Open Previous Meeting          | ⌘[       | everywhere             |
| Open / Create Next Meeting     | ⌘]       | everywhere             |
| Open Database                  | ⌘⇧D      | everywhere             |
| Create Page for Another Date…  | ⌘N       | page exists            |
| Refresh                        | ⌘R       | everywhere             |

**⌘]** goes one meeting past the row: the next existing page if it comes no later than the
following calendar event (else the usual weekday), or the create form for that date.

**Add Item** takes one item per line and a heading to put them under (the dropdown lists the
page's headings, nested ones as `Prep › Alex`). It preselects the last heading you used for
that meeting, else the row's `defaultSection`. Submit with ⌘⏎, or ⌘⇧⏎ to also open the
page. Placement rules, in `addItems` in `src/lib/notion.ts`:

- Empty placeholder items the template left under the heading are filled first.
- The rest go right after the section's last block, as the same block type as the items
  already there (to-dos when there are none).
- Toggle headings take items inside the toggle, under its "Quick updates & things to discuss
  today" label when it has one (else a label paragraph that opens the toggle). Pages fill
  that label in two ways and both are handled: items nested under it, or items following it
  as siblings up to the next label. The label is looked for by name because some prep
  toggles open with a different one ("Any diamonds or spades?").
- With `useInitials`, items under an Agenda heading get your initials ("JG: "). Other
  headings never get them.

**Creating a page** uses the Notion API's template support (`template.template_id` on
`POST /v1/pages`, API version `2026-03-11`). Template content arrives asynchronously (about
3 seconds), so the code polls the page's blocks until they stop changing, then re-applies the
title (`<before>@date<after>`, same shape as templates' `@Today`) and Date in case the
template's values landed after ours.

Pages open through their `https://` link, which the Notion desktop app turns into a new tab.
The `notion://` scheme is avoided on purpose: it replaces the tab that's in front.

## Configuration

`src/meetings.config.ts` exports `SLOTS`, one entry per row; the field docs are on the types
in `src/lib/slot.ts`, and `src/meetings.config.example.ts` shows one row of each shape.

- **Title prefixes**: a page belongs to a row when its Name starts with any of them, since
  spellings drift ("Check in", "Check-in"). Prefixes are scoped to the row's database, so a
  database of one person's 1:1s can use bare prefixes like "Check in".
- **Calendar patterns**: every regex must match an event title. `oneOnOne(me, name)` builds
  the usual "Me <> Name" pattern and ignores reversed titles, which tend to be one-offs. For
  reviews, a lookahead like `/^(?!.*performance).*\breview\b/i` skips performance reviews.
- **Weekdays**: the fallback when no calendar event matches (0 = Sunday).
- **`dateProperty`**: the database's date column, when it isn't called "Date" (Notion
  property names are case-sensitive, and some databases have a lowercase "date").
- Template ids come from `GET /v1/data_sources/{id}/templates`.

Preferences:

- **Notion token**: empty by default, which reads `NOTION_API_KEY` from the env file
  preference.
- **Google login folder**: a folder with `token.json` (refresh token + scopes) and
  `oauth_client.json` from an installed-app Google OAuth login, e.g. the Kairos repo's
  `lab/lib/.secrets/google` (made by `uv run lab/lib/google_auth.py auth`). It needs the
  `calendar.readonly` scope, and the Calendar API must be enabled in that OAuth client's
  Cloud project. The extension only reads the files and refreshes access tokens in memory.
  Without it, dates fall back to weekdays and a warning row explains why.
- **Your initials**: for rows with `useInitials`.

## Development

```bash
npm install
npx ray develop   # builds, imports into Raycast, rebuilds on save; Ctrl+C when done
npx ray build -e dist   # type-check and build without importing
```

Everything in `src/lib/` except `prefs.ts` and `client.ts` is free of the Raycast API, so it
can be bundled with the vendored esbuild (`node_modules/.bin/esbuild x.ts --bundle
--platform=node`) and run under plain node against the live APIs.

Deeplink: `raycast://extensions/jesse_gilbert/notion-meetings/meetings`
