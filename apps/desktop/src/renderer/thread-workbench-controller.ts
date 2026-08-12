import { useEffect, useMemo, useState } from "react";
import { detectCodeLanguage } from "./code-language";
import { useDesktopAcpEditorBridge } from "./desktop-acp-client";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  desktopRequest,
  useApiResource,
} from "./lib";
import type {
  RepositoryBranchesResponse,
  RepositoryConflictsResponse,
  RepositoryRemotesResponse,
  RepositoryStashesResponse,
  RepositoryWorktreesResponse,
  WorkspaceReadResponse,
} from "./repository-resource-models";
import {
  browserThreadWorkbenchStorage,
  buildBriefPlanSummary,
  loadThreadWorkbenchState,
  saveThreadWorkbenchState,
  type ThreadWorkbenchState,
  type ThreadWorkbenchTab,
} from "./thread-workbench";
import type { WorkspaceTreeEntry } from "./workspace-file-tree";

interface RepositorySummaryResponse {
  summary?: {
    isRepository?: boolean;
    root?: string;
    branch?: string;
    head?: string;
    dirty?: boolean;
    changedFiles?: number;
  };
}
interface WorkspaceTreeResponse {
  entries?: unknown[];
  truncated?: boolean;
}
interface RepositoryChangesResponse {
  changes?: unknown[];
}
interface WorkspaceCheckpointResponse {
  support?: { supported?: boolean; reason?: string };
  checkpoints?: unknown[];
}
interface RepositoryPatchResponse {
  patch?: { path?: string; patch?: string; truncated?: boolean };
}
interface TerminalHistoryResponse {
  commands?: unknown[];
}
interface PlansResponse {
  plans?: unknown[];
}
interface SettingsResponse {
  settings?: Record<string, unknown>;
}
interface DelegationTasksResponse {
  tasks?: unknown[];
}
interface CodegenRunsResponse {
  summary?: {
    running?: number;
    failed?: number;
    total?: number;
    workflows?: number;
    runningWorkflows?: number;
  };
  runs?: unknown[];
}
interface BrowserStatusResponse {
  browser?: unknown;
}
interface ExecutionApprovalsResponse {
  approvals?: unknown[];
}

export interface WorkbenchChange {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export function flattenSettingEntries(
  source: unknown,
  prefix = "",
  output: Array<{ key: string; value: string }> = [],
): Array<{ key: string; value: string }> {
  if (
    source === null ||
    source === undefined ||
    typeof source !== "object" ||
    Array.isArray(source)
  ) {
    return [{ key: prefix || "runtime", value: String(source ?? "") }];
  }
  for (const [key, value] of Object.entries(
    source as Record<string, unknown>,
  )) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined)
      output.push({ key: nextKey, value: String(value) });
    else if (Array.isArray(value))
      output.push({ key: nextKey, value: `[${value.length} items]` });
    else if (typeof value === "object")
      flattenSettingEntries(value, nextKey, output);
    else output.push({ key: nextKey, value: String(value) });
  }
  return output;
}

export const CONTEXT_LIMIT = 16_000;

