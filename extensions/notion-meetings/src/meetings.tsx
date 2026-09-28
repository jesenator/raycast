import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  Keyboard,
  List,
  Toast,
  open,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  showToast,
} from "@raycast/api";
import { showFailureToast, useCachedPromise, useCachedState, usePromise } from "@raycast/utils";
import { useMemo, useState } from "react";
import { MissingToken, notionClient } from "./lib/client";
import { SLOTS, pageUrl, type DbSlot, type PageSlot, type Slot } from "./lib/config";
import { formatDay, formatTime, isoDay, parseIsoDay, weekdayNames } from "./lib/dates";
import {
  addItems,
  createMeetingPage,
  pickSection,
  previousPage,
  sectionsOf,
  datePage,
  type Block,
  type MeetingPage,
} from "./lib/notion";
import { prefs } from "./lib/prefs";
import { createEntry, entriesOf, entryContent, templateOf, wholeEntrySection, type Entry } from "./lib/sessions";
import { loadSlots, type EventInfo, type NextMeeting, type SlotState } from "./lib/slots";

const ICONS: Record<Slot["icon"], Icon> = {
  "person-lines": Icon.PersonLines,
  crown: Icon.Crown,
  bubble: Icon.SpeechBubble,
  calendar: Icon.Calendar,
  people: Icon.TwoPeople,
  person: Icon.Person,
};

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function when(date: string, event?: EventInfo): string {
  const day = formatDay(date);
  return event && !event.allDay ? `${day} · ${formatTime(new Date(event.start))}` : day;
}

/** Words in a page title beyond the usual "<prefix> - <date>", e.g. "discuss the offer". */
function titleExtra(slot: DbSlot, title: string): string {
  const prefix = slot.titlePrefixes.find((p) => title.startsWith(p)) ?? "";
  return title
    .slice(prefix.length)
    .replace(/@today/gi, "")
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/[()\s,–-]+$/g, "")
    .replace(/^[()\s,–-]+/g, "")
    .trim();
}

/**
 * Open through the page's https link, which the Notion desktop app picks up as a new tab.
 * The notion:// scheme would open it too, but replaces whatever tab is in front.
 */
async function openPage(page: MeetingPage) {
  await open(page.url);
}

/** Where a meeting's date came from, for tooltips and form descriptions. */
function sourceNote(slot: Slot, m: NextMeeting): string {
  if (m.source === "calendar") {
    const time = m.event && !m.event.allDay ? ` at ${formatTime(new Date(m.event.start))}` : "";
    return `From your calendar: "${m.event?.summary?.trim()}"${time}.`;
  }
  return `No matching calendar event, so this is the next ${weekdayNames(slot.weekdays)}.`;
}

/** Give an undated automation page its meeting date, then open it (opens anyway if the date write fails). */
async function openAndSetDate(slot: DbSlot, page: MeetingPage, date: string, onChanged: () => void) {
  try {
    const n = await notionClient();
    await datePage(n, slot, page, date);
    onChanged();
  } catch (err) {
    await showFailureToast(err, { title: "Couldn't set the date" });
  }
  await openPage(page);
}

async function openPrevious(slot: DbSlot) {
  try {
    const n = await notionClient();
    const prev = await previousPage(n, slot, isoDay(new Date()));
    if (!prev) {
      await showToast(Toast.Style.Failure, `No earlier ${slot.title} page`);
      return;
    }
    await openPage(prev);
  } catch (err) {
    await showFailureToast(err, { title: "Couldn't find the previous meeting" });
  }
}

