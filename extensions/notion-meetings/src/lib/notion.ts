import type { DbSlot } from "./config";

/** 2026-03-11 is the first version with template-based page creation and the `position` append param. */
const NOTION_VERSION = "2026-03-11";
const API = "https://api.notion.com/v1";

type RichText = { type: string; plain_text?: string; text?: { content: string; link?: { url: string } | null } };

export type Block = {
  id: string;
  type: string;
  has_children: boolean;
  in_trash?: boolean;
  [key: string]: unknown;
};

export type MeetingPage = { id: string; url: string; title: string; date: string };

export class NotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class Notion {
  constructor(private readonly token: string) {}

  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${API}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 4) {
        const wait = Number(res.headers.get("retry-after") ?? "1");
        await sleep(Math.min(wait, 5) * 1000);
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) {
        const hint =
          json?.code === "object_not_found"
            ? " (is the integration connected to this database? ••• → Connections in Notion)"
            : "";
        throw new NotionError(`${json?.message ?? res.statusText}${hint}`, res.status, json?.code);
      }
      return json as T;
    }
  }

  /** All children of a block or page, following pagination. */
  async children(blockId: string): Promise<Block[]> {
    const out: Block[] = [];
    let cursor: string | undefined;
    do {
      const q = cursor ? `?page_size=100&start_cursor=${cursor}` : "?page_size=100";
      const page = await this.call<{ results: Block[]; has_more: boolean; next_cursor: string | null }>(
        "GET",
        `blocks/${blockId}/children${q}`,
      );
      out.push(...page.results.filter((b) => !b.in_trash));
      cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return out;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function plain(rt: RichText[] | undefined): string {
  return (rt ?? []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
}

/** The database's date column. Most call it "Date"; some were made with a lowercase "date". */
function dateProp(slot: DbSlot): string {
  return slot.dateProperty ?? "Date";
}

function toMeetingPage(p: any, slot: DbSlot): MeetingPage {
  return {
    id: p.id,
    url: p.url,
    title: plain(p.properties?.Name?.title),
    date: p.properties?.[dateProp(slot)]?.date?.start?.slice(0, 10) ?? "",
  };
}

/** Name starts with any of the meeting's title prefixes. */
function titleFilter(slot: DbSlot): object {
  const each = slot.titlePrefixes.map((p) => ({ property: "Name", title: { starts_with: p } }));
  return each.length === 1 ? each[0] : { or: each };
}

async function queryPages(n: Notion, slot: DbSlot, dateFilter: object, direction: "ascending" | "descending", size: number) {
  const res = await n.call<{ results: any[] }>("POST", `data_sources/${slot.dataSourceId}/query`, {
    filter: { and: [titleFilter(slot), { property: dateProp(slot), date: dateFilter }] },
    sorts: [{ property: dateProp(slot), direction }],
    page_size: size,
  });
  return res.results.map((p) => toMeetingPage(p, slot));
}

/** This meeting's pages dated today or later, soonest first. */
export function upcomingPages(n: Notion, slot: DbSlot, today: string): Promise<MeetingPage[]> {
  return queryPages(n, slot, { on_or_after: today }, "ascending", 5);
}

/** This meeting's pages with no Date, created on or after `since`, newest first (automation pre-creates). */
export async function undatedPages(n: Notion, slot: DbSlot, since: string): Promise<MeetingPage[]> {
  const res = await n.call<{ results: any[] }>("POST", `data_sources/${slot.dataSourceId}/query`, {
    filter: {
      and: [
        titleFilter(slot),
        { property: dateProp(slot), date: { is_empty: true } },
        { timestamp: "created_time", created_time: { on_or_after: since } },
      ],
    },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 3,
  });
  return res.results.map((p) => toMeetingPage(p, slot));
}

/**
 * Give an undated automation page its meeting date. The title is left alone unless it still
 * holds a literal "@Today" (an automation can leave one), which becomes the usual @date title.
 */
export async function datePage(n: Notion, slot: DbSlot, page: MeetingPage, date: string): Promise<void> {
  const properties: Record<string, unknown> = { [dateProp(slot)]: { date: { start: date } } };
  if (/@today/i.test(page.title)) properties.Name = { title: titleRichText(slot, date) };
  await n.call("PATCH", `pages/${page.id}`, { properties });
}

/** The most recent page dated before today. */
export async function previousPage(n: Notion, slot: DbSlot, today: string): Promise<MeetingPage | null> {
  return (await queryPages(n, slot, { before: today }, "descending", 1))[0] ?? null;
}

function titleRichText(slot: DbSlot, date: string) {
  const parts: object[] = [{ type: "text", text: { content: slot.newTitle.before } }];
  parts.push({ type: "mention", mention: { type: "date", date: { start: date } } });
  if (slot.newTitle.after) parts.push({ type: "text", text: { content: slot.newTitle.after } });
  return parts;
}

function meetingProperties(slot: DbSlot, date: string) {
  return { Name: { title: titleRichText(slot, date) }, [dateProp(slot)]: { date: { start: date } } };
}

/**
 * Create the meeting's page from its template, dated `date`.
 *
 * Notion fills template content in asynchronously, so this waits until the page has blocks
 * (up to `timeoutMs`) and then re-applies the title and date, in case the template's "@Today"
 * values landed after ours.
 */
export async function createMeetingPage(
  n: Notion,
  slot: DbSlot,
  date: string,
  timeZone: string,
  timeoutMs = 15_000,
): Promise<{ page: MeetingPage; blocks: Block[] }> {
  const created = await n.call("POST", "pages", {
    parent: { type: "data_source_id", data_source_id: slot.dataSourceId },
    properties: meetingProperties(slot, date),
    template: { type: "template_id", template_id: slot.templateId, timezone: timeZone },
  });
  const blocks = await waitForContent(n, created.id, timeoutMs);
  const fresh = toMeetingPage(await n.call("GET", `pages/${created.id}`), slot);
  if (fresh.date !== date || !fresh.title.startsWith(slot.newTitle.before.trim())) {
    await n.call("PATCH", `pages/${created.id}`, { properties: meetingProperties(slot, date) });
  }
  return { page: { ...toMeetingPage(created, slot), date, title: fresh.title }, blocks };
}

/** Poll until the page has blocks and the count has stopped growing. */
async function waitForContent(n: Notion, pageId: string, timeoutMs: number): Promise<Block[]> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let blocks: Block[] = [];
  while (Date.now() < deadline) {
    await sleep(last < 0 ? 800 : 700);
    blocks = await n.children(pageId);
    if (blocks.length > 0 && blocks.length === last) return blocks;
    last = blocks.length;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Sections (headings) and adding items under them

const HEADINGS = ["heading_1", "heading_2", "heading_3"];
const LIST_TYPES = ["to_do", "bulleted_list_item", "numbered_list_item"];

export type Section = {
  /** Heading block id. */
  id: string;
  /** Display label, with the parent heading when nested: "Prep › Alex". */
  label: string;
  /** The heading's own text. */
  text: string;
  level: number;
  /** Toggle headings keep their items as children; plain headings are followed by them. */
  toggle: boolean;
  /** For plain headings: the top-level blocks after it, up to the next heading or divider. */
  run: Block[];
};

function blockText(b: Block): string {
  const inner = b[b.type] as { rich_text?: RichText[] } | undefined;
  return plain(inner?.rich_text).trim();
}

export function sectionsOf(blocks: Block[]): Section[] {
  const out: Section[] = [];
  const stack: Section[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!HEADINGS.includes(b.type)) continue;
    const level = Number(b.type.slice(-1));
    const text = blockText(b);
    if (!text) continue;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    const short = parent ? text.replace(new RegExp(`^${escapeRegExp(parent.text)}\\s*[:\\-–]\\s*`, "i"), "") : text;
    const run: Block[] = [];
    for (let j = i + 1; j < blocks.length && !HEADINGS.includes(blocks[j].type) && blocks[j].type !== "divider"; j++) {
      run.push(blocks[j]);
    }
    const inner = b[b.type] as { is_toggleable?: boolean };
    const section: Section = {
      id: b.id,
      label: parent ? `${parent.text} › ${short}` : text,
      text,
      level,
      toggle: Boolean(inner?.is_toggleable),
      run,
    };
    out.push(section);
    stack.push(section);
  }
  return out;
}

/** The section to preselect: the remembered label, else the slot's default heading, else the first one. */
export function pickSection(sections: Section[], preferred: (string | undefined)[]): Section | undefined {
  for (const want of preferred) {
    if (!want) continue;
    const w = want.toLowerCase();
    const hit = sections.find((s) => s.label.toLowerCase() === w) ?? sections.find((s) => s.text.toLowerCase() === w);
    if (hit) return hit;
  }
  return sections[0];
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const URL_RE = /https?:\/\/[^\s)]+/g;

/** Plain text to rich text, turning bare URLs into links. */
export function richText(text: string): object[] {
  const out: object[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: { content: text.slice(last, at) } });
    out.push({ type: "text", text: { content: m[0], link: { url: m[0] } } });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: { content: text.slice(last) } });
  return out;
}

