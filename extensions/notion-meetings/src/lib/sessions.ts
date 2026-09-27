import type { Block, Notion, Section } from "./notion";

/**
 * 1:1s that live on one running page ("Me <> Name 1:1s") instead of a database: each
 * meeting is an entry headed by a date mention, newest first, usually below a "Template"
 * toggle and a divider. Entries are either toggle headings holding the meeting's blocks
 * (most pages) or plain headings followed by them (some pages skip toggles).
 */

export type Entry = {
  /** The heading or toggle block that carries the date mention. */
  id: string;
  date: string;
  toggle: boolean;
  /** Index among the page's top-level blocks. */
  index: number;
};

type RichText = { type: string; plain_text?: string; text?: { content: string; link?: { url: string } | null }; mention?: any; annotations?: any };

const HEADINGS = ["heading_1", "heading_2", "heading_3"];
const ENTRY_TYPES = [...HEADINGS, "toggle"];

function inner(b: Block): { rich_text?: RichText[]; is_toggleable?: boolean } {
  return (b[b.type] as { rich_text?: RichText[]; is_toggleable?: boolean }) ?? {};
}

function plain(b: Block): string {
  return (inner(b).rich_text ?? []).map((t) => t.plain_text ?? t.text?.content ?? "").join("").trim();
}

function dateMention(b: Block): string | undefined {
  const m = (inner(b).rich_text ?? []).find((t) => t.type === "mention" && t.mention?.type === "date");
  return m?.mention?.date?.start?.slice(0, 10);
}

function isToggle(b: Block): boolean {
  return b.type === "toggle" || Boolean(inner(b).is_toggleable);
}

/** Dated entries among a page's top-level blocks, in page order. */
export function entriesOf(blocks: Block[]): Entry[] {
  const out: Entry[] = [];
  blocks.forEach((b, index) => {
    if (!ENTRY_TYPES.includes(b.type)) return;
    const date = dateMention(b);
    if (date) out.push({ id: b.id, date, toggle: isToggle(b), index });
  });
  return out;
}

export function templateOf(blocks: Block[]): Block | undefined {
  return blocks.find((b) => ENTRY_TYPES.includes(b.type) && plain(b).toLowerCase() === "template" && b.has_children);
}

/**
 * The blocks inside an entry and the parent new blocks go into: a toggle's children, or for a
 * plain heading the top-level blocks after it up to the next entry, divider, or heading of the
 * same or higher level.
 */
export async function entryContent(n: Notion, pageId: string, blocks: Block[], entry: Entry): Promise<{ containerId: string; blocks: Block[] }> {
  if (entry.toggle) return { containerId: entry.id, blocks: await n.children(entry.id) };
  const head = blocks[entry.index];
  const level = HEADINGS.includes(head.type) ? Number(head.type.slice(-1)) : 1;
  const out: Block[] = [];
  for (let j = entry.index + 1; j < blocks.length; j++) {
    const b = blocks[j];
    if (b.type === "divider" || dateMention(b)) break;
    if (HEADINGS.includes(b.type) && Number(b.type.slice(-1)) <= level) break;
    out.push(b);
  }
  return { containerId: pageId, blocks: out };
}

/** A stand-in section for entries with no sub-headings: items go straight into the entry. */
export function wholeEntrySection(entry: Entry): Section {
  return { id: entry.id, label: "This meeting", text: "This meeting", level: 2, toggle: true, run: [] };
}

// ---------------------------------------------------------------------------
// Creating an entry

type Node = { block: Record<string, unknown>; children: Node[] };

const COPYABLE = [...HEADINGS, "paragraph", "to_do", "bulleted_list_item", "numbered_list_item", "toggle", "divider", "quote", "callout"];

