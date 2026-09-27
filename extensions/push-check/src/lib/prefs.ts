import { getPreferenceValues } from "@raycast/api";
import { readFile } from "node:fs/promises";

export type Provider = "openrouter" | "anthropic" | "off";

export type Prefs = {
  repoPath: string;
  baseRef: string;
  fetchOnOpen: boolean;
  editorCli: string;
  autoDeployWorkers: string;
  aiProvider: Provider;
  autoSummarize: boolean;
  model: string;
  apiKey?: string;
  apiKeyEnvFile?: string;
  maxDiffChars: string;
};

export function prefs(): Prefs {
  const p = getPreferenceValues<Prefs>();
  return {
    ...p,
    repoPath: p.repoPath.replace(/\/$/, ""),
    baseRef: (p.baseRef || "origin/main").trim(),
    model: (p.model || "anthropic/claude-opus-5").trim(),
    editorCli: (p.editorCli || "/Applications/Cursor.app/Contents/Resources/app/bin/cursor").trim(),
  };
}

export function autoWorkerNames(p: Prefs): string[] {
  return p.autoDeployWorkers.split(",").map((s) => s.trim()).filter(Boolean);
}

export function maxDiffChars(p: Prefs): number {
  const n = Number(p.maxDiffChars);
  return Number.isFinite(n) && n > 1000 ? n : 80_000;
}

/** The API key from preferences, else from the configured dotenv file. Returns null when neither has one. */
export async function resolveApiKey(p: Prefs): Promise<string | null> {
  if (p.apiKey?.trim()) return p.apiKey.trim();
  if (!p.apiKeyEnvFile) return null;
  const wanted = p.aiProvider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENROUTER_API_KEY";
  try {
    const text = await readFile(p.apiKeyEnvFile, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m || m[1] !== wanted) continue;
      return m[2].trim().replace(/^(['"])(.*)\1$/, "$2") || null;
    }
  } catch {
    return null;
  }
  return null;
}
