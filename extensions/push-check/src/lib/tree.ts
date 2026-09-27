import type { ChangedFile } from "./git";

export type TreeNode = {
  /** Stable id: the repo-relative path of the folder or file. */
  path: string;
  /** Display name. Compacted chains carry the joined path, e.g. "lab/spar/slack" or ".claude/skills/x/SKILL.md". */
  name: string;
  kind: "folder" | "file";
  depth: number;
  children: TreeNode[];
  /** Every changed file at or below this node. */
  files: ChangedFile[];
  added: number;
  deleted: number;
  file?: ChangedFile;
};

type Building = { path: string; name: string; children: Map<string, Building>; file?: ChangedFile };

function build(files: ChangedFile[]): Building {
  const root: Building = { path: "", name: "", children: new Map() };
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const p = parts.slice(0, i + 1).join("/");
      let child = node.children.get(part);
      if (!child) {
        child = { path: p, name: part, children: new Map() };
        node.children.set(part, child);
      }
      if (i === parts.length - 1) child.file = f;
      node = child;
    });
  }
  return root;
}

function fileNode(b: Building, name: string, depth: number): TreeNode {
  const f = b.file!;
  return { path: b.path, name, kind: "file", depth, children: [], files: [f], added: f.added, deleted: f.deleted, file: f };
}

/**
 * Fold single-child chains into one row, like GitHub's tree view: "lab" > "spar" > "slack" with nothing else
 * becomes "lab/spar/slack", and a folder whose only content is one file becomes that file ("a/b/only.ts").
 */
function finish(b: Building, depth: number): TreeNode {
  if (b.file) return fileNode(b, b.name, depth);
  let current = b;
  let name = b.name;
  while (current.children.size === 1) {
    const only = [...current.children.values()][0];
    name = name ? `${name}/${only.name}` : only.name;
    if (only.file) return fileNode(only, name, depth);
    current = only;
  }
  const children = [...current.children.values()].map((c) => finish(c, depth + 1));
  children.sort((a, b2) => {
    if (a.kind !== b2.kind) return a.kind === "folder" ? -1 : 1;
    if (a.kind === "folder" && a.files.length !== b2.files.length) return b2.files.length - a.files.length;
    return a.name.localeCompare(b2.name);
  });
  const files = children.flatMap((c) => c.files);
  return {
    path: current.path,
    name,
    kind: "folder",
    depth,
    children,
    files,
    added: files.reduce((n, f) => n + f.added, 0),
    deleted: files.reduce((n, f) => n + f.deleted, 0),
  };
}

/** Top-level nodes of the compacted tree for a set of changed files. The root itself is never compacted. */
export function buildTree(files: ChangedFile[]): TreeNode[] {
  const root = build(files);
  const nodes = [...root.children.values()].map((c) => finish(c, 0));
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    if (a.kind === "folder" && a.files.length !== b.files.length) return b.files.length - a.files.length;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

export type Row = { node: TreeNode; prefix: string };

/**
 * Per-level indent marker: an en dash followed by BRAILLE PATTERN BLANK (U+2800). Raycast collapses runs of ordinary
 * spaces and trims Unicode whitespace, but U+2800 is a graphic character that renders as empty space, so
 * "–⠀–⠀name" reads as a two-level indent with light dash markers.
 */
const INDENT = "\u2013\u2800";

/** Depth-first rows for rendering, descending only into folders in `expanded` (or all of them when `all`). */
export function flatten(nodes: TreeNode[], expanded: Set<string>, all: boolean): Row[] {
  const out: Row[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      out.push({ node, prefix: INDENT.repeat(node.depth) });
      if (node.kind === "folder" && (all || expanded.has(node.path))) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function folderPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === "folder") {
        out.push(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}