function copyRichText(rt: RichText[] = []): object[] {
  return rt.map((t) => {
    const annotations = t.annotations;
    if (t.type === "text" && t.text) return { type: "text", text: { content: t.text.content, link: t.text.link ?? null }, annotations };
    if (t.type === "mention" && t.mention && ["date", "user", "page", "database"].includes(t.mention.type)) {
      const m = t.mention;
      const value = m.type === "date" ? { start: m.date.start, end: m.date.end ?? null } : { id: m[m.type].id };
      return { type: "mention", mention: { type: m.type, [m.type]: value }, annotations };
    }
    return { type: "text", text: { content: t.plain_text ?? "" }, annotations };
  });
}

/** A block's writable fields, as a create payload (no children). Null for types we don't copy. */
function copyBlock(b: Block): Record<string, unknown> | null {
  if (!COPYABLE.includes(b.type)) return null;
  if (b.type === "divider") return { type: "divider", divider: {} };
  const src = (b[b.type] as Record<string, any>) ?? {};
  const body: Record<string, unknown> = { rich_text: copyRichText(src.rich_text) };
  if (src.color) body.color = src.color;
  if (b.type === "to_do") body.checked = false;
  if (HEADINGS.includes(b.type)) body.is_toggleable = Boolean(src.is_toggleable);
  if (b.type === "callout" && src.icon) body.icon = src.icon;
  return { type: b.type, [b.type]: body };
}

async function readTree(n: Notion, parentId: string, depth: number): Promise<Node[]> {
  const out: Node[] = [];
  for (const b of await n.children(parentId)) {
    const block = copyBlock(b);
    if (!block) continue;
    out.push({ block, children: b.has_children && depth > 0 ? await readTree(n, b.id, depth - 1) : [] });
  }
  return out;
}

/** Append nodes under a parent, then each node's children under the block it became. */
async function appendTree(n: Notion, parentId: string, nodes: Node[], position?: object): Promise<string[]> {
  if (!nodes.length) return [];
  const body: Record<string, unknown> = { children: nodes.map((x) => x.block) };
  if (position) body.position = position;
  const res = await n.call<{ results: Block[] }>("PATCH", `blocks/${parentId}/children`, body);
  const ids = res.results.map((b) => b.id);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].children.length) await appendTree(n, ids[i], nodes[i].children);
  }
  return ids;
}

/**
 * Add an entry for `date`, shaped like the page's own: its Template's contents when there is
 * one, else the headings of the most recent entry (for pages without a template). The entry's
 * heading copies the most recent entry's type (toggle heading or plain heading). It goes
 * right under the template and its divider, or at the top of the page.
 */
export async function createEntry(n: Notion, pageId: string, blocks: Block[], date: string): Promise<Entry> {
  const entries = entriesOf(blocks);
  const latest = entries[0] ? blocks[entries[0].index] : undefined;
  const headType = latest && ENTRY_TYPES.includes(latest.type) ? latest.type : "heading_2";
  const toggle = latest ? isToggle(latest) : true;

  const template = templateOf(blocks);
  let body: Node[];
  if (template) {
    body = await readTree(n, template.id, 2);
  } else if (latest && entries[0]) {
    const { blocks: content } = await entryContent(n, pageId, blocks, entries[0]);
    body = content.filter((b) => HEADINGS.includes(b.type) && !inner(b).is_toggleable).map((b) => ({ block: copyBlock(b)!, children: [] }));
  } else {
    body = [];
  }

  const headBody: Record<string, unknown> = { rich_text: [{ type: "mention", mention: { type: "date", date: { start: date } } }] };
  if (headType !== "toggle") headBody.is_toggleable = toggle;
  const head = { type: headType, [headType]: headBody };

  let position: object = { type: "start" };
  if (template) {
    const at = blocks.findIndex((b) => b.id === template.id);
    const after = blocks[at + 1]?.type === "divider" ? blocks[at + 1] : template;
    position = { type: "after_block", after_block: { id: after.id } };
  }

  const nodes: Node[] = toggle || headType === "toggle" ? [{ block: head, children: body }] : [{ block: head, children: [] }, ...body];
  const [id] = await appendTree(n, pageId, nodes, position);
  return { id, date, toggle: toggle || headType === "toggle", index: -1 };
}
