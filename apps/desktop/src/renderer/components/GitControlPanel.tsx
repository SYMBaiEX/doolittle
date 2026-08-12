import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { type FormEvent, useMemo, useState } from "react";
import { errorMessage } from "../lib";
import {
  type GitNotice,
  gitChangeLabel,
  groupRepositoryChanges,
  mutationNotice,
  type RepositoryControlChange,
  requestLabel,
} from "../repository-control";
import { GitAdvancedControls } from "./git/GitAdvancedControls";
import type { GitWorktree } from "./git/models";
import { shortGitPath } from "./git/models";
import "./git-control-panel.css";

type DesktopMutationResult =
  | { status: "cancelled" }
  | { status: "completed"; result: RepositoryMutationResult }
  | RepositoryMutationResult;

export type GitControlPanelVariant = "compact" | "full";

export type { GitWorktree } from "./git/models";

export type GitControlPanelProps = {
  active: boolean;
  changes?: readonly RepositoryControlChange[];
  branches?: readonly RepositoryBranch[];
  stashes?: readonly RepositoryStash[];
  conflicts?: readonly RepositoryConflict[];
  remotes?: readonly RepositoryRemote[];
  worktrees?: readonly GitWorktree[];
  variant?: GitControlPanelVariant;
  onRefresh?: () => void;
  mutate?: (
    request: RepositoryMutationRequest,
  ) => Promise<DesktopMutationResult>;
};

function selectedPaths(values: Record<string, boolean>): string[] {
  return Object.entries(values)
    .filter(([, selected]) => selected)
    .map(([path]) => path);
}

function normalizeResult(value: DesktopMutationResult): GitNotice {
  if ("status" in value) {
    if (value.status === "cancelled") {
      return { tone: "neutral", message: "Git operation cancelled." };
    }
    return mutationNotice(value.result);
  }
  return mutationNotice(value);
}

