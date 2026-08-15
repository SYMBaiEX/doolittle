import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { type FormEvent, useMemo, useState } from "react";
import type { WorkspacePickResult } from "../../shared/contracts";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  errorMessage,
} from "../lib";
import { compactWorkspacePath } from "../workspace-path";
import {
  EXECUTION_CARD_CLASS,
  EXECUTION_DESCRIPTION_CLASS,
  EXECUTION_EYEBROW_CLASS,
  EXECUTION_FIELD_CLASS,
  EXECUTION_HEADER_CLASS,
  EXECUTION_NOTICE_CLASS,
  EXECUTION_PANEL_CLASS,
} from "./execution-environment-layout";
import { SandboxControlPanel } from "./SandboxControlPanel";

type ActionNotice = {
  tone: "neutral" | "good" | "bad";
  message: string;
};

export interface ExecutionEnvironmentWorktree {
  path: string;
  branch: string;
  head: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}

export function normalizeExecutionWorktrees(
  value: unknown,
): ExecutionEnvironmentWorktree[] {
  return asArray(value)
    .map((item): ExecutionEnvironmentWorktree | null => {
      const record = asRecord(item);
      const path = asString(record.path).trim();
      if (!path) return null;
      return {
        path,
        branch: asString(record.branch).trim(),
        head: asString(record.head).trim(),
        detached: record.detached === true,
        bare: record.bare === true,
        prunable: record.prunable === true,
      };
    })
    .filter(
      (worktree): worktree is ExecutionEnvironmentWorktree => worktree !== null,
    );
}

export function worktreeLabel(worktree: ExecutionEnvironmentWorktree): string {
  if (worktree.branch) return worktree.branch;
  if (worktree.detached) return "Detached HEAD";
  return "Worktree";
}

function isCurrentWorkspace(path: string, workspacePath: string): boolean {
  if (!workspacePath) return false;
  return path === workspacePath;
}

