import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const GIT = "/usr/bin/git";

type ExecOpts = { maxBuffer?: number; timeoutMs?: number; okExitCodes?: number[] };

/** Run git in `cwd`. GIT_OPTIONAL_LOCKS=0 keeps read-only commands from touching the index, which matters in a checkout that other sessions are using at the same time. */
export async function git(cwd: string, args: string[], opts: ExecOpts = {}): Promise<string> {
  try {
    const { stdout } = await execFileP(GIT, ["-C", cwd, ...args], {
      maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 30_000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    });
    return stdout;
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    if (typeof e.code === "number" && opts.okExitCodes?.includes(e.code)) return e.stdout ?? "";
    const detail = (e.stderr ?? e.message ?? "").trim();
    throw new Error(`git ${args.slice(0, 2).join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
}

export type Worktree = {
  path: string;
  name: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  ahead: number;
  behind: number;
  dirty: number;
};

export async function listWorktrees(repo: string, baseRef: string): Promise<Worktree[]> {
  const out = await git(repo, ["worktree", "list", "--porcelain"]);
  const blocks = out.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  const bare = blocks.map((block, i) => {
    const lines = block.split("\n");
    const wtPath = lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length) ?? "";
    const head = lines.find((l) => l.startsWith("HEAD "))?.slice("HEAD ".length) ?? "";
    const branchLine = lines.find((l) => l.startsWith("branch "));
    const branch = branchLine ? branchLine.slice("branch ".length).replace(/^refs\/heads\//, "") : null;
    return { path: wtPath, name: path.basename(wtPath), head, branch, isMain: i === 0 };
  });
  return Promise.all(
    bare.map(async (wt) => {
      const [counts, dirty] = await Promise.all([aheadBehind(wt.path, baseRef), dirtyCount(wt.path)]);
      return { ...wt, ...counts, dirty };
    }),
  );
}

export async function aheadBehind(cwd: string, baseRef: string): Promise<{ ahead: number; behind: number }> {
  try {
    const out = await git(cwd, ["rev-list", "--left-right", "--count", `${baseRef}...HEAD`]);
    const [behind, ahead] = out.trim().split(/\s+/).map((n) => Number(n) || 0);
    return { ahead, behind };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

async function dirtyCount(cwd: string): Promise<number> {
  try {
    return (await statusFiles(cwd)).length;
  } catch {
    return 0;
  }
}

export type Commit = { sha: string; short: string; subject: string; author: string; when: string };

export async function logRange(cwd: string, range: string): Promise<Commit[]> {
  const out = await git(cwd, ["log", "--no-decorate", "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ar%x1e", range]);
  return out
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, ""))
    .filter((rec) => rec.trim())
    .map((rec) => {
      const [sha, short, subject, author, when] = rec.split("\x1f");
      return { sha, short, subject, author, when: (when ?? "").trim() };
    });
}

export type ChangedFile = {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
  /** Porcelain status for uncommitted files (M, A, D, ??, ...). Undefined for committed ranges. */
  status?: string;
};

export async function numstat(cwd: string, range: string): Promise<ChangedFile[]> {
  const out = await git(cwd, ["diff", "--numstat", "--no-renames", range]);
  return out
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [a, d, ...rest] = l.split("\t");
      const binary = a === "-";
      return { path: rest.join("\t"), added: binary ? 0 : Number(a), deleted: binary ? 0 : Number(d), binary };
    })
    .sort((x, y) => x.path.localeCompare(y.path));
}

/** Uncommitted changes (staged, unstaged, untracked). Renames report the new path. */
export async function statusFiles(cwd: string): Promise<ChangedFile[]> {
  const out = await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const fields = out.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!f) continue;
    const status = f.slice(0, 2);
    const p = f.slice(3);
    if (status[0] === "R" || status[0] === "C") i++; // the next field is the old path
    files.push({ path: p, added: 0, deleted: 0, binary: false, status: status.trim() || status });
  }
  return files.sort((x, y) => x.path.localeCompare(y.path));
}

export type Side = { commits: Commit[]; files: ChangedFile[] };

export type Review = {
  worktree: string;
  branch: string;
  baseRef: string;
  baseSha: string;
  headSha: string;
  mergeBase: string;
  outgoing: Side;
  incoming: Side;
  uncommitted: ChangedFile[];
  computedAt: number;
};

export async function loadReview(worktree: string, baseRef: string): Promise<Review> {
  const [branchRaw, baseSha, headSha] = await Promise.all([
    git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]),
    git(worktree, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]).catch(() => {
      throw new Error(`${baseRef} does not exist here. Fetch the remote (⌘R) or fix the base ref in preferences.`);
    }),
    git(worktree, ["rev-parse", "HEAD"]),
  ]);
  const mergeBase = (await git(worktree, ["merge-base", baseRef, "HEAD"])).trim();
  const [outCommits, outFiles, inCommits, inFiles, uncommitted] = await Promise.all([
    logRange(worktree, `${baseRef}..HEAD`),
    numstat(worktree, `${baseRef}...HEAD`),
    logRange(worktree, `HEAD..${baseRef}`),
    numstat(worktree, `HEAD...${baseRef}`),
    statusFiles(worktree),
  ]);
  return {
    worktree,
    branch: branchRaw.trim(),
    baseRef,
    baseSha: baseSha.trim(),
    headSha: headSha.trim(),
    mergeBase,
    outgoing: { commits: outCommits, files: outFiles },
    incoming: { commits: inCommits, files: inFiles },
    uncommitted,
    computedAt: Date.now(),
  };
}

export async function fetchRemote(cwd: string, baseRef: string): Promise<void> {
  const remote = baseRef.includes("/") ? baseRef.split("/")[0] : "origin";
  await git(cwd, ["fetch", "--quiet", remote], { timeoutMs: 45_000 });
}

export type DiffKind = "outgoing" | "incoming" | "uncommitted";

/** Unified diff for one file. Untracked files are diffed against /dev/null so they still show content. */
export async function fileDiff(cwd: string, kind: DiffKind, baseRef: string, file: ChangedFile): Promise<string> {
  if (kind === "outgoing") return git(cwd, ["diff", "--no-color", `${baseRef}...HEAD`, "--", file.path]);
  if (kind === "incoming") return git(cwd, ["diff", "--no-color", `HEAD...${baseRef}`, "--", file.path]);
  if (file.status === "??") {
    return git(cwd, ["diff", "--no-color", "--no-index", "--", "/dev/null", file.path], { okExitCodes: [1] });
  }
  return git(cwd, ["diff", "--no-color", "HEAD", "--", file.path]);
}

/** Full diff for a committed range, with lockfiles and binaries left out. Used as model input. */
export async function rangeDiffForSummary(cwd: string, range: string, files: ChangedFile[], maxChars: number): Promise<string> {
  const skip = (p: string) => /(^|\/)(bun\.lock|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|uv\.lock)$/.test(p);
  const wanted = files.filter((f) => !f.binary && !skip(f.path)).map((f) => f.path);
  if (wanted.length === 0) return "";
  const out = await git(cwd, ["diff", "--no-color", "--stat=120", "-p", range, "--", ...wanted], { maxBuffer: 256 * 1024 * 1024 });
  if (out.length <= maxChars) return out;
  return `${out.slice(0, maxChars)}\n\n[diff truncated at ${maxChars.toLocaleString()} characters; ${out.length.toLocaleString()} total]`;
}

/** Contents of `file` at `ref`, or null when it does not exist there (added or deleted files). */
export async function showAtRef(cwd: string, ref: string, file: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileP(GIT, ["-C", cwd, "show", `${ref}:${file}`], {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return stdout;
  } catch {
    return null;
  }
}