function ChangeSection({
  changes,
  group,
  selected,
  onToggle,
  onRun,
  busy,
}: {
  changes: readonly RepositoryControlChange[];
  group: "staged" | "unstaged" | "untracked";
  selected: Record<string, boolean>;
  onToggle: (path: string) => void;
  onRun: (request: RepositoryMutationRequest) => void;
  busy: boolean;
}) {
  if (!changes.length) return null;
  const paths = changes.map((change) => change.path);
  const action = group === "staged" ? "unstage" : "stage";
  const destructive = group !== "staged";
  return (
    <section className="git-control-section git-change-section">
      <header>
        <strong>{group}</strong>
        <span>{changes.length}</span>
        <div>
          <button
            disabled={busy}
            onClick={() => onRun({ type: action, paths })}
            type="button"
          >
            {group === "staged" ? "Unstage all" : "Stage all"}
          </button>
          {destructive ? (
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                onRun(
                  group === "untracked"
                    ? { type: "discard-untracked", paths }
                    : { type: "discard", paths },
                )
              }
              type="button"
            >
              Discard all
            </button>
          ) : null}
        </div>
      </header>
      <ul className="git-change-list">
        {changes.map((change) => (
          <li key={`${group}:${change.path}`}>
            <label title={change.path}>
              <input
                checked={selected[change.path] === true}
                disabled={busy}
                onChange={() => onToggle(change.path)}
                type="checkbox"
              />
              <span className="git-change-state">{gitChangeLabel(change)}</span>
              <code>{shortGitPath(change.path)}</code>
            </label>
            <div className="git-inline-actions">
              <button
                disabled={busy}
                onClick={() => onRun({ type: action, paths: [change.path] })}
                type="button"
              >
                {group === "staged" ? "Unstage" : "Stage"}
              </button>
              {destructive ? (
                <button
                  aria-label={`Discard ${change.path}`}
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    onRun(
                      group === "untracked"
                        ? { type: "discard-untracked", paths: [change.path] }
                        : { type: "discard", paths: [change.path] },
                    )
                  }
                  type="button"
                >
                  Discard
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GitControlPanel({
  active,
  changes = [],
  branches = [],
  stashes = [],
  conflicts = [],
  remotes = [],
  worktrees = [],
  variant = "full",
  onRefresh,
  mutate,
}: GitControlPanelProps) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<GitNotice | null>(null);
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [commitMessage, setCommitMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const grouped = useMemo(() => groupRepositoryChanges(changes), [changes]);
  const selected = selectedPaths(selection);
  const currentBranch = branches.find((branch) => branch.current);
  const run = async (request: RepositoryMutationRequest): Promise<boolean> => {
    if (busy || !active) return false;
    const mutation = mutate ?? window.doolittle.mutateRepository;
    setBusy(true);
    setNotice({ tone: "neutral", message: requestLabel(request) });
    try {
      const result = await mutation(request);
      setNotice(normalizeResult(result));
      if (!("status" in result) || result.status === "completed") {
        onRefresh?.();
      }
      return !("status" in result) || result.status === "completed";
    } catch (cause) {
      setNotice({ tone: "bad", message: errorMessage(cause) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggle = (path: string) => {
    setSelection((current) => ({ ...current, [path]: !current[path] }));
  };
  const submitCommit = async (event: FormEvent) => {
    event.preventDefault();
    const message = commitMessage.trim();
    if (!message) return;
    if (await run({ type: "commit", message, amend })) {
      setCommitMessage("");
    }
  };

  return (
    <section
      className={`git-control-panel ${variant}`}
      aria-label="Git controls"
    >
      <header className="git-control-heading">
        <div>
          <span className="eyebrow">Source control</span>
          <strong>{currentBranch?.name || "Git workspace"}</strong>
        </div>
        <div className="git-sync-actions">
          <button
            disabled={busy || !active}
            onClick={() => void run({ type: "fetch" })}
            type="button"
          >
            Fetch
          </button>
          <button
            disabled={busy || !active}
            onClick={() => void run({ type: "pull" })}
            type="button"
          >
            Pull
          </button>
          <button
            className="primary"
            disabled={busy || !active}
            onClick={() => void run({ type: "push" })}
            type="button"
          >
            Push
          </button>
        </div>
      </header>
      {notice ? (
        <p className={`git-control-notice ${notice.tone}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <div className="git-control-scroll">
        <section className="git-control-section git-selection-actions">
          <header>
            <strong>Selected changes</strong>
            <span>{selected.length}</span>
          </header>
          <div>
            <button
              disabled={busy || !selected.length}
              onClick={() => void run({ type: "stage", paths: selected })}
              type="button"
            >
              Stage
            </button>
            <button
              disabled={busy || !selected.length}
              onClick={() => void run({ type: "unstage", paths: selected })}
              type="button"
            >
              Unstage
            </button>
          </div>
        </section>
        <ChangeSection
          busy={busy}
          changes={grouped.staged}
          group="staged"
          onRun={(request) => void run(request)}
          onToggle={toggle}
          selected={selection}
        />
        <ChangeSection
          busy={busy}
          changes={grouped.unstaged}
          group="unstaged"
          onRun={(request) => void run(request)}
          onToggle={toggle}
          selected={selection}
        />
        <ChangeSection
          busy={busy}
          changes={grouped.untracked}
          group="untracked"
          onRun={(request) => void run(request)}
          onToggle={toggle}
          selected={selection}
        />

        <form
          className="git-control-section git-commit-form"
          onSubmit={submitCommit}
        >
          <header>
            <strong>Commit</strong>
            {grouped.staged.length ? (
              <span>{grouped.staged.length} staged</span>
            ) : null}
          </header>
          <textarea
            disabled={busy}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Describe the change"
            value={commitMessage}
          />
          <label>
            <input
              checked={amend}
              disabled={busy}
              onChange={(event) => setAmend(event.target.checked)}
              type="checkbox"
            />{" "}
            Amend previous commit
          </label>
          <button
            className="primary"
            disabled={busy || !commitMessage.trim()}
            type="submit"
          >
            {amend ? "Amend commit" : "Commit staged"}
          </button>
        </form>

        {variant === "full" ? (
          <details className="git-advanced-disclosure">
            <summary>
              <span>
                <strong>Advanced repository operations</strong>
                <small>Branches, stashes, remotes, and worktrees</small>
              </span>
              <span>
                {branches.length} branches · {stashes.length} stashes
              </span>
            </summary>
            <GitAdvancedControls
              branches={branches}
              busy={busy}
              conflicts={conflicts}
              remotes={remotes}
              run={run}
              stashes={stashes}
              worktrees={worktrees}
            />
          </details>
        ) : null}
      </div>
    </section>
  );
}
