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
import {
  GIT_CODE_CLASS,
  GIT_LIST_CLASS,
  GIT_ROW_CLASS,
  GIT_SECTION_CLASS,
  GIT_SECTION_HEADER_CLASS,
  GitButton,
  GitTextarea,
} from "./git/GitControlPrimitives";
import type { GitWorktree } from "./git/models";
import { shortGitPath } from "./git/models";

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
    <section className={GIT_SECTION_CLASS} data-git-change-section="">
      <header className={GIT_SECTION_HEADER_CLASS}>
        <strong>{group}</strong>
        <span>{changes.length}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.25">
          <GitButton
            disabled={busy}
            onClick={() => onRun({ type: action, paths })}
            type="button"
          >
            {group === "staged" ? "Unstage all" : "Stage all"}
          </GitButton>
          {destructive ? (
            <GitButton
              disabled={busy}
              onClick={() =>
                onRun(
                  group === "untracked"
                    ? { type: "discard-untracked", paths }
                    : { type: "discard", paths },
                )
              }
              tone="danger"
              type="button"
            >
              Discard all
            </GitButton>
          ) : null}
        </div>
      </header>
      <ul className={GIT_LIST_CLASS}>
        {changes.map((change) => (
          <li
            className={`${GIT_ROW_CLASS} justify-between`}
            key={`${group}:${change.path}`}
          >
            <label
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 overflow-hidden"
              title={change.path}
            >
              <input
                checked={selected[change.path] === true}
                className="accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_72%,transparent)] focus-visible:outline-offset-3"
                disabled={busy}
                onChange={() => onToggle(change.path)}
                type="checkbox"
              />
              <span className="w-14 text-[length:var(--text-meta)] text-[var(--muted)]">
                {gitChangeLabel(change)}
              </span>
              <code
                className={`${GIT_CODE_CLASS} text-[10px] text-[var(--text)]`}
              >
                {shortGitPath(change.path)}
              </code>
            </label>
            <div className="flex shrink-0 flex-wrap gap-1.25">
              <GitButton
                disabled={busy}
                onClick={() => onRun({ type: action, paths: [change.path] })}
                type="button"
              >
                {group === "staged" ? "Unstage" : "Stage"}
              </GitButton>
              {destructive ? (
                <GitButton
                  aria-label={`Discard ${change.path}`}
                  disabled={busy}
                  onClick={() =>
                    onRun(
                      group === "untracked"
                        ? { type: "discard-untracked", paths: [change.path] }
                        : { type: "discard", paths: [change.path] },
                    )
                  }
                  tone="danger"
                  type="button"
                >
                  Discard
                </GitButton>
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
      aria-label="Git controls"
      className={`git-control-panel flex min-h-0 flex-col text-[var(--text)] ${
        variant === "compact" ? "gap-1.5 p-1.5" : "gap-2"
      }`}
      data-density={variant}
    >
      <header
        className={`flex items-center justify-between gap-2 ${
          variant === "compact"
            ? "min-h-7"
            : "max-[700px]:flex-col max-[700px]:items-start"
        }`}
      >
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          {variant === "full" ? (
            <span className="eyebrow">Source control</span>
          ) : null}
          <strong
            className={`${
              variant === "compact"
                ? "max-w-31 text-[10px]"
                : "max-w-55 text-xs"
            } truncate font-mono max-[700px]:max-w-full`}
          >
            {currentBranch?.name || "Git workspace"}
          </strong>
        </div>
        <div className="flex flex-wrap gap-1 max-[700px]:w-full [&>button]:max-[700px]:flex-1">
          <GitButton
            disabled={busy || !active}
            onClick={() => void run({ type: "fetch" })}
            type="button"
          >
            Fetch
          </GitButton>
          <GitButton
            disabled={busy || !active}
            onClick={() => void run({ type: "pull" })}
            type="button"
          >
            Pull
          </GitButton>
          <GitButton
            disabled={busy || !active}
            onClick={() => void run({ type: "push" })}
            tone="primary"
            type="button"
          >
            Push
          </GitButton>
        </div>
      </header>
      {notice ? (
        <p
          className={`m-0 rounded-[var(--radius-xs,5px)] border border-[var(--border)] px-2 py-1.75 text-[10px] leading-[1.45] ${
            notice.tone === "good"
              ? "bg-[var(--good-soft)] text-[var(--good)]"
              : notice.tone === "bad"
                ? "bg-[var(--bad-soft)] text-[var(--bad)]"
                : "bg-[var(--surface-raised)] text-[var(--text-soft)]"
          }`}
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      <div className="git-control-scroll flex min-h-0 flex-col gap-1.5 overflow-auto pr-0.5">
        {selected.length ? (
          <section className={GIT_SECTION_CLASS} data-git-selection-actions="">
            <header className={GIT_SECTION_HEADER_CLASS}>
              <strong>Selected changes</strong>
              <span>{selected.length}</span>
            </header>
            <div className="flex flex-wrap items-center gap-1.25">
              <GitButton
                disabled={busy}
                onClick={() => void run({ type: "stage", paths: selected })}
                type="button"
              >
                Stage
              </GitButton>
              <GitButton
                disabled={busy}
                onClick={() => void run({ type: "unstage", paths: selected })}
                type="button"
              >
                Unstage
              </GitButton>
            </div>
          </section>
        ) : null}
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
          className={GIT_SECTION_CLASS}
          data-git-commit-form=""
          onSubmit={submitCommit}
        >
          <header className={GIT_SECTION_HEADER_CLASS}>
            <strong>Commit</strong>
            {grouped.staged.length ? (
              <span>{grouped.staged.length} staged</span>
            ) : null}
          </header>
          <GitTextarea
            className={variant === "compact" ? "min-h-10 resize-none" : ""}
            disabled={busy}
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Describe the change"
            value={commitMessage}
          />
          <label className="text-[10px] text-[var(--muted)]">
            <input
              checked={amend}
              className="mr-1.25 accent-[var(--accent)]"
              disabled={busy}
              onChange={(event) => setAmend(event.target.checked)}
              type="checkbox"
            />{" "}
            Amend previous commit
          </label>
          <GitButton
            disabled={busy || !commitMessage.trim()}
            tone="primary"
            type="submit"
          >
            {amend ? "Amend commit" : "Commit staged"}
          </GitButton>
        </form>

        {variant === "full" ? (
          <details
            className="group overflow-hidden rounded-[var(--radius-xs,5px)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-raised)_72%,transparent)]"
            data-git-advanced-disclosure=""
          >
            <summary className="flex min-h-10.5 cursor-pointer list-none items-center justify-between gap-3 px-2.25 py-1.75 focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_72%,transparent)] focus-visible:outline-offset-2 group-open:border-[var(--border)] group-open:border-b [&::-webkit-details-marker]:hidden">
              <span className="grid min-w-0 gap-0.5">
                <strong className="font-mono text-[10px] text-[var(--text-soft)] uppercase tracking-[0.06em]">
                  Advanced repository operations
                </strong>
                <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
                  Branches, stashes, remotes, and worktrees
                </small>
              </span>
              <span className="flex items-center gap-2 text-[length:var(--text-meta)] text-[var(--muted)] after:font-mono after:text-[var(--muted)] after:content-['+'] group-open:after:content-['−']">
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
