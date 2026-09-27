import { readFile } from "node:fs/promises";
import path from "node:path";
import { addDays, startOfDay } from "./dates";

/**
 * Google Calendar access through an installed-app Google OAuth login saved as `token.json`
 * (refresh token and scopes) next to its OAuth client in `oauth_client.json`, the layout the
 * Kairos repo's `lab/lib/google_auth.py` writes. This module only reads those files: it refreshes an access token in
 * memory and never writes back, so whatever made the login stays the one owner of the file.
 */

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

export type CalEvent = { summary: string; start: Date; allDay: boolean; link?: string };

export class CalendarUnavailable extends Error {
  constructor(
    message: string,
    /** A page that fixes it, when there is one (e.g. the API's enable button). */
    readonly url?: string,
  ) {
    super(message);
  }
}

type TokenFile = { access_token?: string; refresh_token?: string; expires_at?: number; scopes?: string[] };

async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    throw new CalendarUnavailable(`Can't read ${file}`);
  }
}

async function accessToken(secretsDir: string): Promise<string> {
  const token = await readJson<TokenFile>(path.join(secretsDir, "token.json"));
  if (!token.scopes?.some((s) => CALENDAR_SCOPES.includes(s))) {
    throw new CalendarUnavailable(
      "The lab Google login has no calendar scope. Run: uv run lab/lib/google_auth.py auth --scope https://www.googleapis.com/auth/calendar.readonly",
    );
  }
  if (token.access_token && (token.expires_at ?? 0) > Date.now() / 1000 + 120) return token.access_token;
  if (!token.refresh_token) throw new CalendarUnavailable("The lab Google token has no refresh token");
  const client = await readJson<{ installed?: Record<string, string>; web?: Record<string, string> }>(
    path.join(secretsDir, "oauth_client.json"),
  );
  const c = client.installed ?? client.web;
  if (!c?.client_id) throw new CalendarUnavailable("oauth_client.json has no client_id");
  const res = await fetch(c.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.client_id,
      client_secret: c.client_secret ?? "",
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new CalendarUnavailable(`Google token refresh failed: ${json.error_description ?? res.statusText}`);
  }
  return json.access_token;
}

/** Events on the primary calendar from the start of today through `days` ahead, minus declined and cancelled ones. */
export async function upcomingEvents(secretsDir: string, days = 35, now = new Date()): Promise<CalEvent[]> {
  const at = await accessToken(secretsDir);
  const from = startOfDay(now);
  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: addDays(from, days).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${at}` },
  });
  const json = (await res.json().catch(() => ({}))) as { items?: any[]; error?: { message?: string } };
  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText;
    const enable = msg.match(/https:\/\/console\.developers\.google\.com\/\S+?(?=\s|$)/)?.[0];
    if (enable) throw new CalendarUnavailable("The Calendar API is off in the lab's Google Cloud project", enable);
    throw new CalendarUnavailable(`Google Calendar: ${msg}`);
  }
  return (json.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .filter((e) => !["workingLocation", "outOfOffice", "focusTime"].includes(e.eventType))
    .filter((e) => !(e.attendees ?? []).some((a: any) => a.self && a.responseStatus === "declined"))
    .map((e) => {
      const allDay = !e.start?.dateTime;
      const start = allDay ? new Date(`${e.start.date}T00:00:00`) : new Date(e.start.dateTime);
      return { summary: e.summary ?? "", start, allDay, link: e.htmlLink };
    });
}
