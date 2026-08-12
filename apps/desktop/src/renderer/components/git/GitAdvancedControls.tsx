import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { type FormEvent, useState } from "react";
import {
  branchNameIsValid,
  remoteNameIsValid,
  remoteUrlIsValid,
} from "../../repository-control";
import type { GitMutationRunner, GitWorktree } from "./models";
import { shortGitPath } from "./models";

export function GitAdvancedControls({
  branches,
  busy,
  conflicts,
  remotes,
  run,
  stashes,
  worktrees,
}: {
  branches: readonly RepositoryBranch[];
  busy: boolean;
  conflicts: readonly RepositoryConflict[];
  remotes: readonly RepositoryRemote[];
  run: GitMutationRunner;
  stashes: readonly RepositoryStash[];
  worktrees: readonly GitWorktree[];
}) {
  const [branchName, setBranchName] = useState("");
  const [cherryPickCommit, setCherryPickCommit] = useState("");
  const [stashMessage, setStashMessage] = useState("");
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [editingRemote, setEditingRemote] = useState("");

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
  const submitCherryPick = async (event: FormEvent) => {
    event.preventDefault();
    const commit = cherryPickCommit.trim();
    if (!commit) return;
    if (await run({ type: "cherry-pick", commit })) {
      setCherryPickCommit("");
    }
  };
  const submitRemote = async (event: FormEvent) => {
    event.preventDefault();
    if (!remoteNameIsValid(remoteName) || !remoteUrlIsValid(remoteUrl)) return;
    const completed = await run(
      editingRemote
        ? {
            type: "remote-set-url",
            name: editingRemote,
            url: remoteUrl.trim(),
          }
        : {
            type: "remote-add",
            name: remoteName.trim(),
            url: remoteUrl.trim(),
          },
    );
    if (completed) {
      setEditingRemote("");
      setRemoteName("origin");
      setRemoteUrl("");
    }
  };

  return (
    <div className="git-advanced-controls">
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
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run({ type: "merge", branch: branch.name })
                    }
                    type="button"
                  >
                    Merge
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run({ type: "rebase", branch: branch.name })
                    }
                    type="button"
                  >
                    Rebase
                  </button>
                  <button
                    aria-label={`Delete branch ${branch.name}`}
                    className="danger icon-button"
                    disabled={busy}
                    onClick={() =>
                      void run({ type: "branch-delete", branch: branch.name })
                    }
                    type="button"
                  >
                    ×
                  </button>
                </>
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
        <button disabled={busy || !branchNameIsValid(branchName)} type="submit">
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
                  void run({ type: "stash-pop", reference: stash.reference })
                }
                type="button"
              >
                Pop
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void run({ type: "stash-drop", reference: stash.reference })
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
            <button
              disabled={busy}
              onClick={() => void run({ type: "rebase-continue" })}
              type="button"
            >
              Continue rebase
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => void run({ type: "cherry-pick-abort" })}
              type="button"
            >
              Abort cherry-pick
            </button>
            <button
              disabled={busy}
              onClick={() => void run({ type: "cherry-pick-continue" })}
              type="button"
            >
              Continue cherry-pick
            </button>
          </div>
        </section>
      ) : null}

      <form className="git-control-section" onSubmit={submitCherryPick}>
        <header>
          <strong>Cherry-pick</strong>
        </header>
        <input
          disabled={busy}
          onChange={(event) => setCherryPickCommit(event.target.value)}
          placeholder="Commit SHA or ref"
          value={cherryPickCommit}
        />
        <button disabled={busy || !cherryPickCommit.trim()} type="submit">
          Apply commit
        </button>
      </form>

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
                  setEditingRemote(remote.name);
                  setRemoteName(remote.name);
                  setRemoteUrl(remote.fetchUrl || remote.pushUrl || "");
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
          disabled={busy || Boolean(editingRemote)}
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
          {editingRemote ? "Update remote" : "Add remote"}
        </button>
        {editingRemote ? (
          <button
            disabled={busy}
            onClick={() => {
              setEditingRemote("");
              setRemoteName("origin");
              setRemoteUrl("");
            }}
            type="button"
          >
            Cancel edit
          </button>
        ) : null}
      </form>

      <section className="git-control-section">
        <header>
          <strong>Worktrees</strong>
          <span>{worktrees.length}</span>
        </header>
        <div className="git-worktree-list">
          {worktrees.map((worktree) => (
            <div key={worktree.path}>
              <code title={worktree.path}>{shortGitPath(worktree.path)}</code>
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
    </div>
  );
}
