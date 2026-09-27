import { CalendarUnavailable, upcomingEvents, type CalEvent } from "./calendar";
import type { DbSlot, PageSlot, Slot } from "./config";
import { addDays, isoDay, nextWeekday } from "./dates";
import { Notion, undatedPages, upcomingPages, type Block, type MeetingPage } from "./notion";
import { entriesOf } from "./sessions";

/** A calendar event, JSON-safe (the list state is cached by Raycast as JSON). */
export type EventInfo = { summary: string; start: string; allDay: boolean; link?: string };

/** When the soonest meeting is, from its calendar event or else its usual weekday. */
export type NextMeeting = { date: string; source: "calendar" | "weekday"; event?: EventInfo };

export type SlotState = {
  slotId: string;
  /** The page for the soonest meeting: dated today or later, or an undated automation draft (see `assignDate`). */
  next?: MeetingPage;
  /** Upcoming dated pages other than `next` (all of them when the soonest meeting has no page). */
  later: MeetingPage[];
  /** The calendar event on the soonest meeting's day, for the time. */
  event?: EventInfo;
  /** `next` has no Date yet (an automation made it). Opening it or adding to it sets this date. */
  assignDate?: NextMeeting;
  /** Set when the soonest meeting has no page at all, with the date a new page should get. */
  missing?: NextMeeting;
  /** Page-based 1:1s: the next meeting, and the page's dated entries for it and for the last one. */
  meeting?: NextMeeting;
  entry?: { id: string; date: string };
  previousEntry?: { id: string; date: string };
  error?: string;
};

export type LoadResult = { slots: SlotState[]; calendarNote?: string; calendarFixUrl?: string; loadedAt: string };

function info(e: CalEvent): EventInfo {
  return { summary: e.summary, start: e.start.toISOString(), allDay: e.allDay, link: e.link };
}

export function matches(slot: Slot, e: CalEvent): boolean {
  return slot.calendarMatch.every((re) => re.test(e.summary));
}

function nextMeeting(slot: Slot, events: CalEvent[] | null, now: Date): NextMeeting {
  const first = (events ?? []).find((e) => matches(slot, e));
  return first
    ? { date: isoDay(first.start), source: "calendar", event: info(first) }
    : { date: isoDay(nextWeekday(now, slot.weekdays)), source: "weekday" };
}

/** Page-based 1:1 row: the next meeting from the calendar, matched to the page's dated entries. */
export function resolvePageSlot(slot: PageSlot, blocks: Block[], events: CalEvent[] | null, now: Date): SlotState {
  const meeting = nextMeeting(slot, events, now);
  const today = isoDay(now);
  const entries = entriesOf(blocks);
  const entry = entries.find((e) => e.date === meeting.date);
  // Newest-first pages, but pick by date so an oldest-first page works too.
  const previous = entries.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    slotId: slot.id,
    later: [],
    meeting,
    event: meeting.event,
    entry: entry && { id: entry.id, date: entry.date },
    previousEntry: previous && { id: previous.id, date: previous.date },
  };
}

/** Pure part of the load, split out for testing: decide what each row shows. */
export function resolveSlot(
  slot: DbSlot,
  pages: MeetingPage[],
  undated: MeetingPage[],
  events: CalEvent[] | null,
  now: Date,
): SlotState {
  const mine = (events ?? []).filter((e) => matches(slot, e));
  const firstEvent = mine[0];
  const firstEventDay = firstEvent ? isoDay(firstEvent.start) : undefined;
  const [first, ...rest] = pages;

  if (first && (!firstEventDay || first.date <= firstEventDay)) {
    const sameDay = mine.find((e) => isoDay(e.start) === first.date);
    return { slotId: slot.id, next: first, later: rest, event: sameDay && info(sameDay) };
  }
  const upcoming = nextMeeting(slot, events, now);
  const draft = undated[0];
  if (draft) return { slotId: slot.id, next: draft, later: pages, event: upcoming.event, assignDate: upcoming };
  return { slotId: slot.id, later: pages, missing: upcoming };
}

/** How far back an undated automation draft still counts as the next meeting's page. */
const UNDATED_LOOKBACK_DAYS = 10;

export async function loadSlots(
  notion: Notion,
  slots: Slot[],
  googleSecretsDir: string | undefined,
  now = new Date(),
): Promise<LoadResult> {
  const today = isoDay(now);
  let calendarNote: string | undefined;
  let calendarFixUrl: string | undefined;
  const eventsPromise: Promise<CalEvent[] | null> = googleSecretsDir
    ? upcomingEvents(googleSecretsDir, 35, now).catch((err) => {
        calendarNote = err instanceof CalendarUnavailable ? err.message : String(err);
        calendarFixUrl = err instanceof CalendarUnavailable ? err.url : undefined;
        return null;
      })
    : Promise.resolve(null);

  const since = isoDay(addDays(now, -UNDATED_LOOKBACK_DAYS));
  const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) });
  const pageResults = await Promise.all(
    slots.map((s) =>
      s.kind === "page"
        ? notion.children(s.pageId).then((blocks) => ({ blocks }), failed)
        : Promise.all([upcomingPages(notion, s, today), s.adoptUndated ? undatedPages(notion, s, since) : []]).then(
            ([pages, undated]) => ({ pages, undated }),
            failed,
          ),
    ),
  );
  const events = await eventsPromise;
  if (!googleSecretsDir) calendarNote = "Calendar off (no Google login folder set)";

  return {
    slots: slots.map((slot, i) => {
      const r = pageResults[i];
      if ("error" in r) return { slotId: slot.id, later: [], error: r.error };
      if (slot.kind === "page" && "blocks" in r) return resolvePageSlot(slot, r.blocks, events, now);
      if (slot.kind === "database" && "pages" in r) return resolveSlot(slot, r.pages, r.undated, events, now);
      return { slotId: slot.id, later: [], error: "Unexpected load result" };
    }),
    calendarNote,
    calendarFixUrl,
    loadedAt: now.toISOString(),
  };
}
