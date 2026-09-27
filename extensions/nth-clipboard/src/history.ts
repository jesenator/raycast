import { Clipboard, closeMainWindow, showHUD } from "@raycast/api";

export const MAX_N = 6; // Raycast's Clipboard API caps history offset at 5

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export function parseN(raw: string): number | null {
  const n = Number.parseInt(raw.trim(), 10);
  if (Number.isNaN(n) || n < 1 || n > MAX_N) return null;
  return n;
}

export async function readNth(n: number): Promise<Clipboard.ReadContent | null> {
  const item = await Clipboard.read({ offset: n - 1 });
  if (!item.text && !item.file && !item.html) return null;
  return item;
}

function toContent(item: Clipboard.ReadContent): Clipboard.Content {
  if (item.file) return { file: item.file };
  if (item.html) return { html: item.html, text: item.text };
  return { text: item.text };
}

export async function pasteNth(n: number): Promise<void> {
  const item = await readNth(n);
  if (!item) {
    await showHUD(`No clipboard item at position ${n}`);
    return;
  }
  // Close Raycast first so the paste lands in the previously focused app
  await closeMainWindow();
  await Clipboard.paste(toContent(item));
}

export async function copyNth(n: number): Promise<void> {
  const item = await readNth(n);
  if (!item) {
    await showHUD(`No clipboard item at position ${n}`);
    return;
  }
  await Clipboard.copy(toContent(item));
  const preview = item.text ? ` (${item.text.slice(0, 40)}${item.text.length > 40 ? "…" : ""})` : "";
  await showHUD(`Copied ${ORDINALS[n - 1]} item${preview}`);
}

export async function invalidN(raw: string): Promise<void> {
  await showHUD(`"${raw}" isn't valid — use a number from 1 to ${MAX_N}`);
}
