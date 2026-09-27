/**
 * Template for `meetings.config.ts`, the list of meetings the command shows. Copy it:
 *
 *   cp src/meetings.config.example.ts src/meetings.config.ts
 *
 * then replace the placeholders with your own. The real file is gitignored, since it maps your
 * private Notion pages and calendar. Field docs are on the types in `lib/slot.ts`.
 *
 * Finding the IDs (with your integration connected to each database or page in Notion,
 * ••• → Connections):
 * - `dataSourceId` and `templateId`: `GET https://api.notion.com/v1/data_sources/{id}/templates`
 *   lists a data source's templates. The data source id shows in the Notion MCP connector's
 *   fetch of any page in the database (`collection://...`), or in the database's API object.
 * - `databaseUrl` / `pageId`: the 32-character id at the end of the Notion URL.
 */
import { oneOnOne, type Slot } from "./lib/slot";

/** Your first name as it appears in 1:1 calendar titles ("Alex <> Sam"). */
const mine = (name: string) => oneOnOne("alex", name);

export const SLOTS: Slot[] = [
  // A recurring meeting with its own Notion database, one page per meeting.
  {
    kind: "database",
    id: "planning",
    title: "Planning sync",
    database: "Planning meetings",
    dataSourceId: "00000000-0000-0000-0000-000000000000",
    databaseUrl: "https://www.notion.so/00000000000000000000000000000000",
    templateId: "00000000-0000-0000-0000-000000000000",
    titlePrefixes: ["Planning sync"],
    newTitle: { before: "Planning sync - ", after: "" },
    group: "Syncs",
    defaultSection: "Agenda",
    calendarMatch: [/planning sync/i],
    weekdays: [1],
    icon: "people",
  },
  // A 1:1 database whose pages a Notion automation pre-creates without a date.
  {
    kind: "database",
    id: "sam",
    title: "Sam check-in",
    database: "Sam 1:1s",
    dataSourceId: "00000000-0000-0000-0000-000000000000",
    databaseUrl: "https://www.notion.so/00000000000000000000000000000000",
    templateId: "00000000-0000-0000-0000-000000000000",
    titlePrefixes: ["Alex <> Sam (Check in", "Alex <> Sam (Check-in"],
    newTitle: { before: "Alex <> Sam (Check in, ", after: ")" },
    group: "1:1s",
    defaultSection: "Prep: Alex",
    adoptUndated: true,
    calendarMatch: [mine("sam"), /check.?in/i],
    weekdays: [2],
    icon: "bubble",
  },
  // A 1:1 kept on one running page with a dated entry per meeting.
  {
    kind: "page",
    id: "robin",
    title: "Robin 1:1",
    database: "Robin's 1:1s page",
    pageId: "00000000-0000-0000-0000-000000000000",
    group: "1:1s",
    defaultSection: "Agenda",
    useInitials: true,
    calendarMatch: [mine("robin")],
    weekdays: [4],
    icon: "person",
  },
];
