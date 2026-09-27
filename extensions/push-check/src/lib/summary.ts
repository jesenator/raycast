import { Cache } from "@raycast/api";
import type { Commit, ChangedFile } from "./git";
import type { Prefs } from "./prefs";
import { maxDiffChars, resolveApiKey } from "./prefs";
import { rangeDiffForSummary } from "./git";
import { groupByFolder } from "./deploy";

const cache = new Cache({ namespace: "push-check-summaries" });

export type SummaryInput = {
  worktree: string;
  side: "outgoing" | "incoming";
  range: string;
  baseSha: string;
  headSha: string;
  branch: string;
  baseRef: string;
  commits: Commit[];
  files: ChangedFile[];
  affected: string[];
};

export function summaryCacheKey(p: Prefs, input: SummaryInput): string {
  return `v3:${p.aiProvider}:${p.model}:${input.side}:${input.baseSha}:${input.headSha}`;
}

export function cachedSummary(p: Prefs, input: SummaryInput): string | undefined {
  return cache.get(summaryCacheKey(p, input));
}

export function forgetSummary(p: Prefs, input: SummaryInput): void {
  cache.remove(summaryCacheKey(p, input));
}

function anthropicModel(model: string): string {
  return model.replace(/^anthropic\//, "").replace(/\./g, "-");
}

const SYSTEM = [
  "You summarize a git change set for the developer who is about to push or pull it.",
  "Write 3 to 8 short bullets in plain Markdown (lines starting with '- '). No headers, no preamble, no closing line.",
  "Order the bullets by how much the reader needs to know about them, most important first:",
  "(1) risks, each in its own bullet written as '- Risk: `folder/or/app` what and why' (schema or migration changes, auth, deletions of data or files, secrets, anything under deployable paths such as apps/, backend/, packages/, lockfiles);",
  "(2) behaviour changes to code that runs (scripts, services, forms, websites);",
  "(3) documentation, notes, logs, and formatting last, folded into as few bullets as possible.",
  "Every other bullet starts with the folder or app it concerns, in backticks, then a colon. The word Risk never goes inside backticks.",
  "Wrap every file name, folder path, script name, and identifier in backticks, e.g. `lab/spar/support/status.py` or `--limit`.",
  "If the diff is truncated, say so in the last bullet.",
  "Never use em dashes. Be concrete and terse.",
].join(" ");

function buildPrompt(input: SummaryInput, diff: string): string {
  const direction =
    input.side === "outgoing"
      ? `OUTGOING: commits on ${input.branch} that ${input.baseRef} does not have yet (what a push or merge would ship).`
      : `INCOMING: commits on ${input.baseRef} that ${input.branch} does not have yet (what a pull would bring in).`;
  const commits = input.commits.map((c) => `${c.short} ${c.subject} (${c.author}, ${c.when})`).join("\n");
  const folders = groupByFolder(input.files)
    .map((g) => `${g.key}: ${g.files.length} files, +${g.added} -${g.deleted}`)
    .join("\n");
  const affected = input.affected.length ? input.affected.join(", ") : "none";
  return [
    direction,
    "",
    `Commits (${input.commits.length}):`,
    commits || "(none)",
    "",
    `Files by folder (${input.files.length} files):`,
    folders || "(none)",
    "",
    `Deploy targets touched: ${affected}`,
    "",
    "Diff:",
    diff || "(no textual diff; only binaries or lockfiles changed)",
  ].join("\n");
}

async function callOpenRouter(key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://raycast.com",
      "X-Title": "Push Check (Raycast)",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned an empty response");
  return text;
}

async function callAnthropic(key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: anthropicModel(model),
      max_tokens: 700,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Anthropic returned an empty response");
  return text;
}

const PATH_EXTS = "md|py|ts|tsx|js|jsx|mjs|cjs|json|jsonc|toml|ya?ml|sh|astro|css|html|sql|txt|lock|env|csv|ipynb";
const BARE_PATH = new RegExp(`(^|[\\s(\\[])((?:[\\w@.-]+/)+[\\w@.-]*|[\\w-]+\\.(?:${PATH_EXTS}))(?=$|[\\s.,;:)\\]!?])`, "g");

/** Wrap bare file and folder paths in backticks, leaving anything already inside backticks alone. */
export function codifyPaths(text: string): string {
  return text
    .split("`")
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(BARE_PATH, "$1`$2`")))
    .join("`");
}

/**
 * Display-time cleanup applied to cached and fresh summaries alike: "Risk:" becomes bold and is pulled out of
 * backticks when the model wrapped it together with the path ("`Risk: lab/ashby`" -> "**Risk:** `lab/ashby`").
 */
export function polishSummary(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s*[-*]\s+)`Risk:\s*([^`]+)`/i, "$1**Risk:** `$2`")
        .replace(/^(\s*[-*]\s+)Risk:\s*/i, "$1**Risk:** "),
    )
    .join("\n");
}

/** Summarize one side of the review, caching per (provider, model, side, base sha, head sha). */
export async function summarize(p: Prefs, input: SummaryInput, opts: { force?: boolean } = {}): Promise<string> {
  const key = summaryCacheKey(p, input);
  if (!opts.force) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  if (input.commits.length === 0) return "";
  const apiKey = await resolveApiKey(p);
  if (!apiKey) {
    throw new Error(
      p.aiProvider === "anthropic"
        ? "No Anthropic key: set one in preferences or point the env file at one with ANTHROPIC_API_KEY."
        : "No OpenRouter key: set one in preferences or point the env file at one with OPENROUTER_API_KEY.",
    );
  }
  const diff = await rangeDiffForSummary(input.worktree, input.range, input.files, maxDiffChars(p));
  const prompt = buildPrompt(input, diff);
  const raw = p.aiProvider === "anthropic" ? await callAnthropic(apiKey, p.model, prompt) : await callOpenRouter(apiKey, p.model, prompt);
  const text = codifyPaths(raw);
  cache.set(key, text);
  return text;
}
