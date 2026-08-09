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
import "./execution-environments.css";
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
    if (opening) return;
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
    if (opening) return;
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
    if (!nextBranch || !nextPath || creating) return;
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
      className="execution-environments"
    >
      <header className="execution-environments-header">
        <div>
          <span className="eyebrow">Execution environment</span>
          <strong title={workspaceRoot || undefined}>
            {compactWorkspacePath(workspaceRoot || "Local workspace")}
          </strong>
        </div>
        <Badge tone="good">Local</Badge>
      </header>
      <p className="execution-environments-description">
        Commands and agents run in the selected local workspace. No remote shell
        or cloud environment is configured here.
      </p>
      <button
        className="secondary-button execution-environments-open"
        disabled={!active || opening}
        onClick={() => void chooseWorkspace()}
        type="button"
      >
        {opening ? "Opening…" : "Open workspace…"}
      </button>

      <form className="execution-environments-create" onSubmit={createWorktree}>
        <span className="execution-environments-section-label">
          Isolated Git worktree
        </span>
        <label className="coding-worktree-field">
          <span>New branch</span>
          <input
            className="coding-worktree-input"
            autoCapitalize="none"
            autoComplete="off"
            disabled={creating || !isRepository}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="feature/short-name"
            spellCheck={false}
            value={branch}
          />
        </label>
        <label className="coding-worktree-field">
          <span>Workspace-relative path</span>
          <input
            className="coding-worktree-input"
            autoCapitalize="none"
            autoComplete="off"
            disabled={creating || !isRepository}
            onChange={(event) => setPath(event.target.value)}
            placeholder=".doolittle/worktrees/short-name"
            spellCheck={false}
            value={path}
          />
        </label>
        <button
          className="primary-button"
          disabled={!isRepository || !branch.trim() || !path.trim() || creating}
          type="submit"
        >
          {creating ? "Waiting…" : "Review & create"}
        </button>
        {!isRepository ? (
          <small>This selected workspace is not a Git repository.</small>
        ) : (
          <small>
            Creation is local and requires native confirmation. It creates a
            branch and contained worktree only.
          </small>
        )}
      </form>

      {notice ? (
        <div
          aria-live="polite"
          className={`execution-environments-notice ${notice.tone}`}
          role="status"
        >
          {notice.message}
        </div>
      ) : null}

      <div className="execution-environments-list-heading">
        <span>Available worktrees</span>
        <button
          className="coding-status-action"
          disabled={loading}
          onClick={onRefresh}
          type="button"
        >
          Refresh
        </button>
      </div>
      {loading ? (
        <p className="execution-environments-muted">Reading local worktrees…</p>
      ) : error ? (
        <p className="execution-environments-error">{error}</p>
      ) : normalizedWorktrees.length ? (
        <div className="execution-environments-list">
          {normalizedWorktrees.map((worktree) => (
            <article
              className={
                isCurrentWorkspace(worktree.path, workspaceRoot)
                  ? "current"
                  : ""
              }
              key={worktree.path}
            >
              <div>
                <strong>{worktreeLabel(worktree)}</strong>
                {isCurrentWorkspace(worktree.path, workspaceRoot) ? (
                  <Badge tone="good">Current</Badge>
                ) : null}
                {worktree.prunable ? <Badge tone="warn">Prunable</Badge> : null}
              </div>
              <code title={worktree.path}>
                {compactWorkspacePath(worktree.path)}
              </code>
              {worktree.head ? <small>{worktree.head}</small> : null}
              {!isCurrentWorkspace(worktree.path, workspaceRoot) ? (
                <button
                  className="coding-status-action execution-environments-choose"
                  disabled={opening}
                  onClick={() => void openWorktree(worktree.path)}
                  type="button"
                >
                  Open worktree
                </button>
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
