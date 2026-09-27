import { Action, ActionPanel, Color, Icon, Keyboard, List, Toast, showToast } from "@raycast/api";
import { showFailureToast, useCachedPromise, useCachedState, usePromise } from "@raycast/utils";
import path from "node:path";
import { useEffect, useMemo, useRef, useState } from "react";
import { computeImpact, groupByFolder, loadDeployTargets, targetsForFile, type DeployTarget, type Impact } from "./lib/deploy";
import { fileExists, materialize, openDiff, openFile, openFolder } from "./lib/editor";
import { fetchRemote, fileDiff, listWorktrees, loadReview, type ChangedFile, type DiffKind, type Review, type Side } from "./lib/git";
import { autoWorkerNames, prefs, type Prefs } from "./lib/prefs";
import { cachedSummary, polishSummary, summarize, type SummaryInput } from "./lib/summary";
import { buildTree, flatten, folderPaths, type TreeNode } from "./lib/tree";

type SummaryState = { text?: string; error?: string; loading: boolean };
type SideName = "outgoing" | "incoming";

export default function PushCheck() {
  const p = useMemo(prefs, []);
  const autoNames = useMemo(() => autoWorkerNames(p), [p]);
  const [storedWt, setStoredWt] = useCachedState<string>("selected-worktree", p.repoPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inflight = useRef(new Set<string>());

  const worktrees = useCachedPromise(listWorktrees, [p.repoPath, p.baseRef], { keepPreviousData: true });
  const wtPath = worktrees.data?.some((w) => w.path === storedWt) ? storedWt : p.repoPath;
  const review = useCachedPromise(loadReview, [wtPath, p.baseRef], { keepPreviousData: true });
  const targets = useCachedPromise(loadDeployTargets, [wtPath, autoNames], { keepPreviousData: true });
  const targetList = targets.data ?? [];

  async function doFetch(interactive: boolean) {
    setFetching(true);
    try {
      await fetchRemote(p.repoPath, p.baseRef);
      await Promise.all([worktrees.revalidate(), review.revalidate()]);
      if (interactive) await showToast(Toast.Style.Success, "Fetched", p.baseRef.split("/")[0]);
    } catch (err) {
      if (interactive) await showFailureToast(err, { title: "Fetch failed" });
    } finally {
      setFetching(false);
    }
  }

  const fetchedOnce = useRef(false);
  useEffect(() => {
    if (!p.fetchOnOpen || fetchedOnce.current) return;
    fetchedOnce.current = true;
    void doFetch(false);
  }, []);

  function summaryKey(side: SideName, r: Review) {
    return `${side}:${r.baseSha}:${r.headSha}`;
  }

  function buildInput(r: Review, side: SideName): SummaryInput {
    const s = side === "outgoing" ? r.outgoing : r.incoming;
    const range = side === "outgoing" ? `${r.baseRef}...HEAD` : `HEAD...${r.baseRef}`;
    const affected = computeImpact(
      s.files.map((f) => f.path),
      targetList,
    ).map((i) => i.target.name);
    return { worktree: r.worktree, side, range, baseSha: r.baseSha, headSha: r.headSha, branch: r.branch, baseRef: r.baseRef, commits: s.commits, files: s.files, affected };
  }

  async function runSummary(r: Review, side: SideName, force: boolean) {
    const key = summaryKey(side, r);
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    console.log(`[push-check] summarizing ${side} with ${p.aiProvider}/${p.model}${force ? " (forced)" : ""}`);
    setSummaries((s) => ({ ...s, [key]: { ...s[key], loading: true, error: undefined } }));
    try {
      const text = await summarize(p, buildInput(r, side), { force });
      console.log(`[push-check] ${side} summary ready (${text.length} chars)`);
      setSummaries((s) => ({ ...s, [key]: { text, loading: false } }));
    } catch (err) {
      console.error(`[push-check] ${side} summary failed:`, err instanceof Error ? err.message : err);
      setSummaries((s) => ({ ...s, [key]: { ...s[key], loading: false, error: err instanceof Error ? err.message : String(err) } }));
    } finally {
      inflight.current.delete(key);
    }
  }

  const r = review.data;
  const reviewKey = r ? `${r.worktree}|${r.baseSha}|${r.headSha}|${r.uncommitted.length}` : null;

  useEffect(() => {
    if (!r || targets.isLoading) return;
    for (const side of ["outgoing", "incoming"] as const) {
      const key = summaryKey(side, r);
      const hit = cachedSummary(p, buildInput(r, side));
      if (hit) {
        setSummaries((s) => ({ ...s, [key]: { text: hit, loading: false } }));
        continue;
      }
      const commits = side === "outgoing" ? r.outgoing.commits : r.incoming.commits;
      if (p.aiProvider === "off" || !p.autoSummarize || commits.length === 0) continue;
      void runSummary(r, side, false);
    }
  }, [reviewKey, targets.isLoading]);

  const trees = useMemo(
    () =>
      r
        ? {
            outgoing: buildTree(r.outgoing.files),
            incoming: buildTree(r.incoming.files),
            uncommitted: buildTree(r.uncommitted),
          }
        : null,
    [reviewKey],
  );

  // Everything starts collapsed whenever the review changes; ⌘E expands a whole tree.
  useEffect(() => {
    setExpanded(new Set());
  }, [reviewKey]);

  function toggle(kind: DiffKind, folderPath: string) {
    const id = `${kind}:${folderPath}`;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(kind: DiffKind, open: boolean) {
    if (!trees) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const fp of folderPaths(trees[kind])) {
        if (open) next.add(`${kind}:${fp}`);
        else next.delete(`${kind}:${fp}`);
      }
      return next;
    });
  }

  const outImpact = r ? computeImpact(r.outgoing.files.map((f) => f.path), targetList) : [];
  const inImpact = r ? computeImpact(r.incoming.files.map((f) => f.path), targetList) : [];
  const verdict = r ? computeVerdict(r, outImpact) : null;

  useEffect(() => {
    if (r && verdict) console.log(`[push-check] ${path.basename(wtPath)} ${r.branch}: out ${r.outgoing.commits.length}c/${r.outgoing.files.length}f, in ${r.incoming.commits.length}c, verdict "${verdict.short}"`);
  }, [reviewKey, verdict?.short]);

  const commonActions = (
    <ActionPanel.Section title="Repository">
      <Action title="Fetch and Refresh" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh} onAction={() => void doFetch(true)} />
      {r && p.aiProvider !== "off" && (
        <Action
          title="Regenerate Summaries"
          icon={Icon.Stars}
          shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
          onAction={() => {
            void runSummary(r, "outgoing", true);
            void runSummary(r, "incoming", true);
          }}
        />
      )}
      <Action
        title="Open Worktree in Editor"
        icon={Icon.Code}
        shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
        onAction={() => openFolder(p.editorCli, wtPath).catch((e) => showFailureToast(e, { title: "Could not open editor" }))}
      />
      <Action.ShowInFinder title="Show Worktree in Finder" path={wtPath} shortcut={{ modifiers: ["ctrl", "shift"], key: "f" }} />
    </ActionPanel.Section>
  );

  const treeActions = (kind: DiffKind) => (
    <ActionPanel.Section title="Tree">
      <Action title="Expand All" icon={Icon.ChevronDown} shortcut={{ modifiers: ["cmd"], key: "e" }} onAction={() => setAll(kind, true)} />
      <Action title="Collapse All" icon={Icon.ChevronRight} shortcut={{ modifiers: ["cmd", "shift"], key: "e" }} onAction={() => setAll(kind, false)} />
    </ActionPanel.Section>
  );

  const title = r ? `${path.basename(wtPath)} · ${r.branch} vs ${p.baseRef}` : path.basename(wtPath);

  const renderTree = (kind: DiffKind, sectionTitle: string) => {
    if (!r || !trees) return null;
    const nodes = trees[kind];
    if (nodes.length === 0) return null;
    const total = nodes.reduce((n, t) => n + t.files.length, 0);
    const rows = flatten(nodes, new Set([...expanded].filter((id) => id.startsWith(`${kind}:`)).map((id) => id.slice(kind.length + 1))), searchText.trim().length > 0);
    return (
      <List.Section key={kind} title={sectionTitle} subtitle={`${total} ${total === 1 ? "file" : "files"}`}>
        {rows.map(({ node, prefix }) =>
          node.kind === "folder" ? (
            <FolderItem
              key={`${kind}:dir:${node.path}`}
              id={`${kind}:dir:${node.path}`}
              kind={kind}
              node={node}
              prefix={prefix}
              open={expanded.has(`${kind}:${node.path}`)}
              targets={targetList}
              selected={selectedId === `${kind}:dir:${node.path}`}
              onToggle={() => toggle(kind, node.path)}
              extraActions={
                <>
                  {treeActions(kind)}
                  {commonActions}
                </>
              }
            />
          ) : (
            <FileItem
              key={`${kind}:${node.path}`}
              id={`${kind}:${node.path}`}
              p={p}
              r={r}
              kind={kind}
              file={node.file!}
              name={node.name}
              prefix={prefix}
              targets={targetList}
              selected={selectedId === `${kind}:${node.path}`}
              extraActions={
                <>
                  {treeActions(kind)}
                  {commonActions}
                </>
              }
            />
          ),
        )}
      </List.Section>
    );
  };

  return (
    <List
      isLoading={worktrees.isLoading || review.isLoading || targets.isLoading || fetching}
      isShowingDetail
      navigationTitle={title}
      searchBarPlaceholder="Filter files, commits, folders"
      onSelectionChange={setSelectedId}
      onSearchTextChange={setSearchText}
      searchBarAccessory={
        <List.Dropdown tooltip="Worktree" value={wtPath} onChange={setStoredWt}>
          {(worktrees.data ?? []).map((w) => (
            <List.Dropdown.Item
              key={w.path}
              value={w.path}
              title={`${w.name} · ${w.branch ?? "detached"}   ↑${w.ahead} ↓${w.behind}${w.dirty ? `  ✎${w.dirty}` : ""}`}
              icon={w.isMain ? Icon.House : Icon.Folder}
            />
          ))}
        </List.Dropdown>
      }
    >
      {review.error && !r && (
        <List.EmptyView icon={Icon.Warning} title="Could not read the repository" description={review.error.message} actions={<ActionPanel>{commonActions}</ActionPanel>} />
      )}
      {r && verdict && (
        <List.Section title="Overview">
          <List.Item
            id="overview:outgoing"
            title="Outgoing"
            subtitle={`${r.outgoing.commits.length} commits`}
            icon={{ source: Icon.ArrowUp, tintColor: verdict.color }}
            accessories={[{ icon: { source: verdict.icon, tintColor: verdict.color }, tooltip: verdict.long }]}
            keywords={["outgoing", "push", ...r.outgoing.commits.map((c) => c.subject)]}
            detail={<List.Item.Detail markdown={sideMarkdown(p, r, "outgoing", r.outgoing, summaries[summaryKey("outgoing", r)], verdict.long, outImpact)} />}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {summaries[summaryKey("outgoing", r)]?.text && (
                    <Action.CopyToClipboard title="Copy Outgoing Summary" content={summaries[summaryKey("outgoing", r)].text ?? ""} />
                  )}
                  <Action.CopyToClipboard
                    title="Copy Outgoing Commit List"
                    content={r.outgoing.commits.map((c) => `${c.short} ${c.subject}`).join("\n")}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                </ActionPanel.Section>
                {commonActions}
              </ActionPanel>
            }
          />
          <List.Item
            id="overview:incoming"
            title="Incoming"
            subtitle={`${r.incoming.commits.length} commits`}
            icon={{ source: Icon.ArrowDown, tintColor: r.incoming.commits.length ? Color.Blue : Color.SecondaryText }}
            accessories={[
              r.incoming.commits.length
                ? { icon: { source: Icon.ArrowDownCircle, tintColor: Color.Blue }, tooltip: `${r.incoming.commits.length} commits to pull` }
                : { icon: { source: Icon.CheckCircle, tintColor: Color.SecondaryText }, tooltip: `Up to date with ${p.baseRef}` },
            ]}
            keywords={["incoming", "pull", ...r.incoming.commits.map((c) => c.subject)]}
            detail={<List.Item.Detail markdown={sideMarkdown(p, r, "incoming", r.incoming, summaries[summaryKey("incoming", r)], null, inImpact)} />}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  {summaries[summaryKey("incoming", r)]?.text && (
                    <Action.CopyToClipboard title="Copy Incoming Summary" content={summaries[summaryKey("incoming", r)].text ?? ""} />
                  )}
                  <Action.CopyToClipboard
                    title="Copy Incoming Commit List"
                    content={r.incoming.commits.map((c) => `${c.short} ${c.subject}`).join("\n")}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                </ActionPanel.Section>
                {commonActions}
              </ActionPanel>
            }
          />
        </List.Section>
      )}
      {renderTree("uncommitted", "Uncommitted")}
      {renderTree("outgoing", "Outgoing files")}
      {renderTree("incoming", "Incoming files")}
    </List>
  );
}