function listBlock(type: string, text: string): object {
  const body: Record<string, unknown> = { rich_text: richText(text) };
  if (type === "to_do") body.checked = false;
  return { object: "block", type, [type]: body };
}

function isEmptyItem(b: Block): boolean {
  return LIST_TYPES.includes(b.type) && !b.has_children && blockText(b) === "";
}

/** The label inside prep toggles that holds the things to raise in the meeting. */
const DISCUSS_LABEL = /quick updates|things to discuss/i;

type Target = {
  parentId: string;
  /** Blocks already in the spot, in order. */
  run: Block[];
  /** Block to insert after when `run` is empty; undefined appends at the end of `parentId`. */
  emptyAnchor?: string;
};

/**
 * Where items for a section go. Plain headings: on the page, right after the heading's run.
 * Toggle headings: inside the toggle, under its "Quick updates & things to discuss today"
 * label when it has one (else a label that opens the toggle). Pages fill that label in two
 * ways, and both are handled: items nested under the label, or items following it as
 * siblings up to the next label (a toggle that opens with a different label, like "Any
 * diamonds or spades?", is why the discuss label is looked for by name).
 */
async function target(n: Notion, containerId: string, section: Section): Promise<Target> {
  if (!section.toggle) return { parentId: containerId, run: section.run, emptyAnchor: section.id };
  const kids = await n.children(section.id);
  const isLabel = (b: Block) => b.type === "paragraph" && blockText(b) !== "";
  let at = kids.findIndex((b) => isLabel(b) && DISCUSS_LABEL.test(blockText(b)));
  if (at < 0 && kids[0] && isLabel(kids[0])) at = 0;
  if (at < 0) return { parentId: section.id, run: kids };
  const label = kids[at];
  if (label.has_children) return { parentId: label.id, run: await n.children(label.id) };
  const run: Block[] = [];
  for (let j = at + 1; j < kids.length; j++) {
    const b = kids[j];
    if (isLabel(b) || b.type === "divider" || HEADINGS.includes(b.type)) break;
    run.push(b);
  }
  return { parentId: section.id, run, emptyAnchor: label.id };
}