export default function Meetings() {
  const p = useMemo(prefs, []);
  const { data, isLoading, error, revalidate } = useCachedPromise(
    async (dir: string | undefined) => loadSlots(await notionClient(), SLOTS, dir),
    [p.googleSecretsDir],
    { keepPreviousData: true, failureToastOptions: { title: "Couldn't load meetings" } },
  );

  if (error instanceof MissingToken && !data) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Key}
          title="Notion token missing"
          description={error.message}
          actions={
            <ActionPanel>
              <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const states = new Map((data?.slots ?? []).map((s) => [s.slotId, s]));
  const groups = [...new Set(SLOTS.map((s) => s.group))];
  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter meetings">
      {groups.map((group) => (
        <List.Section key={group} title={group}>
          {SLOTS.filter((s) => s.group === group).map((slot) =>
            slot.kind === "page" ? (
              <PageSlotRow
                key={slot.id}
                slot={slot}
                state={states.get(slot.id)}
                initials={p.initials ?? ""}
                onChanged={revalidate}
              />
            ) : (
              <SlotRow
                key={slot.id}
                slot={slot}
                state={states.get(slot.id)}
                initials={p.initials ?? ""}
                onChanged={revalidate}
              />
            ),
          )}
        </List.Section>
      ))}
      {data?.calendarNote ? (
        <List.Section title="Calendar">
          <List.Item
            icon={{ source: Icon.Warning, tintColor: Color.Yellow }}
            title="Using usual weekdays"
            subtitle={data.calendarNote}
            actions={
              <ActionPanel>
                {data.calendarFixUrl ? <Action.OpenInBrowser title="Enable Calendar API" url={data.calendarFixUrl} /> : null}
                <Action.CopyToClipboard title="Copy Message" content={data.calendarNote} />
                <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={revalidate} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
    </List>
  );
}

function SlotRow(props: { slot: DbSlot; state?: SlotState; initials: string; onChanged: () => void }) {
  const { slot, state, initials, onChanged } = props;
  const icon = ICONS[slot.icon];
  const refresh = (
    <Action
      title="Refresh"
      icon={Icon.ArrowClockwise}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={onChanged}
    />
  );
  const common = (
    <>
      {state?.later.slice(0, 3).map((pg) => (
        <Action
          key={pg.id}
          title={`Open ${formatDay(pg.date)} Page`}
          icon={Icon.ArrowNe}
          onAction={() => openPage(pg)}
        />
      ))}
      <Action
        title="Open Previous Meeting"
        icon={Icon.Undo}
        shortcut={{ modifiers: ["cmd"], key: "[" }}
        onAction={() => openPrevious(slot)}
      />
      <Action.Open
        title="Open Database"
        icon={Icon.List}
        target={slot.databaseUrl}
        shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
      />
    </>
  );

  if (!state) {
    return <List.Item icon={icon} title={slot.title} subtitle="Loading…" accessories={[{ text: slot.database }]} />;
  }

  if (state.error) {
    return (
      <List.Item
        icon={icon}
        title={slot.title}
        subtitle={state.error}
        accessories={[{ tag: { value: "Error", color: Color.Red }, tooltip: state.error }]}
        actions={
          <ActionPanel>
            {refresh}
            <Action.CopyToClipboard title="Copy Error" content={state.error} />
          </ActionPanel>
        }
      />
    );
  }

  if (state.unscheduled) {
    const note = "No upcoming page and nothing on your calendar. Enter opens the latest page; ⌘N makes one for a date you pick.";
    return (
      <List.Item
        icon={icon}
        title={slot.title}
        subtitle="Not on your calendar"
        keywords={[slot.database]}
        accessories={[{ tag: { value: "Unscheduled", color: Color.SecondaryText }, tooltip: note }, { text: slot.database }]}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action title="Open Latest Meeting" icon={Icon.ArrowNe} onAction={() => openPrevious(slot)} />
              <Action.Push
                title="Create Page for a Date…"
                icon={Icon.NewDocument}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                target={
                  <CreatePageForm
                    slot={slot}
                    date={isoDay(new Date())}
                    note="It isn't on your calendar, so pick the date."
                    onChanged={onChanged}
                  />
                }
              />
              <Action.Open title="Open Database" icon={Icon.List} target={slot.databaseUrl} shortcut={{ modifiers: ["cmd", "shift"], key: "d" }} />
            </ActionPanel.Section>
            <ActionPanel.Section>{refresh}</ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  if (state.next) {
    const page = state.next;
    const assign = state.assignDate;
    const date = assign?.date ?? page.date;
    const extra = titleExtra(slot, page.title);
    const assignNote = assign
      ? `An automation made this page without a date. Opening it or adding to it sets Date to ${formatDay(assign.date)}${
          /@today/i.test(page.title) ? " and replaces the \"@Today\" in its title" : ""
        }. ${sourceNote(slot, assign)}`
      : "";
    return (
      <List.Item
        icon={icon}
        title={slot.title}
        subtitle={when(date, state.event)}
        keywords={[slot.database, page.title]}
        accessories={[
          ...(assign ? [{ tag: { value: "Date not set", color: Color.Blue }, tooltip: assignNote }] : []),
          ...(extra ? [{ text: extra }] : []),
          { text: slot.database, tooltip: page.title },
        ]}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              {assign ? (
                <Action
                  title="Open and Set Date"
                  icon={Icon.ArrowNe}
                  onAction={() => openAndSetDate(slot, page, assign.date, onChanged)}
                />
              ) : (
                <Action title="Open in Notion" icon={Icon.ArrowNe} onAction={() => openPage(page)} />
              )}
              <Action.Push
                title="Add Item"
                icon={Icon.Plus}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
                target={
                  <AddItemForm
                    slot={slot}
                    page={page}
                    assignDate={assign?.date}
                    initials={initials}
                    onChanged={onChanged}
                  />
                }
              />
              {assign ? (
                <Action
                  title="Open Without Setting Date"
                  icon={Icon.ArrowNe}
                  shortcut={{ modifiers: ["opt"], key: "return" }}
                  onAction={() => openPage(page)}
                />
              ) : null}
              <Action.CopyToClipboard title="Copy Link" content={page.url} shortcut={{ modifiers: ["cmd"], key: "c" }} />
            </ActionPanel.Section>
            <ActionPanel.Section>
              {common}
              <Action.Push
                title="Create Page for Another Date…"
                icon={Icon.NewDocument}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                target={<CreatePageForm slot={slot} date={date} note="Pick the date for the extra page." onChanged={onChanged} />}
              />
              {state.event?.link ? <Action.OpenInBrowser title="Open Calendar Event" url={state.event.link} /> : null}
            </ActionPanel.Section>
            <ActionPanel.Section>{refresh}</ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  const missing = state.missing!;
  const note = sourceNote(slot, missing);
  return (
    <List.Item
      icon={icon}
      title={slot.title}
      subtitle={when(missing.date, missing.event)}
      keywords={[slot.database]}
      accessories={[
        { tag: { value: "Not created", color: Color.Orange }, tooltip: note },
        { text: slot.database },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.Push
              title="Create Page from Template"
              icon={Icon.NewDocument}
              target={<CreatePageForm slot={slot} date={missing.date} note={note} onChanged={onChanged} />}
            />
            <Action.Push
              title="Create Page and Add Item"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              target={
                <AddItemForm
                  slot={slot}
                  createDate={missing.date}
                  createNote={note}
                  initials={initials}
                  onChanged={onChanged}
                />
              }
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {common}
            {missing.event?.link ? <Action.OpenInBrowser title="Open Calendar Event" url={missing.event.link} /> : null}
          </ActionPanel.Section>
          <ActionPanel.Section>{refresh}</ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function CreatePageForm(props: { slot: DbSlot; date: string; note: string; onChanged: () => void }) {
  const { slot, note, onChanged } = props;
  const [date, setDate] = useState<Date | null>(parseIsoDay(props.date));
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!date) return;
    setBusy(true);
    const toast = await showToast(Toast.Style.Animated, "Creating page from template…");
    try {
      const n = await notionClient();
      const { page } = await createMeetingPage(n, slot, isoDay(date), TIME_ZONE);
      onChanged();
      await openPage(page);
      toast.hide();
      await showHUD(`Created ${slot.title} for ${formatDay(page.date)}`);
      await popToRoot({ clearSearchBar: true });
    } catch (err) {
      setBusy(false);
      await showFailureToast(err, { title: "Couldn't create the page" });
    }
  }

  return (
    <Form
      isLoading={busy}
      navigationTitle={`New ${slot.title}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create and Open" icon={Icon.NewDocument} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description title={slot.title} text={`${note}\nThe page is made from the database's template.`} />
      <Form.DatePicker id="date" title="Date" type={Form.DatePicker.Type.Date} value={date} onChange={setDate} />
    </Form>
  );
}

function AddItemForm(props: {
  slot: DbSlot;
  page?: MeetingPage;
  /** The page is an undated automation draft: set its Date to this before adding. */
  assignDate?: string;
  createDate?: string;
  createNote?: string;
  initials: string;
  onChanged: () => void;
}) {
  const { slot, page, initials, onChanged } = props;
  const [remembered, setRemembered] = useCachedState<string | undefined>(`section-${slot.id}`, undefined);
  // Set once a new page exists, so a retry after a failed add doesn't make a second page.
  const [created, setCreated] = useState<MeetingPage | undefined>();
  const [chosen, setChosen] = useState<string | undefined>();
  const [date, setDate] = useState<Date | null>(props.createDate ? parseIsoDay(props.createDate) : null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Existing page: its headings. New page: the template's headings (the page is made on submit).
  const sections = usePromise(
    async (id: string) => sectionsOf(await (await notionClient()).children(id)),
    [page?.id ?? slot.templateId],
  );
  const options = (sections.data ?? []).filter((s, i, all) => all.findIndex((o) => o.label === s.label) === i);
  const fallback = pickSection(options, [remembered, slot.defaultSection])?.label;
  const selected = chosen ?? fallback;
  // Initials only go on Agenda items (that's where pages mark who raised what).
  const prefixFor = (sectionText: string | undefined) =>
    slot.useInitials && initials && /agenda/i.test(sectionText ?? "") ? `${initials}: ` : "";
  const prefix = prefixFor(options.find((o) => o.label === selected)?.text ?? selected);

  async function submit(openAfter: boolean) {
    const raw = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!raw.length) {
      await showToast(Toast.Style.Failure, "Nothing to add");
      return;
    }
    setBusy(true);
    const toast = await showToast(Toast.Style.Animated, page ? "Adding…" : "Creating page from template…");
    try {
      const n = await notionClient();
      let target = page ?? created;
      let blocks;
      if (!target) {
        if (!date) throw new Error("Pick a date for the new page");
        const made = await createMeetingPage(n, slot, isoDay(date), TIME_ZONE);
        target = made.page;
        setCreated(made.page);
        blocks = made.blocks;
        toast.title = "Adding…";
      } else {
        if (props.assignDate) await datePage(n, slot, target, props.assignDate);
        blocks = await n.children(target.id);
      }
      const section = pickSection(sectionsOf(blocks), [selected, slot.defaultSection]);
      if (!section) throw new Error("The page has no headings to add under");
      const pre = prefixFor(section.text);
      const lines = raw.map((l) => (pre && !l.startsWith(pre.trim()) ? pre + l : l));
      const count = await addItems(n, target.id, section, lines);
      setRemembered(section.label);
      onChanged();
      if (openAfter) await openPage(target);
      toast.hide();
      await showHUD(`Added ${count === 1 ? "1 item" : `${count} items`} to ${slot.title} › ${section.label}`);
      await popToRoot({ clearSearchBar: true });
    } catch (err) {
      setBusy(false);
      await showFailureToast(err, { title: "Couldn't add the item" });
    }
  }

  const heading = page
    ? `${formatDay(props.assignDate ?? page.date)}${titleExtra(slot, page.title) ? ` · ${titleExtra(slot, page.title)}` : ""}${
        props.assignDate ? " (adding also sets the page's Date to this day)" : ""
      }`
    : `No page yet. ${props.createNote ?? ""} Submitting creates it from the template first.`;

  return (
    <Form
      isLoading={busy || sections.isLoading}
      navigationTitle={`Add to ${slot.title}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Item" icon={Icon.Plus} onSubmit={() => submit(false)} />
          <Action.SubmitForm
            title="Add and Open Page"
            icon={Icon.ArrowNe}
            shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
            onSubmit={() => submit(true)}
          />
        </ActionPanel>
      }
    >
      <Form.Description title={slot.title} text={heading} />
      <Form.TextArea
        id="items"
        title="Items"
        placeholder={prefix ? `One per line. Each gets "${prefix.trim()}" in front.` : "One per line"}
        value={text}
        onChange={setText}
        autoFocus
      />
      <Form.Dropdown
        id="section"
        title="Under"
        value={selected ?? ""}
        onChange={(v) => v && setChosen(v)}
        isLoading={sections.isLoading}
      >
        {options.length === 0 && selected === undefined ? <Form.Dropdown.Item value="" title="Loading headings…" /> : null}
        {options.map((s) => (
          <Form.Dropdown.Item key={s.id} value={s.label} title={s.label} />
        ))}
      </Form.Dropdown>
      {page ? null : <Form.DatePicker id="date" title="New page date" type={Form.DatePicker.Type.Date} value={date} onChange={setDate} />}
    </Form>
  );
}

// ---------------------------------------------------------------------------
// 1:1s kept on one running page, one dated entry per meeting (see lib/sessions.ts)

/** Open the page, scrolled to an entry when there is one (Notion block links: `#<block id>`). */
async function openEntry(slot: PageSlot, entryId?: string) {
  await open(pageUrl(slot, entryId));
}

/** Find this date's entry on the page, or make it from the page's template. */
async function ensureEntry(slot: PageSlot, date: string): Promise<{ entry: Entry; blocks: Block[]; created: boolean }> {
  const n = await notionClient();
  let blocks = await n.children(slot.pageId);
  const found = entriesOf(blocks).find((e) => e.date === date);
  if (found) return { entry: found, blocks, created: false };
  const made = await createEntry(n, slot.pageId, blocks, date);
  blocks = await n.children(slot.pageId);
  return { entry: entriesOf(blocks).find((e) => e.id === made.id) ?? made, blocks, created: true };
}

async function createEntryAndOpen(slot: PageSlot, date: string, onChanged: () => void) {
  const toast = await showToast(Toast.Style.Animated, "Adding an entry from the page's template…");
  try {
    const { entry } = await ensureEntry(slot, date);
    onChanged();
    await openEntry(slot, entry.id);
    toast.hide();
    await showHUD(`Added the ${formatDay(date)} entry to ${slot.title}`);
  } catch (err) {
    await showFailureToast(err, { title: "Couldn't add the entry" });
  }
}

function PageSlotRow(props: { slot: PageSlot; state?: SlotState; initials: string; onChanged: () => void }) {
  const { slot, state, initials, onChanged } = props;
  const icon = ICONS[slot.icon];
  const refresh = (
    <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh} onAction={onChanged} />
  );

  if (!state) {
    return <List.Item icon={icon} title={slot.title} subtitle="Loading…" accessories={[{ text: slot.database }]} />;
  }
  if (state.unscheduled) {
    return (
      <List.Item
        icon={icon}
        title={slot.title}
        subtitle="Not on your calendar"
        accessories={[{ tag: { value: "Unscheduled", color: Color.SecondaryText } }, { text: slot.database }]}
        actions={
          <ActionPanel>
            <Action
              title={state.previousEntry ? "Open Latest Meeting" : "Open Page"}
              icon={Icon.ArrowNe}
              onAction={() => openEntry(slot, state.previousEntry?.id)}
            />
            {refresh}
          </ActionPanel>
        }
      />
    );
  }
  if (state.error || !state.meeting) {
    const error = state.error ?? "No meeting found";
    return (
      <List.Item
        icon={icon}
        title={slot.title}
        subtitle={error}
        accessories={[{ tag: { value: "Error", color: Color.Red }, tooltip: error }]}
        actions={
          <ActionPanel>
            <Action title="Open Page" icon={Icon.ArrowNe} onAction={() => openEntry(slot)} />
            {refresh}
          </ActionPanel>
        }
      />
    );
  }

  const meeting = state.meeting;
  const entry = state.entry;
  const note = sourceNote(slot, meeting);
  const noEntry = `No ${formatDay(meeting.date)} entry on the page yet. Add Item or ⌘N adds one from the page's Template. ${note}`;
  return (
    <List.Item
      icon={icon}
      title={slot.title}
      subtitle={when(meeting.date, state.event)}
      keywords={[slot.database]}
      accessories={[
        ...(entry ? [] : [{ tag: { value: "No entry yet", color: Color.SecondaryText }, tooltip: noEntry }]),
        { text: slot.database, tooltip: note },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title={entry ? "Open at This Meeting" : "Open Page"}
              icon={Icon.ArrowNe}
              onAction={() => openEntry(slot, entry?.id)}
            />
            <Action.Push
              title="Add Item"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "return" }}
              target={<AddEntryItemForm slot={slot} date={meeting.date} initials={initials} onChanged={onChanged} />}
            />
            {entry ? null : (
              <Action
                title={`Add ${formatDay(meeting.date)} Entry and Open`}
                icon={Icon.NewDocument}
                shortcut={{ modifiers: ["cmd"], key: "n" }}
                onAction={() => createEntryAndOpen(slot, meeting.date, onChanged)}
              />
            )}
            <Action.CopyToClipboard
              title="Copy Link"
              content={pageUrl(slot, entry?.id)}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {state.previousEntry ? (
              <Action
                title={`Open Previous Meeting (${formatDay(state.previousEntry.date)})`}
                icon={Icon.Undo}
                shortcut={{ modifiers: ["cmd"], key: "[" }}
                onAction={() => openEntry(slot, state.previousEntry!.id)}
              />
            ) : null}
            {entry ? <Action title="Open Page at Top" icon={Icon.Document} onAction={() => openEntry(slot)} /> : null}
            {state.event?.link ? <Action.OpenInBrowser title="Open Calendar Event" url={state.event.link} /> : null}
          </ActionPanel.Section>
          <ActionPanel.Section>{refresh}</ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

const WHOLE_ENTRY = "This meeting";

function AddEntryItemForm(props: { slot: PageSlot; date: string; initials: string; onChanged: () => void }) {
  const { slot, initials, onChanged } = props;
  const [remembered, setRemembered] = useCachedState<string | undefined>(`section-${slot.id}`, undefined);
  const [chosen, setChosen] = useState<string | undefined>();
  const [date, setDate] = useState<Date | null>(parseIsoDay(props.date));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Headings to offer: the meeting's entry when it exists, else the page's Template (what a new entry will contain).
  const sections = usePromise(
    async (day: string) => {
      const n = await notionClient();
      const blocks = await n.children(slot.pageId);
      const entries = entriesOf(blocks);
      const entry = entries.find((e) => e.date === day);
      const template = templateOf(blocks);
      let content: Block[] = [];
      if (entry) content = (await entryContent(n, slot.pageId, blocks, entry)).blocks;
      else if (template) content = await n.children(template.id);
      else if (entries[0]) content = (await entryContent(n, slot.pageId, blocks, entries[0])).blocks;
      return { exists: Boolean(entry), sections: sectionsOf(content) };
    },
    [date ? isoDay(date) : props.date],
  );
  const options = (sections.data?.sections ?? []).filter((s, i, all) => all.findIndex((o) => o.label === s.label) === i);
  const labels = options.length ? options.map((o) => o.label) : [WHOLE_ENTRY];
  const fallback = options.length ? pickSection(options, [remembered, slot.defaultSection])?.label : WHOLE_ENTRY;
  const selected = chosen && labels.includes(chosen) ? chosen : fallback;
  const prefixFor = (sectionText: string | undefined) =>
    slot.useInitials && initials && /agenda/i.test(sectionText ?? "") ? `${initials}: ` : "";
  const prefix = prefixFor(options.find((o) => o.label === selected)?.text);

  async function submit(openAfter: boolean) {
    const raw = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!raw.length) {
      await showToast(Toast.Style.Failure, "Nothing to add");
      return;
    }
    if (!date) {
      await showToast(Toast.Style.Failure, "Pick the meeting date");
      return;
    }
    setBusy(true);
    const toast = await showToast(Toast.Style.Animated, "Adding…");
    try {
      const n = await notionClient();
      const day = isoDay(date);
      const { entry, blocks } = await ensureEntry(slot, day);
      const { containerId, blocks: content } = await entryContent(n, slot.pageId, blocks, entry);
      const found = sectionsOf(content);
      const section =
        found.length && selected !== WHOLE_ENTRY ? pickSection(found, [selected, slot.defaultSection]) : undefined;
      const target = section ?? wholeEntrySection(entry);
      const pre = section ? prefixFor(section.text) : "";
      const lines = raw.map((l) => (pre && !l.startsWith(pre.trim()) ? pre + l : l));
      const count = await addItems(n, containerId, target, lines);
      if (section) setRemembered(section.label);
      onChanged();
      if (openAfter) await openEntry(slot, entry.id);
      toast.hide();
      const where = section ? ` › ${section.label}` : "";
      await showHUD(`Added ${count === 1 ? "1 item" : `${count} items`} to ${slot.title}, ${formatDay(day)}${where}`);
      await popToRoot({ clearSearchBar: true });
    } catch (err) {
      setBusy(false);
      await showFailureToast(err, { title: "Couldn't add the item" });
    }
  }

  const heading = sections.data
    ? sections.data.exists
      ? `Adds to the ${formatDay(date ? isoDay(date) : props.date)} entry on ${slot.database}.`
      : `No entry for ${formatDay(date ? isoDay(date) : props.date)} yet. Adding makes one from the page's Template first.`
    : "Reading the page…";

  return (
    <Form
      isLoading={busy || sections.isLoading}
      navigationTitle={`Add to ${slot.title}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Item" icon={Icon.Plus} onSubmit={() => submit(false)} />
          <Action.SubmitForm
            title="Add and Open Page"
            icon={Icon.ArrowNe}
            shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
            onSubmit={() => submit(true)}
          />
        </ActionPanel>
      }
    >
      <Form.Description title={slot.title} text={heading} />
      <Form.TextArea
        id="items"
        title="Items"
        placeholder={prefix ? `One per line. Each gets "${prefix.trim()}" in front.` : "One per line"}
        value={text}
        onChange={setText}
        autoFocus
      />
      <Form.Dropdown id="section" title="Under" value={selected ?? ""} onChange={(v) => v && setChosen(v)} isLoading={sections.isLoading}>
        {labels.map((l) => (
          <Form.Dropdown.Item key={l} value={l} title={l} />
        ))}
      </Form.Dropdown>
      <Form.DatePicker id="date" title="Meeting date" type={Form.DatePicker.Type.Date} value={date} onChange={setDate} />
    </Form>
  );
}