type Verdict = { short: string; long: string; color: Color; icon: Icon };

function computeVerdict(r: Review, outImpact: Impact[]): Verdict {
  const auto = outImpact.filter((i) => i.target.auto);
  const manual = outImpact.filter((i) => !i.target.auto);
  const behind = r.incoming.commits.length;
  if (r.outgoing.commits.length === 0) {
    return { short: "nothing to push", long: "Nothing to push. The branch has no commits that the base ref lacks.", color: Color.SecondaryText, icon: Icon.CheckCircle };
  }
  const parts: string[] = [];
  let color = Color.Green;
  let short = "safe";
  if (auto.length) {
    color = Color.Red;
    short = `deploys ${auto.length}`;
    parts.push(`Pushing deploys ${auto.length === 1 ? "1 target" : `${auto.length} targets`}: ${auto.map((i) => `${i.target.name} (${i.files.length} files)`).join(", ")}.`);
  } else {
    parts.push("No auto-deploying paths touched.");
  }
  if (manual.length) {
    if (color === Color.Green) color = Color.Yellow;
    parts.push(`Manual-deploy apps affected, nothing ships until someone deploys them: ${manual.map((i) => i.target.name).join(", ")}.`);
  }
  if (behind) {
    if (color === Color.Green) color = Color.Yellow;
    short = auto.length ? `${short} · pull first` : "pull first";
    parts.push(`Behind by ${behind} ${behind === 1 ? "commit" : "commits"}: pull (or rebase) before pushing.`);
  }
  const icon = auto.length ? Icon.Bolt : behind ? Icon.ArrowDownCircle : Icon.CheckCircle;
  return { short, long: parts.join(" "), color, icon };
}

