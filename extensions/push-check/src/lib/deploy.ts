import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Something that ships when main moves: a Cloudflare worker (Workers Builds) or the Convex backend (CI job). */
export type DeployTarget = {
  name: string;
  packageName: string;
  dir: string;
  kind: "worker" | "convex";
  /** True when a push to main deploys it without anyone running a command. */
  auto: boolean;
  /** Repo-relative paths that trigger a rebuild, mirroring Workers Builds watch paths: the app dir, its workspace deps (transitively), bun.lock and the root package.json. */
  watchPaths: string[];
};

type Pkg = { dir: string; name: string; deps: string[] };

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Expand the root package.json `workspaces` globs (only the `dir/*` and literal forms are needed here). */
async function workspaceDirs(root: string): Promise<string[]> {
  const rootPkg = await readJson(path.join(root, "package.json"));
  const ws = rootPkg?.workspaces as string[] | { packages?: string[] } | undefined;
  const globs = Array.isArray(ws) ? ws : (ws?.packages ?? []);
  const dirs: string[] = [];
  for (const g of globs) {
    if (g.endsWith("/*")) {
      const parent = g.slice(0, -2);
      const entries = await readdir(path.join(root, parent), { withFileTypes: true }).catch(() => []);
      for (const e of entries) if (e.isDirectory()) dirs.push(path.posix.join(parent, e.name));
    } else {
      dirs.push(g.replace(/\/$/, ""));
    }
  }
  return dirs;
}

export async function loadDeployTargets(root: string, autoNames: string[]): Promise<DeployTarget[]> {
  const dirs = await workspaceDirs(root);
  const pkgs: Pkg[] = [];
  for (const dir of dirs) {
    const pkg = await readJson(path.join(root, dir, "package.json"));
    if (!pkg || typeof pkg.name !== "string") continue;
    const deps = Object.keys({
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    });
    pkgs.push({ dir, name: pkg.name, deps });
  }
  const byName = new Map(pkgs.map((p) => [p.name, p]));

  const transitiveDirs = (pkg: Pkg): string[] => {
    const seen = new Set<string>();
    const stack = [...pkg.deps];
    while (stack.length) {
      const n = stack.pop()!;
      const dep = byName.get(n);
      if (!dep || seen.has(dep.dir) || dep.dir === pkg.dir) continue;
      seen.add(dep.dir);
      stack.push(...dep.deps);
    }
    return [...seen].sort();
  };

  const auto = new Set(autoNames.map((n) => n.trim()).filter(Boolean));
  const targets: DeployTarget[] = [];
  for (const pkg of pkgs) {
    const base = path.basename(pkg.dir);
    const shortName = pkg.name.replace(/^@[^/]+\//, "");
    const isWorker =
      (await exists(path.join(root, pkg.dir, "wrangler.jsonc"))) ||
      (await exists(path.join(root, pkg.dir, "wrangler.json"))) ||
      (await exists(path.join(root, pkg.dir, "wrangler.toml")));
    const isConvex = (await exists(path.join(root, pkg.dir, "convex.json"))) || (await exists(path.join(root, pkg.dir, "convex", "schema.ts")));
    if (!isWorker && !isConvex) continue;
    const kind: DeployTarget["kind"] = isWorker ? "worker" : "convex";
    targets.push({
      name: kind === "convex" ? `convex (${base})` : base,
      packageName: pkg.name,
      dir: pkg.dir,
      kind,
      auto: kind === "convex" ? true : auto.has(base) || auto.has(shortName) || auto.has(pkg.name),
      watchPaths: kind === "worker" ? [pkg.dir, ...transitiveDirs(pkg), "bun.lock", "package.json"] : [pkg.dir, ...transitiveDirs(pkg)],
    });
  }
  return targets.sort((a, b) => Number(b.auto) - Number(a.auto) || a.name.localeCompare(b.name));
}

export type Impact = { target: DeployTarget; files: string[] };

function underWatch(file: string, watch: string): boolean {
  return file === watch || file.startsWith(`${watch}/`);
}

export function computeImpact(files: string[], targets: DeployTarget[]): Impact[] {
  return targets
    .map((target) => ({ target, files: files.filter((f) => target.watchPaths.some((w) => underWatch(f, w))) }))
    .filter((i) => i.files.length > 0);
}

/** Targets (auto or manual) that a single file would rebuild. */
export function targetsForFile(file: string, targets: DeployTarget[]): DeployTarget[] {
  return targets.filter((t) => t.watchPaths.some((w) => underWatch(file, w)));
}

/** Group key for the at-a-glance folder view: the first two path segments (`lab/spar`), or the file itself at the repo root. */
export function folderKey(file: string): string {
  const parts = file.split("/");
  if (parts.length === 1) return parts[0];
  return parts.slice(0, 2).join("/");
}

export type FolderGroup = { key: string; files: string[]; added: number; deleted: number };

export function groupByFolder<T extends { path: string; added: number; deleted: number }>(files: T[]): FolderGroup[] {
  const groups = new Map<string, FolderGroup>();
  for (const f of files) {
    const key = folderKey(f.path);
    const g = groups.get(key) ?? { key, files: [], added: 0, deleted: 0 };
    g.files.push(f.path);
    g.added += f.added;
    g.deleted += f.deleted;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.files.length - a.files.length || a.key.localeCompare(b.key));
}