export function bounded(value: string, limit = CONTEXT_LIMIT): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n\n[Context truncated by Doolittle]`;
}

export function contextBlock(
  kind: string,
  title: string,
  content: string,
): string {
  return [
    `<doolittle-context kind="${kind}" source="${title}">`,
    bounded(content.trim() || "(no captured content)"),
    "</doolittle-context>",
  ].join("\n");
}

export function commandOutput(record: Record<string, unknown>): string {
  return (
    asString(record.streamOutput) ||
    [asString(record.stdout), asString(record.stderr)]
      .filter(Boolean)
      .join("\n") ||
    asString(record.output)
  );
}

export function normalizeFileEntries(entries: unknown): WorkspaceTreeEntry[] {
  return asArray(entries)
    .map((value): WorkspaceTreeEntry | null => {
      const entry = asRecord(value);
      const path = asString(entry.path);
      const type = asString(entry.type);
      if (!path || (type !== "file" && type !== "directory")) return null;
      return {
        path,
        type,
        depth: Math.max(0, Math.min(12, asNumber(entry.depth))),
      };
    })
    .filter((entry): entry is WorkspaceTreeEntry => entry !== null);
}

export function normalizeChangeEntries(changes: unknown): WorkbenchChange[] {
  return asArray(changes)
    .map((value): WorkbenchChange | null => {
      const entry = asRecord(value);
      const path = asString(entry.path);
      if (!path) return null;
      const indexStatus = asString(entry.indexStatus, " ");
      const worktreeStatus = asString(entry.worktreeStatus, " ");
      return {
        path,
        status: `${indexStatus}${worktreeStatus}`.trim() || "modified",
        staged: Boolean(entry.staged),
        unstaged: Boolean(entry.unstaged),
        untracked: Boolean(entry.untracked),
      };
    })
    .filter((entry): entry is WorkbenchChange => entry !== null);
}

export function workbenchResourcePaths(
  active: boolean,
  tab: ThreadWorkbenchTab,
  currentFile: string,
  currentChange: string,
) {
  return {
    summary: active ? "/repo/summary" : null,
    tree: active && tab === "files" ? "/workspace/tree?depth=12" : null,
    changes: active && tab === "changes" ? "/repo/changes" : null,
    branches: active && tab === "changes" ? "/repo/branches" : null,
    remotes: active && tab === "changes" ? "/repo/remotes" : null,
    stashes: active && tab === "changes" ? "/repo/stashes" : null,
    conflicts: active && tab === "changes" ? "/repo/conflicts" : null,
    worktrees: active && tab === "changes" ? "/repo/worktrees" : null,
    checkpoints: active && tab === "changes" ? "/workspace/checkpoints" : null,
    terminal:
      active && (tab === "terminal" || tab === "brief")
        ? "/terminal/history"
        : null,
    plans: active && (tab === "plans" || tab === "brief") ? "/plans" : null,
    settings: active && tab === "settings" ? "/settings" : null,
    delegationTasks:
      active && tab === "brief" ? "/delegation/tasks?limit=8" : null,
    codegen: active && tab === "brief" ? "/codegen/runs" : null,
    approvals:
      active && tab === "brief" ? "/execution/approvals?status=pending" : null,
    preview: active && tab === "preview" ? "/browser/status" : null,
    file:
      active && tab === "files" && currentFile
        ? `/workspace/read?path=${encodeURIComponent(currentFile)}`
        : null,
    patch:
      active && tab === "changes" && currentChange
        ? `/repo/patch?path=${encodeURIComponent(currentChange)}&staged=false`
        : null,
  };
}

export function useThreadWorkbenchRailController({
  active,
  sessionId,
  workspacePath,
  onInsertContext,
}: {
  active: boolean;
  sessionId: string;
  workspacePath: string;
  onInsertContext: (text: string) => void;
}) {
  const storage = useMemo(() => browserThreadWorkbenchStorage(), []);
  const [model, setModel] = useState<ThreadWorkbenchState>(() =>
    loadThreadWorkbenchState({ sessionId, workspacePath }, storage),
  );
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedChange, setSelectedChange] = useState("");
  const [selectedCommand, setSelectedCommand] = useState("");
  const [copiedLabel, setCopiedLabel] = useState("");
  const [checkpointMessage, setCheckpointMessage] = useState("");
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const acpEditor = useDesktopAcpEditorBridge({
    active: active && model.selectedTab === "files" && !!workspacePath,
    workspacePath,
  });
  const basePaths = workbenchResourcePaths(
    active,
    model.selectedTab,
    selectedFile,
    selectedChange,
  );
  const summary = useApiResource<RepositorySummaryResponse>(basePaths.summary, [
    active,
    workspacePath,
  ]);
  const tree = useApiResource<WorkspaceTreeResponse>(basePaths.tree, [
    active,
    model.selectedTab,
    workspacePath,
  ]);
  const changes = useApiResource<RepositoryChangesResponse>(basePaths.changes, [
    active,
    model.selectedTab,
    workspacePath,
  ]);
  const branches = useApiResource<RepositoryBranchesResponse>(
    basePaths.branches,
    [active, model.selectedTab, workspacePath],
  );
  const remotes = useApiResource<RepositoryRemotesResponse>(basePaths.remotes, [
    active,
    model.selectedTab,
    workspacePath,
  ]);
  const stashes = useApiResource<RepositoryStashesResponse>(basePaths.stashes, [
    active,
    model.selectedTab,
    workspacePath,
  ]);
  const conflicts = useApiResource<RepositoryConflictsResponse>(
    basePaths.conflicts,
    [active, model.selectedTab, workspacePath],
  );
  const worktrees = useApiResource<RepositoryWorktreesResponse>(
    basePaths.worktrees,
    [active, model.selectedTab, workspacePath],
  );
  const checkpoints = useApiResource<WorkspaceCheckpointResponse>(
    basePaths.checkpoints,
    [active, model.selectedTab, workspacePath],
  );
  const terminal = useApiResource<TerminalHistoryResponse>(basePaths.terminal, [
    active,
    model.selectedTab,
    workspacePath,
  ]);
  const plans = useApiResource<PlansResponse>(basePaths.plans, [
    active,
    model.selectedTab,
  ]);
  const settings = useApiResource<SettingsResponse>(basePaths.settings, [
    active,
    model.selectedTab,
  ]);
  const delegationTasks = useApiResource<DelegationTasksResponse>(
    basePaths.delegationTasks,
    [active, model.selectedTab],
  );
  const codegen = useApiResource<CodegenRunsResponse>(basePaths.codegen, [
    active,
    model.selectedTab,
  ]);
  const approvals = useApiResource<ExecutionApprovalsResponse>(
    basePaths.approvals,
    [active, model.selectedTab],
  );
  const preview = useApiResource<BrowserStatusResponse>(basePaths.preview, [
    active,
    model.selectedTab,
  ]);
  const fileEntries = useMemo(
    () => normalizeFileEntries(tree.data?.entries),
    [tree.data],
  );
  const changeEntries = useMemo(
    () => normalizeChangeEntries(changes.data?.changes),
    [changes.data],
  );
  const commandEntries = useMemo(
    () => asArray(terminal.data?.commands).map(asRecord),
    [terminal.data],
  );
  const planEntries = useMemo(
    () => asArray(plans.data?.plans).map(asRecord),
    [plans.data],
  );
  const settingEntries = useMemo(
    () => flattenSettingEntries(settings.data?.settings).slice(0, 24),
    [settings.data],
  );
  const delegatedTaskEntries = useMemo(
    () => asArray(delegationTasks.data?.tasks).map(asRecord),
    [delegationTasks.data],
  );
  const briefPlanSummary = buildBriefPlanSummary(planEntries);
  const runEntries = useMemo(
    () => asArray(codegen.data?.runs).map(asRecord),
    [codegen.data],
  );
  const approvalEntries = useMemo(
    () => asArray(approvals.data?.approvals).map(asRecord),
    [approvals.data],
  );
  const activeRunCount = asNumber(codegen.data?.summary?.running) || 0;
  const failedRunCount = asNumber(codegen.data?.summary?.failed) || 0;
  const currentFile = selectedFile;
  const currentFileLanguage = useMemo(
    () => detectCodeLanguage(currentFile),
    [currentFile],
  );
  const currentChange = selectedChange || changeEntries[0]?.path;
  const currentCommand =
    commandEntries.find(
      (entry, index) =>
        asString(entry.id, `terminal-${index}`) === selectedCommand,
    ) ?? commandEntries[0];
  const paths = workbenchResourcePaths(
    active,
    model.selectedTab,
    currentFile,
    currentChange ?? "",
  );
  const file = useApiResource<WorkspaceReadResponse>(paths.file, [
    active,
    model.selectedTab,
    currentFile,
  ]);
  const patch = useApiResource<RepositoryPatchResponse>(paths.patch, [
    active,
    model.selectedTab,
    currentChange,
  ]);
  useEffect(() => {
    setModel(
      loadThreadWorkbenchState(
        { sessionId, workspacePath, lifecycle: active ? "active" : "idle" },
        storage,
      ),
    );
    setSelectedFile("");
    setSelectedChange("");
    setSelectedCommand("");
  }, [storage, active, sessionId, workspacePath]);
  useEffect(() => {
    if (model.sessionId === (sessionId.trim() || "local"))
      saveThreadWorkbenchState(model, storage);
  }, [model, sessionId, storage]);
  const repositorySummary = summary.data?.summary;
  useEffect(() => {
    if (!repositorySummary) return;
    const root = asString(repositorySummary.root) || workspacePath;
    setModel((current) => {
      const branch = asString(repositorySummary.branch);
      const head = asString(repositorySummary.head);
      const worktreePath =
        root && workspacePath && root !== workspacePath ? root : undefined;
      if (
        current.branch === branch &&
        current.head === head &&
        current.worktreePath === worktreePath &&
        current.lifecycle === (active ? "active" : "idle")
      )
        return current;
      return {
        ...current,
        branch,
        head,
        ...(worktreePath ? { worktreePath } : { worktreePath: undefined }),
        lifecycle: active ? "active" : "idle",
      };
    });
  }, [active, repositorySummary, workspacePath]);
  useEffect(() => {
    if (!copiedLabel) return;
    const timeout = window.setTimeout(() => setCopiedLabel(""), 1_800);
    return () => window.clearTimeout(timeout);
  }, [copiedLabel]);
  const selectTab = (tab: ThreadWorkbenchTab) =>
    setModel((current) => ({ ...current, selectedTab: tab }));
  const insert = (label: string, value: string) => {
    onInsertContext(value);
    setCopiedLabel(label);
  };
  const refreshGit = () => {
    summary.reload();
    changes.reload();
    branches.reload();
    remotes.reload();
    stashes.reload();
    conflicts.reload();
    worktrees.reload();
    if (currentChange) patch.reload();
  };
  const refreshCurrent = () => {
    summary.reload();
    if (model.selectedTab === "files") {
      tree.reload();
      file.reload();
    }
    if (model.selectedTab === "changes") {
      changes.reload();
      patch.reload();
    }
    if (model.selectedTab === "terminal") terminal.reload();
    if (model.selectedTab === "plans") plans.reload();
    if (model.selectedTab === "brief") {
      plans.reload();
      terminal.reload();
      delegationTasks.reload();
      codegen.reload();
      approvals.reload();
    }
    if (model.selectedTab === "settings") settings.reload();
    if (model.selectedTab === "preview") preview.reload();
  };
  const createCheckpoint = async () => {
    setCheckpointBusy(true);
    setCheckpointMessage("");
    try {
      const response = await desktopRequest<{ checkpoint?: { id?: string } }>(
        "/workspace/checkpoints",
        "POST",
        { label: "Operator checkpoint" },
      );
      setCheckpointMessage(
        `Created checkpoint ${asString(response.checkpoint?.id, "")}.`,
      );
      checkpoints.reload();
    } catch (error) {
      setCheckpointMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCheckpointBusy(false);
    }
  };
  const restoreCheckpoint = async (id: string) => {
    if (
      !window.confirm(
        `Restore checkpoint ${id}? This overwrites tracked workspace files. The runtime will not restart.`,
      )
    )
      return;
    setCheckpointBusy(true);
    setCheckpointMessage("");
    try {
      await desktopRequest(
        `/workspace/checkpoints/${encodeURIComponent(id)}/restore`,
        "POST",
        { confirmCheckpointId: id },
      );
      setCheckpointMessage(`Restored ${id}. Runtime remains running.`);
      changes.reload();
      checkpoints.reload();
    } catch (error) {
      setCheckpointMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCheckpointBusy(false);
    }
  };
  return {
    acpEditor,
    model,
    setModel,
    selectedFile,
    setSelectedFile,
    selectedChange,
    setSelectedChange,
    selectedCommand,
    setSelectedCommand,
    copiedLabel,
    checkpointMessage,
    checkpointBusy,
    summary,
    tree,
    changes,
    branches,
    remotes,
    stashes,
    conflicts,
    worktrees,
    checkpoints,
    terminal,
    plans,
    settings,
    delegationTasks,
    codegen,
    approvals,
    preview,
    fileEntries,
    changeEntries,
    commandEntries,
    planEntries,
    settingEntries,
    delegatedTaskEntries,
    briefPlanSummary,
    runEntries,
    approvalEntries,
    activeRunCount,
    failedRunCount,
    currentFile,
    currentFileLanguage,
    currentChange,
    currentCommand,
    file,
    patch,
    repositorySummary,
    selectTab,
    insert,
    refreshGit,
    refreshCurrent,
    createCheckpoint,
    restoreCheckpoint,
  };
}