/**
 * Add one item per line under a section. `containerId` is the block the section's headings
 * were read from: the page, or for a 1:1 entry kept in a toggle, that toggle. Empty
 * placeholder items the template left there are filled first, then the rest go right after
 * the section's last block, using the same block type as the items already there (to-dos
 * when there are none).
 */
export async function addItems(n: Notion, containerId: string, section: Section, lines: string[]): Promise<number> {
  const texts = lines.map((l) => l.trim()).filter(Boolean);
  if (!texts.length) return 0;
  const { parentId, run, emptyAnchor } = await target(n, containerId, section);
  const itemType = [...run].reverse().find((b) => LIST_TYPES.includes(b.type))?.type ?? "to_do";

  // After the run's last block (ignoring trailing blank spacer lines); with an empty run, right
  // after the heading or label, or at the end of the toggle or label's children.
  let end = run.length;
  while (end > 0 && run[end - 1].type === "paragraph" && !run[end - 1].has_children && !blockText(run[end - 1])) end--;
  let anchor: string | undefined = end ? run[end - 1].id : emptyAnchor;
  const queue = [...texts];
  for (const empty of run.filter(isEmptyItem)) {
    const text = queue.shift();
    if (text === undefined) break;
    const body: Record<string, unknown> = { rich_text: richText(text) };
    if (empty.type === "to_do") body.checked = false;
    await n.call("PATCH", `blocks/${empty.id}`, { [empty.type]: body });
    anchor = empty.id;
  }
  if (queue.length) {
    const children = queue.map((t) => listBlock(itemType, t));
    const position = anchor ? { type: "after_block", after_block: { id: anchor } } : { type: "end" };
    await n.call("PATCH", `blocks/${parentId}/children`, { children, position });
  }
  return texts.length;
}
