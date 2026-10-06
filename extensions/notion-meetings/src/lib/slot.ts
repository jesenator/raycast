/**
 * The shape of a meeting row. The rows themselves live in `src/meetings.config.ts`, which is
 * gitignored because it maps someone's private Notion pages and calendar; copy
 * `src/meetings.config.example.ts` to start one.
 *
 * A row is either a Notion database with one page per meeting (made from a database
 * template), or a 1:1 kept on one running page with a dated entry per meeting. IDs come from
 * the Notion API (`GET /v1/data_sources/{id}/templates`, or a page's URL).
 */
type BaseSlot = {
  id: string;
  title: string;
  /** Where it lives, shown on the row (database or page name). */
  database: string;
  /** Heading that "Add Item" targets until you pick another one (then the last choice sticks). */
  defaultSection: string;
  /** Prefix items you add under an Agenda heading with your initials (for pages that mark who raised what, e.g. "JG: "). */
  useInitials?: boolean;
  /** List section the row sits in. */
  group: "Syncs" | "1:1s";
  /** A calendar event is this meeting when every pattern matches its title. */
  calendarMatch: RegExp[];
  /**
   * Fallback when the calendar has no matching event: the usual weekdays (0 = Sunday). Leave
   * it empty for meetings without a fixed rhythm: the row then says "Not on your calendar"
   * and opens the latest page, instead of guessing a date.
   */
  weekdays: number[];
  icon: "person-lines" | "crown" | "bubble" | "calendar" | "people" | "person";
};

export type DbSlot = BaseSlot & {
  kind: "database";
  dataSourceId: string;
  /** The database itself, for "Open Database". */
  databaseUrl: string;
  /** Name of the database's date column when it isn't "Date" (property names are case-sensitive). */
  dateProperty?: string;
  templateId: string;
  /** A page belongs to this meeting when its Name starts with any of these (spellings drift: "Check in", "Check-in"). */
  titlePrefixes: string[];
  /** New page titles are `before` + an @date mention + `after`, matching the template's "@Today" pattern. */
  newTitle: { before: string; after: string };
  /**
   * A Notion automation pre-creates this meeting's page without a date a few days ahead. A
   * recent undated page then stands in for the next meeting, and opening it or adding to it
   * sets its Date (and fixes a literal "@Today" an automation can leave in the title).
   */
  adoptUndated?: boolean;
};

/** A 1:1 kept on one running page ("Me <> Name 1:1s"), one dated entry per meeting. See sessions.ts. */
export type PageSlot = BaseSlot & {
  kind: "page";
  pageId: string;
};

export type Slot = DbSlot | PageSlot;

/** A page's https link, scrolled to a block when given (`#<block id>`). */
export function notionUrl(pageId: string, blockId?: string): string {
  const base = `https://www.notion.so/${pageId.replace(/-/g, "")}`;
  return blockId ? `${base}#${blockId.replace(/-/g, "")}` : base;
}

export function pageUrl(slot: PageSlot, blockId?: string): string {
  return notionUrl(slot.pageId, blockId);
}

/** The database template new pages are made from (template pages open like any other page). */
export function templateUrl(slot: DbSlot): string {
  return notionUrl(slot.templateId);
}

/**
 * Matches "<me> <> <name>" in a calendar title (a regex fragment is fine for `name`, e.g.
 * "andr[eé]s"). Only that order counts: recurring 1:1s tend to be named that way, while the
 * reverse order, group meetings, and "Name / Me - topic" titles tend to be one-offs.
 */
export function oneOnOne(me: string, name: string): RegExp {
  return new RegExp(`${me}\\s*<>\\s*(${name})\\b`, "i");
}