function fence(diff: string, max = 40_000): string {
  const safe = diff.replace(/```/g, "` ` `");
  const body = safe.length > max ? `${safe.slice(0, max)}\n\n[truncated: ${safe.length.toLocaleString()} characters total]` : safe;
  return "```diff\n" + body + "\n```";
}

function sideMarkdown(p: Prefs, r: Review, side: SideName, s: Side, summary: SummaryState | undefined, verdictLong: string | null, impact: Impact[]): string {
  const added = s.files.reduce((n, f) => n + f.added, 0);
  const deleted = s.files.reduce((n, f) => n + f.deleted, 0);
  const heading = side === "outgoing" ? `Outgoing → ${r.baseRef}` : `Incoming ← ${r.baseRef}`;
  const stats = [`${s.commits.length} commits`, `${s.files.length} files`, `+${added} −${deleted}`];
  if (side === "outgoing" && r.uncommitted.length) stats.push(`${r.uncommitted.length} uncommitted`);
  const lines: string[] = [`## ${heading}`, `**${stats.join(" · ")}**`, ""];
  if (verdictLong) lines.push(`> ${verdictLong}`, "");
  if (side === "incoming" && s.commits.length === 0) lines.push(`> Up to date with ${r.baseRef}.`, "");
  if (side === "incoming" && impact.length) lines.push(`> Touches deploy targets: ${impact.map((i) => i.target.name).join(", ")}.`, "");

  if (s.commits.length > 0) {
    lines.push("### Summary");
    if (p.aiProvider === "off") lines.push("_AI summaries are off (extension preferences)._");
    else if (summary?.text) lines.push(polishSummary(summary.text));
    else if (summary?.error) lines.push(`_Summary failed: ${summary.error}_`);
    else if (summary?.loading) lines.push(`_Summarizing with ${p.model}…_`);
    else lines.push("_Not summarized yet. Press ⌘⇧S to summarize._");
    lines.push("");
  }

  if (s.files.length > 0) {
    lines.push("### Files by folder");
    for (const g of groupByFolder(s.files)) lines.push(`- \`${g.key}\` · ${g.files.length} ${g.files.length === 1 ? "file" : "files"} · +${g.added} −${g.deleted}`);
    lines.push("");
  }

  if (s.commits.length > 0) {
    lines.push("### Commits");
    for (const c of s.commits.slice(0, 40)) lines.push(`- \`${c.short}\` ${c.subject}  ·  ${c.author}, ${c.when}`);
    if (s.commits.length > 40) lines.push(`- … and ${s.commits.length - 40} more`);
  }
  return lines.join("\n");
}

const STATUS_LABEL: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", U: "conflict", "??": "untracked", AM: "added", MM: "modified" };

function deployAccessories(files: string[], targets: DeployTarget[]): List.Item.Accessory[] {
  const hits = computeImpact(files, targets);
  const acc: List.Item.Accessory[] = [];
  for (const h of hits.slice(0, 2)) {
    acc.push({ tag: { value: h.target.name, color: h.target.auto ? Color.Red : Color.Orange }, tooltip: h.target.auto ? `Deploys ${h.target.name} on push` : `${h.target.name} is a manual deploy` });
  }
  if (hits.length > 2) acc.push({ text: `+${hits.length - 2}`, tooltip: hits.slice(2).map((h) => h.target.name).join(", ") });
  return acc;
}

function FolderItem(props: {
  id: string;
  kind: DiffKind;
  node: TreeNode;
  prefix: string;
  open: boolean;
  targets: DeployTarget[];
  selected: boolean;
  onToggle: () => void;
  extraActions: React.ReactNode;
}) {
  const { id, kind, node, prefix, open, targets, selected, onToggle, extraActions } = props;
  const accessories: List.Item.Accessory[] = [
    { text: { value: `${node.files.length} ${node.files.length === 1 ? "file" : "files"}`, color: Color.SecondaryText }, tooltip: kind === "uncommitted" ? undefined : `+${node.added} −${node.deleted}` },
    ...deployAccessories(node.files.map((f) => f.path), targets),
  ];
  const detail = selected ? (
    <List.Item.Detail
      markdown={[
        `### ${node.path}/`,
        `**${node.files.length} files · +${node.added} −${node.deleted}**`,
        "",
        ...computeImpact(
          node.files.map((f) => f.path),
          targets,
        ).map((i) => `> ${i.target.auto ? "Deploys" : "Manual deploy:"} **${i.target.name}** (${i.files.length} files)`),
        "",
        ...node.files.map((f) => `- \`${f.path.slice(node.path.length + 1)}\`${f.status ? ` · ${STATUS_LABEL[f.status] ?? f.status}` : ` · +${f.added} −${f.deleted}`}`),
      ].join("\n")}
    />
  ) : undefined;
  return (
    <List.Item
      id={id}
      title={`${prefix}${node.name}`}
      icon={{ source: open ? Icon.ChevronDown : Icon.ChevronRight, tintColor: Color.SecondaryText }}
      keywords={node.path.split("/")}
      accessories={accessories}
      detail={detail}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title={open ? "Collapse Folder" : "Expand Folder"} icon={open ? Icon.ChevronRight : Icon.ChevronDown} onAction={onToggle} />
            <Action.CopyToClipboard title="Copy Folder Path" content={node.path} shortcut={Keyboard.Shortcut.Common.Copy} />
          </ActionPanel.Section>
          {extraActions}
        </ActionPanel>
      }
    />
  );
}

