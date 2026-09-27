import { getPreferenceValues } from "@raycast/api";
import { readFile } from "node:fs/promises";

export type Prefs = {
  notionToken?: string;
  notionEnvFile?: string;
  googleSecretsDir?: string;
  initials?: string;
};

export function prefs(): Prefs {
  const p = getPreferenceValues<Prefs>();
  return {
    ...p,
    googleSecretsDir: p.googleSecretsDir?.trim().replace(/\/$/, "") || undefined,
    initials: (p.initials ?? "").trim(),
  };
}

/** The Notion token from preferences, else NOTION_API_KEY in the env file. Null when neither has one. */
export async function resolveNotionToken(p: Prefs): Promise<string | null> {
  if (p.notionToken?.trim()) return p.notionToken.trim();
  if (!p.notionEnvFile) return null;
  try {
    const text = await readFile(p.notionEnvFile, "utf8");
    for (const raw of text.split("\n")) {
      const m = raw.trim().match(/^(?:export\s+)?NOTION_API_KEY\s*=\s*(.*)$/);
      if (m) return m[1].trim().replace(/^(['"])(.*)\1$/, "$2") || null;
    }
  } catch {
    return null;
  }
  return null;
}
