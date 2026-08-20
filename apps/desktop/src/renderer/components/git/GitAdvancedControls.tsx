import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  branchNameIsValid,
  remoteNameIsValid,
  remoteUrlIsValid,
} from "../../repository-control";
import { UiIcon } from "../UiIcon";
import {
  GIT_CODE_CLASS,
  GIT_LIST_CLASS,
  GIT_ROW_CLASS,
  GIT_SECTION_CLASS,
  GIT_SECTION_HEADER_CLASS,
  GitButton,
  GitInput,
} from "./GitControlPrimitives";
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
    <div className="grid grid-cols-2 gap-2 p-2 max-[700px]:grid-cols-1">
      <form className={GIT_SECTION_CLASS} onSubmit={submitBranch}>
        <header className={GIT_SECTION_HEADER_CLASS}>
          <strong>Branches</strong>
          <span>{branches.length}</span>
        </header>
        <div className={GIT_LIST_CLASS}>
          {branches.map((branch) => (
            <div className={GIT_ROW_CLASS} key={branch.name}>
              <GitButton
                className="min-w-0 truncate text-left"
                current={branch.current}
                disabled={busy || branch.current}
                onClick={() =>
                  void run({ type: "branch-switch", branch: branch.name })
                }
                type="button"
              >
                {branch.name}
                {branch.current ? " · current" : ""}
              </GitButton>
              {!branch.current ? (
                <>
                  <GitButton
                    disabled={busy}
                    onClick={() =>
                      void run({ type: "merge", branch: branch.name })
                    }
                    type="button"
                  >
                    Merge
                  </GitButton>
                  <GitButton
                    disabled={busy}
                    onClick={() =>
                      void run({ type: "rebase", branch: branch.name })
                    }
                    type="button"
                  >
                    Rebase
                  </GitButton>
                  <GitButton
                    aria-label={`Delete branch ${branch.name}`}
                    className="ml-auto"
                    disabled={busy}
                    onClick={() =>
                      void run({ type: "branch-delete", branch: branch.name })
                    }
                    tone="danger"
                    type="button"
                  >
                    <UiIcon icon={Trash2} size="xs" />
                  </GitButton>
                </>
              ) : null}
            </div>
          ))}
        </div>
        <GitInput
          disabled={busy}
          onChange={(event) => setBranchName(event.target.value)}
          placeholder="feature/short-name"
          value={branchName}
        />
        <GitButton
          disabled={busy || !branchNameIsValid(branchName)}
          type="submit"
        >
          Create and switch
        </GitButton>
      </form>

      <form className={GIT_SECTION_CLASS} onSubmit={submitStash}>
        <header className={GIT_SECTION_HEADER_CLASS}>
          <strong>Stashes</strong>
          <span>{stashes.length}</span>
        </header>
        <div className={GIT_LIST_CLASS}>
          {stashes.map((stash) => (
            <div className={GIT_ROW_CLASS} key={stash.reference}>
              <code className={GIT_CODE_CLASS}>{stash.reference}</code>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--muted)]">
                {stash.message || "Unlabelled stash"}
              </span>
              <GitButton
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
              </GitButton>
              <GitButton
                disabled={busy}
                onClick={() =>
                  void run({ type: "stash-pop", reference: stash.reference })
                }
                type="button"
              >
                Pop
              </GitButton>
              <GitButton
                disabled={busy}
                onClick={() =>
                  void run({ type: "stash-drop", reference: stash.reference })
                }
                tone="danger"
                type="button"
              >
                Drop
              </GitButton>
            </div>
          ))}
        </div>
        <GitInput
          disabled={busy}
          onChange={(event) => setStashMessage(event.target.value)}
          placeholder="Optional stash message"
          value={stashMessage}
        />
        <GitButton disabled={busy} type="submit">
          Stash including untracked
        </GitButton>
      </form>

      {conflicts.length ? (
        <section className={GIT_SECTION_CLASS}>
          <header className={GIT_SECTION_HEADER_CLASS}>
            <strong>Conflicts</strong>
            <span>{conflicts.length}</span>
          </header>
          <div className={GIT_LIST_CLASS}>
            {conflicts.map((conflict) => (
              <div className={GIT_ROW_CLASS} key={conflict.path}>
                <code className={`${GIT_CODE_CLASS} flex-1`}>
                  {conflict.path}
                </code>
                <GitButton
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
                </GitButton>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.25">
            <GitButton
              disabled={busy}
              onClick={() => void run({ type: "merge-abort" })}
              tone="danger"
              type="button"
            >
              Abort merge
            </GitButton>
            <GitButton
              disabled={busy}
              onClick={() => void run({ type: "rebase-abort" })}
              tone="danger"
              type="button"
            >
              Abort rebase
            </GitButton>
            <GitButton
              disabled={busy}
              onClick={() => void run({ type: "rebase-continue" })}
              type="button"
            >
              Continue rebase
            </GitButton>
            <GitButton
              disabled={busy}
              onClick={() => void run({ type: "cherry-pick-abort" })}
              tone="danger"
              type="button"
            >
              Abort cherry-pick
            </GitButton>
            <GitButton
              disabled={busy}
              onClick={() => void run({ type: "cherry-pick-continue" })}
              type="button"
            >
              Continue cherry-pick
            </GitButton>
          </div>
        </section>
      ) : null}

      <form className={GIT_SECTION_CLASS} onSubmit={submitCherryPick}>
        <header className={GIT_SECTION_HEADER_CLASS}>
          <strong>Cherry-pick</strong>
        </header>
        <GitInput
          disabled={busy}
          onChange={(event) => setCherryPickCommit(event.target.value)}
          placeholder="Commit SHA or ref"
          value={cherryPickCommit}
        />
        <GitButton disabled={busy || !cherryPickCommit.trim()} type="submit">
          Apply commit
        </GitButton>
      </form>

      <form className={GIT_SECTION_CLASS} onSubmit={submitRemote}>
        <header className={GIT_SECTION_HEADER_CLASS}>
          <strong>Remotes</strong>
          <span>{remotes.length}</span>
        </header>
        <div className={GIT_LIST_CLASS}>
          {remotes.map((remote) => (
            <div className={GIT_ROW_CLASS} key={remote.name}>
              <code className={GIT_CODE_CLASS}>{remote.name}</code>
              <span
                className="min-w-0 flex-1 truncate text-[10px] text-[var(--muted)]"
                title={remote.fetchUrl || remote.pushUrl}
              >
                {remote.fetchUrl || remote.pushUrl || "No URL"}
              </span>
              <GitButton
                disabled={busy}
                onClick={() => {
                  setEditingRemote(remote.name);
                  setRemoteName(remote.name);
                  setRemoteUrl(remote.fetchUrl || remote.pushUrl || "");
                }}
                type="button"
              >
                Edit
              </GitButton>
              <GitButton
                disabled={busy}
                onClick={() =>
                  void run({ type: "remote-remove", name: remote.name })
                }
                tone="danger"
                type="button"
              >
                Remove
              </GitButton>
            </div>
          ))}
        </div>
        <GitInput
          disabled={busy || Boolean(editingRemote)}
          onChange={(event) => setRemoteName(event.target.value)}
          placeholder="Remote name"
          value={remoteName}
        />
        <GitInput
          disabled={busy}
          onChange={(event) => setRemoteUrl(event.target.value)}
          placeholder="https://github.com/org/repo.git"
          value={remoteUrl}
        />
        <GitButton
          disabled={
            busy ||
            !remoteNameIsValid(remoteName) ||
            !remoteUrlIsValid(remoteUrl)
          }
          type="submit"
        >
          {editingRemote ? "Update remote" : "Add remote"}
        </GitButton>
        {editingRemote ? (
          <GitButton
            disabled={busy}
            onClick={() => {
              setEditingRemote("");
              setRemoteName("origin");
              setRemoteUrl("");
            }}
            type="button"
          >
            Cancel edit
          </GitButton>
        ) : null}
      </form>

      <section className={GIT_SECTION_CLASS}>
        <header className={GIT_SECTION_HEADER_CLASS}>
          <strong>Worktrees</strong>
          <span>{worktrees.length}</span>
        </header>
        <div className={GIT_LIST_CLASS}>
          {worktrees.map((worktree) => (
            <div className={GIT_ROW_CLASS} key={worktree.path}>
              <code className={GIT_CODE_CLASS} title={worktree.path}>
                {shortGitPath(worktree.path)}
              </code>
              <span className="text-[10px] text-[var(--muted)]">
                {worktree.branch || "Detached"}
              </span>
              {!worktree.current ? (
                <GitButton
                  className="ml-auto"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      type: "worktree-remove",
                      path: worktree.path,
                    })
                  }
                  tone="danger"
                  type="button"
                >
                  Remove
                </GitButton>
              ) : null}
            </div>
          ))}
        </div>
        <GitButton
          disabled={busy}
          onClick={() => void run({ type: "worktree-prune" })}
          type="button"
        >
          Prune unavailable worktrees
        </GitButton>
      </section>
    </div>
  );
}
