const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Local calendar day as YYYY-MM-DD (Notion's date-only format). */
export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local midnight of a YYYY-MM-DD string (a bare `new Date("2026-09-28")` would be UTC midnight). */
export function parseIsoDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** First date on or after `from` that falls on any of `weekdays` (0 = Sunday). */
export function nextWeekday(from: Date, weekdays: number[]): Date {
  const start = startOfDay(from);
  const ahead = Math.min(...weekdays.map((w) => (w - start.getDay() + 7) % 7));
  return addDays(start, ahead);
}

/** "Monday", "Monday or Wednesday". */
export function weekdayNames(weekdays: number[]): string {
  return weekdays.map((w) => WEEKDAYS[w]).join(" or ");
}

/** "Today", "Tomorrow", "Yesterday", else "Wed, September 30" (month spelled out, never numeric). */
export function formatDay(iso: string, now = new Date()): string {
  const diff = Math.round((parseIsoDay(iso).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = parseIsoDay(iso);
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "long", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** "11am", "2:30pm". */
export function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}