function FileItem(props: {
  id: string;
  p: Prefs;
  r: Review;
  kind: DiffKind;
  file: ChangedFile;
  name: string;
  prefix: string;
  targets: DeployTarget[];
  selected: boolean;
  extraActions: React.ReactNode;
}) {
  const { id, p, r, kind, file, name, prefix, targets, selected, extraActions } = props;
  const abs = path.join(r.worktree, file.path);
  const hits = targetsForFile(file.path, targets);
  const accessories: List.Item.Accessory[] = [];
  if (kind === "uncommitted") {
    const st = file.status ?? "";
    accessories.push({ tag: { value: STATUS_LABEL[st] ?? st, color: st === "??" ? Color.SecondaryText : st.startsWith("D") ? Color.Red : Color.Yellow } });
  } else if (file.binary) {
    accessories.push({ text: "binary" });
  } else {
    accessories.push({ text: { value: `+${file.added} −${file.deleted}`, color: Color.SecondaryText } });
  }
  accessories.push(...deployAccessories([file.path], targets));

  async function diffInEditor() {
    try {
      const short = r.baseSha.slice(0, 7);
      const working = (await fileExists(abs)) ? abs : await materialize(r.worktree, null, file.path, "missing");
      if (kind === "outgoing") await openDiff(p.editorCli, await materialize(r.worktree, r.baseRef, file.path, short), working);
      else if (kind === "incoming") await openDiff(p.editorCli, working, await materialize(r.worktree, r.baseRef, file.path, short));
      else await openDiff(p.editorCli, await materialize(r.worktree, file.status === "??" ? null : "HEAD", file.path, r.headSha.slice(0, 7)), working);
    } catch (err) {
      await showFailureToast(err, { title: "Could not open diff" });
    }
  }

  return (
    <List.Item
      id={id}
      title={`${prefix}${name}`}
      icon={fileIcon(file)}
      keywords={[...file.path.split("/"), ...hits.map((t) => t.name)]}
      accessories={accessories}
      detail={selected ? <FileDetail r={r} kind={kind} file={file} hits={hits} /> : undefined}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Open Diff in Editor" icon={Icon.CodeBlock} onAction={diffInEditor} />
            <Action
              title="Open File in Editor"
              icon={Icon.Code}
              shortcut={Keyboard.Shortcut.Common.Open}
              onAction={() => openFile(p.editorCli, abs).catch((e) => showFailureToast(e, { title: "Could not open editor" }))}
            />
            <Action.ShowInFinder path={abs} shortcut={{ modifiers: ["cmd", "shift"], key: "f" }} />
            <Action.CopyToClipboard title="Copy Relative Path" content={file.path} shortcut={Keyboard.Shortcut.Common.Copy} />
            <Action.CopyToClipboard title="Copy Absolute Path" content={abs} shortcut={Keyboard.Shortcut.Common.CopyPath} />
          </ActionPanel.Section>
          {extraActions}
        </ActionPanel>
      }
    />
  );
}