export function ExecutionEnvironmentPanel({
  active,
  isRepository,
  workspaceRoot,
  worktrees,
  loading,
  error,
  onChooseWorkspace,
  onOpenWorkspacePath,
  onRefresh,
}: {
  active: boolean;
  isRepository: boolean;
  workspaceRoot: string;
  worktrees: unknown;
  loading: boolean;
  error: string | null;
  onChooseWorkspace: () => Promise<WorkspacePickResult>;
  onOpenWorkspacePath: (path: string) => Promise<WorkspacePickResult>;
  onRefresh: () => void;
}) {
  const [branch, setBranch] = useState("");
  const [path, setPath] = useState("");
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const normalizedWorktrees = useMemo(
    () => normalizeExecutionWorktrees(worktrees),
    [worktrees],
  );

  const chooseWorkspace = async () => {
    if (!active || opening) return;
    setOpening(true);
    setNotice({
      tone: "neutral",
      message: "Choose the worktree directory in the native workspace picker.",
    });
    try {
      const result = await onChooseWorkspace();
      if (result.canceled) {
        setNotice({
          tone: "neutral",
          message: "Workspace selection cancelled.",
        });
      } else {
        setNotice({
          tone: "good",
          message: `Opened ${compactWorkspacePath(result.state.currentPath)} locally.`,
        });
        onRefresh();
      }
    } catch (cause) {
      setNotice({ tone: "bad", message: errorMessage(cause) });
    } finally {
      setOpening(false);
    }
  };

  const openWorktree = async (worktreePath: string) => {
    if (!active || opening) return;
    setOpening(true);
    setNotice({
      tone: "neutral",
      message: "Confirm the exact worktree in the native dialog.",
    });
    try {
      const result = await onOpenWorkspacePath(worktreePath);
      setNotice(
        result.canceled
          ? { tone: "neutral", message: "Workspace selection cancelled." }
          : {
              tone: "good",
              message: `Opened ${compactWorkspacePath(result.state.currentPath)} locally.`,
            },
      );
      if (!result.canceled) onRefresh();
    } catch (cause) {
      setNotice({ tone: "bad", message: errorMessage(cause) });
    } finally {
      setOpening(false);
    }
  };

  const createWorktree = async (event: FormEvent) => {
    event.preventDefault();
    const nextBranch = branch.trim();
    const nextPath = path.trim();
    if (!active || !nextBranch || !nextPath || creating) return;
    setCreating(true);
    setNotice({
      tone: "neutral",
      message:
        "Review the branch and contained path in the native confirmation dialog.",
    });
    try {
      const result = await window.doolittle.createWorktree({
        branch: nextBranch,
        path: nextPath,
      });
      if (result.status === "cancelled") {
        setNotice({
          tone: "neutral",
          message: "Worktree creation cancelled. Nothing was changed.",
        });
        return;
      }
      setBranch("");
      setPath("");
      setNotice({
        tone: "good",
        message: `Created ${result.worktree.branch ?? nextBranch} at ${compactWorkspacePath(result.worktree.path)}. Choose that directory to open it.`,
      });
      onRefresh();
    } catch (cause) {
      setNotice({ tone: "bad", message: errorMessage(cause) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label="Local execution environments"
      className={EXECUTION_PANEL_CLASS}
    >
      <header className={EXECUTION_HEADER_CLASS}>
        <div>
          <span className={EXECUTION_EYEBROW_CLASS}>Execution environment</span>
          <strong
            className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-[var(--font-mono)] text-[11px]"
            title={workspaceRoot || undefined}
          >
            {compactWorkspacePath(workspaceRoot || "Local workspace")}
          </strong>
        </div>
        <Badge tone="good">Local</Badge>
      </header>
      <p className={EXECUTION_DESCRIPTION_CLASS}>
        Commands and agents run in the selected local workspace. No remote shell
        or cloud environment is configured here.
      </p>
      <Button
        className="w-full"
        disabled={!active || opening}
        onClick={() => void chooseWorkspace()}
        size="sm"
        type="button"
        variant="outline"
      >
        {opening ? "Opening…" : "Open workspace…"}
      </Button>

      <form className={EXECUTION_CARD_CLASS} onSubmit={createWorktree}>
        <span className={EXECUTION_EYEBROW_CLASS}>Isolated Git worktree</span>
        <label className={EXECUTION_FIELD_CLASS} htmlFor="worktree-branch">
          <span>New branch</span>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            disabled={!active || creating || !isRepository}
            id="worktree-branch"
            onChange={(event) => setBranch(event.target.value)}
            placeholder="feature/short-name"
            spellCheck={false}
            value={branch}
          />
        </label>
        <label className={EXECUTION_FIELD_CLASS} htmlFor="worktree-path">
          <span>Workspace-relative path</span>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            disabled={!active || creating || !isRepository}
            id="worktree-path"
            onChange={(event) => setPath(event.target.value)}
            placeholder=".doolittle/worktrees/short-name"
            spellCheck={false}
            value={path}
          />
        </label>
        <Button
          disabled={
            !active ||
            !isRepository ||
            !branch.trim() ||
            !path.trim() ||
            creating
          }
          size="sm"
          type="submit"
        >
          {creating ? "Waiting…" : "Review & create"}
        </Button>
        {!isRepository ? (
          <small className={EXECUTION_DESCRIPTION_CLASS}>
            This selected workspace is not a Git repository.
          </small>
        ) : (
          <small className={EXECUTION_DESCRIPTION_CLASS}>
            Creation is local and requires native confirmation. It creates a
            branch and contained worktree only.
          </small>
        )}
      </form>

      {notice ? (
        <div
          aria-live="polite"
          className={`${EXECUTION_NOTICE_CLASS} ${
            notice.tone === "good"
              ? "bg-[var(--good-soft)] text-[var(--good)]"
              : notice.tone === "bad"
                ? "text-[var(--bad)]"
                : ""
          }`}
          role="status"
        >
          {notice.message}
        </div>
      ) : null}

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className={EXECUTION_EYEBROW_CLASS}>Available worktrees</span>
        <Button
          disabled={!active || loading}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="ghost"
        >
          Refresh
        </Button>
      </div>
      {loading ? (
        <p className={EXECUTION_DESCRIPTION_CLASS}>Reading local worktrees…</p>
      ) : error ? (
        <p className={`${EXECUTION_DESCRIPTION_CLASS} text-[var(--bad)]`}>
          {error}
        </p>
      ) : normalizedWorktrees.length ? (
        <div className="flex flex-col gap-[7px]">
          {normalizedWorktrees.map((worktree) => (
            <article
              className={`flex min-w-0 flex-col gap-[5px] rounded-[var(--radius-xs)] border bg-[var(--surface-raised)] p-[9px] ${
                isCurrentWorkspace(worktree.path, workspaceRoot)
                  ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] shadow-[inset_2px_0_var(--accent)]"
                  : "border-[var(--border)]"
              }`}
              key={worktree.path}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                  {worktreeLabel(worktree)}
                </strong>
                {isCurrentWorkspace(worktree.path, workspaceRoot) ? (
                  <Badge tone="good">Current</Badge>
                ) : null}
                {worktree.prunable ? <Badge tone="warn">Prunable</Badge> : null}
              </div>
              <code
                className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]"
                title={worktree.path}
              >
                {compactWorkspacePath(worktree.path)}
              </code>
              {worktree.head ? (
                <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--muted)]">
                  {worktree.head}
                </small>
              ) : null}
              {!isCurrentWorkspace(worktree.path, workspaceRoot) ? (
                <Button
                  className="mt-0.5 self-start"
                  disabled={!active || opening}
                  onClick={() => void openWorktree(worktree.path)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Open worktree
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyBlock title="No isolated worktrees">
          Create one above when a task should have its own local branch and
          directory.
        </EmptyBlock>
      )}
      <SandboxControlPanel active={active} />
    </section>
  );
}
