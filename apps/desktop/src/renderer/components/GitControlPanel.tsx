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
  branchNameIsValid,
  type GitNotice,
  gitChangeLabel,
  groupRepositoryChanges,
  mutationNotice,
  type RepositoryControlChange,
  remoteNameIsValid,
  remoteUrlIsValid,
  requestLabel,
} from "../repository-control";
import "./git-control-panel.css";

type DesktopMutationResult =
  | { status: "cancelled" }
  | { status: "completed"; result: RepositoryMutationResult }
  | RepositoryMutationResult;

export type GitControlPanelVariant = "compact" | "full";

export type GitWorktree = {
  path: string;
  branch?: string;
  current?: boolean;
  prunable?: boolean;
};

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

function shortPath(path: string): string {
  const pieces = path.split("/").filter(Boolean);
  return pieces.length > 4 ? `…/${pieces.slice(-4).join("/")}` : path;
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
              <code>{shortPath(change.path)}</code>
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
  const [branchName, setBranchName] = useState("");
  const [stashMessage, setStashMessage] = useState("");
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
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
  const submitBranch = async (event: FormEvent) => {
    event.preventDefault();
    const branch = branchName.trim();
    if (!branchNameIsValid(branch)) return;
    if (await run({ type: "branch-create", branch, checkout: true })) {
      setBranchName("");
    }
  };
  const submitStash = async (event: FormEvent) => {
    event.preventDefault();
    if (
      await run({
        type: "stash-create",
        message: stashMessage.trim() || undefined,
        includeUntracked: true,
      })
    ) {
      setStashMessage("");
    }
  };
  const submitRemote = async (event: FormEvent) => {
    event.preventDefault();
    if (!remoteNameIsValid(remoteName) || !remoteUrlIsValid(remoteUrl)) return;
    if (
      await run({
        type: "remote-add",
        name: remoteName.trim(),
        url: remoteUrl.trim(),
      })
    ) {
      setRemoteUrl("");
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
          <>
            <form
              className="git-control-section git-branch-form"
              onSubmit={submitBranch}
            >
              <header>
                <strong>Branches</strong>
                <span>{branches.length}</span>
              </header>
              <div className="git-branch-list">
                {branches.map((branch) => (
                  <div key={branch.name}>
                    <button
                      className={branch.current ? "current" : ""}
                      disabled={busy || branch.current}
                      onClick={() =>
                        void run({ type: "branch-switch", branch: branch.name })
                      }
                      type="button"
                    >
                      {branch.name}
                      {branch.current ? " · current" : ""}
                    </button>
                    {!branch.current ? (
                      <button
                        aria-label={`Delete branch ${branch.name}`}
                        className="danger icon-button"
                        disabled={busy}
                        onClick={() =>
                          void run({
                            type: "branch-delete",
                            branch: branch.name,
                          })
                        }
                        type="button"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <input
                disabled={busy}
                onChange={(event) => setBranchName(event.target.value)}
                placeholder="feature/short-name"
                value={branchName}
              />
              <button
                disabled={busy || !branchNameIsValid(branchName)}
                type="submit"
              >
                Create and switch
              </button>
            </form>

            <form className="git-control-section" onSubmit={submitStash}>
              <header>
                <strong>Stashes</strong>
                <span>{stashes.length}</span>
              </header>
              <div className="git-stash-list">
                {stashes.map((stash) => (
                  <div key={stash.reference}>
                    <code>{stash.reference}</code>
                    <span>{stash.message || "Unlabelled stash"}</span>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: "stash-apply",
                          reference: stash.reference,
                        })
                      }
                      type="button"
                    >
                      Apply
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: "stash-pop",
                          reference: stash.reference,
                        })
                      }
                      type="button"
                    >
                      Pop
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: "stash-drop",
                          reference: stash.reference,
                        })
                      }
                      type="button"
                    >
                      Drop
                    </button>
                  </div>
                ))}
              </div>
              <input
                disabled={busy}
                onChange={(event) => setStashMessage(event.target.value)}
                placeholder="Optional stash message"
                value={stashMessage}
              />
              <button disabled={busy} type="submit">
                Stash including untracked
              </button>
            </form>

            {conflicts.length ? (
              <section className="git-control-section">
                <header>
                  <strong>Conflicts</strong>
                  <span>{conflicts.length}</span>
                </header>
                <div className="git-conflict-list">
                  {conflicts.map((conflict) => (
                    <div key={conflict.path}>
                      <code>{conflict.path}</code>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run({
                            type: "conflict-mark-resolved",
                            paths: [conflict.path],
                          })
                        }
                        type="button"
                      >
                        Mark resolved
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => void run({ type: "merge-abort" })}
                    type="button"
                  >
                    Abort merge
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => void run({ type: "rebase-abort" })}
                    type="button"
                  >
                    Abort rebase
                  </button>
                </div>
              </section>
            ) : null}

            <form className="git-control-section" onSubmit={submitRemote}>
              <header>
                <strong>Remotes</strong>
                <span>{remotes.length}</span>
              </header>
              <div className="git-remote-list">
                {remotes.map((remote) => (
                  <div key={remote.name}>
                    <code>{remote.name}</code>
                    <span title={remote.fetchUrl || remote.pushUrl}>
                      {remote.fetchUrl || remote.pushUrl || "No URL"}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => {
                        const url = window.prompt(
                          `New URL for ${remote.name}`,
                          remote.fetchUrl || remote.pushUrl || "",
                        );
                        if (url && remoteUrlIsValid(url))
                          void run({
                            type: "remote-set-url",
                            name: remote.name,
                            url,
                          });
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() =>
                        void run({ type: "remote-remove", name: remote.name })
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <input
                disabled={busy}
                onChange={(event) => setRemoteName(event.target.value)}
                placeholder="Remote name"
                value={remoteName}
              />
              <input
                disabled={busy}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="https://github.com/org/repo.git"
                value={remoteUrl}
              />
              <button
                disabled={
                  busy ||
                  !remoteNameIsValid(remoteName) ||
                  !remoteUrlIsValid(remoteUrl)
                }
                type="submit"
              >
                Add remote
              </button>
            </form>

            <section className="git-control-section">
              <header>
                <strong>Worktrees</strong>
                <span>{worktrees.length}</span>
              </header>
              <div className="git-worktree-list">
                {worktrees.map((worktree) => (
                  <div key={worktree.path}>
                    <code title={worktree.path}>
                      {shortPath(worktree.path)}
                    </code>
                    <span>{worktree.branch || "Detached"}</span>
                    {!worktree.current ? (
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          void run({
                            type: "worktree-remove",
                            path: worktree.path,
                          })
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                disabled={busy}
                onClick={() => void run({ type: "worktree-prune" })}
                type="button"
              >
                Prune unavailable worktrees
              </button>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