function fileIcon(file: ChangedFile) {
  if (file.status === "??") return { source: Icon.Document, tintColor: Color.SecondaryText };
  if (file.status?.startsWith("D")) return { source: Icon.Trash, tintColor: Color.Red };
  if (file.status?.startsWith("A")) return { source: Icon.PlusCircle, tintColor: Color.Green };
  if (file.binary) return Icon.Image;
  if (file.added > 0 && file.deleted === 0) return { source: Icon.PlusCircle, tintColor: Color.Green };
  if (file.deleted > 0 && file.added === 0) return { source: Icon.MinusCircle, tintColor: Color.Red };
  return { source: Icon.Pencil, tintColor: Color.Yellow };
}

function FileDetail({ r, kind, file, hits }: { r: Review; kind: DiffKind; file: ChangedFile; hits: DeployTarget[] }) {
  const { data, isLoading, error } = usePromise(fileDiff, [r.worktree, kind, r.baseRef, file]);
  const header = [`**${file.path}**`];
  if (hits.length) header.push(hits.map((t) => `${t.auto ? "🔴" : "🟠"} ${t.name}`).join(" · "));
  let body: string;
  if (error) body = `_Could not load diff: ${error.message}_`;
  else if (file.binary) body = "_Binary file._";
  else if (data === undefined) body = "";
  else if (!data.trim()) body = "_No textual changes._";
  else body = fence(data);
  return <List.Item.Detail isLoading={isLoading} markdown={`${header.join("\n\n")}\n\n${body}`} />;
}
