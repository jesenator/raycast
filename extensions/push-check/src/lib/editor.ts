import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { showAtRef } from "./git";

function run(cli: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { detached: true, stdio: "ignore" });
    child.on("error", (err) => reject(new Error(`Could not run ${cli}: ${err.message}`)));
    child.on("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

/** Open a file in the editor, reusing the last window. */
export async function openFile(cli: string, absPath: string): Promise<void> {
  await run(cli, ["-r", absPath]);
}

export async function openFolder(cli: string, absPath: string): Promise<void> {
  await run(cli, [absPath]);
}

/**
 * Write `file` as it exists at `ref` into a temp tree that keeps the original basename, so the editor's diff tab
 * reads "settings.ts (origin-main) ↔ settings.ts". A null ref, or a file missing at the ref (added or deleted),
 * yields an empty placeholder so the diff still opens.
 */
export async function materialize(worktree: string, ref: string | null, file: string, shortSha: string): Promise<string> {
  const label = (ref ?? "empty").replace(/[^A-Za-z0-9._-]+/g, "-");
  const dest = path.join(os.tmpdir(), "push-check", `${label}-${shortSha}`, file);
  await mkdir(path.dirname(dest), { recursive: true });
  const content = ref ? await showAtRef(worktree, ref, file) : null;
  await writeFile(dest, content ?? Buffer.alloc(0));
  return dest;
}

/** Open a side-by-side diff in the editor. `left` is the "before" side. */
export async function openDiff(cli: string, left: string, right: string): Promise<void> {
  await run(cli, ["-r", "--diff", left, right]);
}
