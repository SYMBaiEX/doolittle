import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import {
  ChevronRight,
  Copy,
  GitCompareArrows,
  MessageSquarePlus,
  SquareTerminal,
} from "lucide-react";
import { GitControlPanel } from "../components/GitControlPanel";
import { UiIcon } from "../components/UiIcon";
import { WorkspacePatchView } from "../components/WorkspacePatchView";
import { copyContextText } from "../context-menu-clipboard";
import {
  asArray,
  asRecord,
  asString,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import {
  bounded,
  commandOutput,
  contextBlock,
} from "../thread-workbench-controller";
import { ChangeFileList } from "./ChangeFileList";
import {
  WORKBENCH_CHECKPOINT_DETAILS_CLASS,
  WORKBENCH_CHECKPOINT_LIST_CLASS,
  WORKBENCH_CHECKPOINTS_BODY_CLASS,
  WORKBENCH_TEXT_BUTTON_CLASS,
} from "./layout";
import type { WorkbenchController } from "./models";
import { ResourceState } from "./ResourceState";

type ChangesPanelController = Pick<
  WorkbenchController,
  | "repositorySummary"
  | "summary"
  | "branches"
  | "changeEntries"
  | "conflicts"
  | "remotes"
  | "stashes"
  | "worktrees"
  | "mutateRepository"
  | "refreshGit"
  | "checkpoints"
  | "checkpointBusy"
  | "createCheckpoint"
  | "checkpointMessage"
  | "restoreCheckpoint"
  | "changes"
  | "currentChange"
  | "patch"
  | "setSelectedChange"
  | "insert"
>;

type TerminalPanelController = Pick<
  WorkbenchController,
  | "terminal"
  | "commandEntries"
  | "currentCommand"
  | "setSelectedCommand"
  | "insert"
>;

export function ChangesPanel({
  controller,
}: {
  controller: ChangesPanelController;
}) {
  const {
    repositorySummary,
    summary,
    branches,
    changeEntries,
    conflicts,
    remotes,
    stashes,
    worktrees,
    mutateRepository,
    refreshGit,
    checkpoints,
    checkpointBusy,
    createCheckpoint,
    checkpointMessage,
    restoreCheckpoint,
    changes,
    currentChange,
    patch,
    setSelectedChange,
    insert,
  } = controller;
  // Empty changes also represent a non-repository workspace. Git controls
  // and clean-state claims require a successful repository summary first.
  if (
    summary?.loading ||
    summary?.error ||
    repositorySummary?.isRepository !== true
  ) {
    return (
      <div
        className="workspace-inspector-scroll"
        data-thread-workbench-panel="changes"
      >
        {summary?.loading ? (
          <LoadingBlock label="Checking Git repository…" />
        ) : summary?.error ? (
          <ErrorBlock error={summary.error} retry={refreshGit} />
        ) : (
          <section
            aria-label="Repository availability"
            className="workspace-inspector-section"
          >
            <header className="workspace-inspector-section-title">
              <h3>
                {repositorySummary?.isRepository === false
                  ? "No Git repository"
                  : "Repository status unavailable"}
              </h3>
            </header>
            <p className="workspace-inspector-empty">
              {repositorySummary?.isRepository === false
                ? "Choose a Git repository to inspect changes."
                : "Refresh the repository status before using Git controls."}
            </p>
          </section>
        )}
      </div>
    );
  }
  const selectedPatch = patch.data?.patch;
  const patchText = selectedPatch?.patch ?? "";
  return (
    <div
      className="workspace-inspector-evidence"
      data-thread-workbench-panel="changes"
    >
      <div className="workspace-inspector-evidence-list workspace-inspector-scroll">
        <ResourceState
          error={changes.error}
          loading={changes.loading}
          retry={changes.reload}
        />
        {!changes.loading && !changes.error ? (
          <ChangeFileList
            changes={changeEntries}
            currentPath={currentChange}
            onSelect={setSelectedChange}
          />
        ) : null}
        <details className="workspace-inspector-disclosure">
          <summary>
            <UiIcon icon={ChevronRight} size="sm" />
            Git controls
          </summary>
          <GitControlPanel
            active
            branches={asArray(branches.data?.branches) as RepositoryBranch[]}
            changes={changeEntries}
            conflicts={
              asArray(conflicts.data?.conflicts) as RepositoryConflict[]
            }
            mutate={mutateRepository}
            onRefresh={refreshGit}
            remotes={asArray(remotes.data?.remotes) as RepositoryRemote[]}
            stashes={asArray(stashes.data?.stashes) as RepositoryStash[]}
            variant="compact"
            worktrees={
              asArray(worktrees.data?.worktrees) as Array<{
                path: string;
                branch?: string;
                current?: boolean;
                prunable?: boolean;
              }>
            }
          />
        </details>
        <details
          className="workspace-inspector-disclosure"
          data-thread-workbench="checkpoints"
        >
          <summary>
            <UiIcon icon={ChevronRight} size="sm" />
            Checkpoints
            <small>{asArray(checkpoints.data?.checkpoints).length}</small>
          </summary>
          <div className={WORKBENCH_CHECKPOINTS_BODY_CLASS}>
            {checkpoints.data?.support?.supported ? (
              <button
                className={WORKBENCH_TEXT_BUTTON_CLASS}
                disabled={checkpointBusy}
                onClick={() => void createCheckpoint()}
                type="button"
              >
                {checkpointBusy ? "Working…" : "Create checkpoint"}
              </button>
            ) : (
              <small>
                {asString(
                  checkpoints.data?.support?.reason,
                  "Checkpoints unavailable.",
                )}
              </small>
            )}
            {checkpointMessage ? (
              <p role="status">{checkpointMessage}</p>
            ) : null}
            {checkpoints.data?.support?.supported ? (
              <div className={WORKBENCH_CHECKPOINT_LIST_CLASS}>
                {asArray(checkpoints.data?.checkpoints)
                  .slice(0, 8)
                  .map((value) => {
                    const checkpoint = asRecord(value);
                    const id = asString(checkpoint.id);
                    if (!id) return null;
                    return (
                      <div key={id}>
                        <span className={WORKBENCH_CHECKPOINT_DETAILS_CLASS}>
                          <strong>
                            {asString(checkpoint.label, "Checkpoint")}
                          </strong>
                          <small>
                            {displayTimestamp(asString(checkpoint.createdAt))} ·{" "}
                            {asString(checkpoint.revision).slice(0, 8)}
                          </small>
                        </span>
                        <button
                          disabled={checkpointBusy}
                          onClick={() => void restoreCheckpoint(id)}
                          type="button"
                        >
                          Restore
                        </button>
                      </div>
                    );
                  })}
              </div>
            ) : null}
          </div>
        </details>
      </div>
      {currentChange && !changes.loading && !changes.error ? (
        <section
          aria-label="Selected diff"
          className="workspace-inspector-evidence-preview"
        >
          <header className="workspace-inspector-evidence-heading">
            <UiIcon icon={GitCompareArrows} size="sm" />
            <strong title={currentChange}>{currentChange}</strong>
            <button
              className="workspace-inspector-action"
              disabled={!patchText || patch.loading || Boolean(patch.error)}
              onClick={() =>
                insert(
                  "Diff context added",
                  contextBlock("diff", currentChange, patchText),
                )
              }
              title="Add diff to chat"
              type="button"
            >
              <UiIcon icon={MessageSquarePlus} size="sm" />
              Add diff
            </button>
          </header>
          {patch.loading ? (
            <LoadingBlock label="Reading diff…" />
          ) : patch.error ? (
            <ErrorBlock error={patch.error} retry={patch.reload} />
          ) : patchText ? (
            <WorkspacePatchView
              path={currentChange}
              patch={patchText}
              truncated={selectedPatch?.truncated}
            />
          ) : (
            <p className="workspace-inspector-empty">No textual diff.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

const MAX_COMMAND_PREVIEW = 40_000;

function commandStatus(entry: Record<string, unknown>): {
  label: string;
  tone?: "good" | "bad";
} {
  const code = entry.exitCode;
  if (entry.timedOut === true) return { label: "Timed out", tone: "bad" };
  if (typeof code === "number" && Number.isInteger(code)) {
    return { label: `Exit ${code}`, tone: code === 0 ? "good" : "bad" };
  }
  return { label: asString(entry.status) || "Recorded" };
}

export function TerminalPanel({
  controller,
}: {
  controller: TerminalPanelController;
}) {
  const {
    terminal,
    commandEntries,
    currentCommand,
    setSelectedCommand,
    insert,
  } = controller;
  const selectedCommandOutput = currentCommand
    ? commandOutput(currentCommand)
    : "";
  return (
    <div
      className="workspace-inspector-evidence"
      data-thread-workbench-panel="terminal"
    >
      <ResourceState
        error={terminal.error}
        loading={terminal.loading}
        retry={terminal.reload}
      />
      {!terminal.loading && !terminal.error ? (
        <>
          <section
            aria-label="Command history"
            className="workspace-inspector-evidence-list workspace-inspector-scroll"
          >
            <header className="workspace-inspector-section-title">
              <h3>Command history</h3>
              <span>{commandEntries.length}</span>
            </header>
            {commandEntries.length ? (
              <ul className="workspace-inspector-list">
                {commandEntries.map((entry, index) => {
                  const id = asString(entry.id, `terminal-${index}`);
                  const command = asString(entry.command, "Command");
                  const status = commandStatus(entry);
                  return (
                    <li key={id}>
                      <button
                        aria-current={
                          currentCommand === entry ? "true" : undefined
                        }
                        className="workspace-inspector-row workspace-inspector-command"
                        onClick={() => setSelectedCommand(id)}
                        title={command}
                        type="button"
                      >
                        <UiIcon icon={SquareTerminal} size="sm" />
                        <span className="workspace-inspector-label">
                          <strong>{command}</strong>
                          {entry.startedAt ? (
                            <time dateTime={asString(entry.startedAt)}>
                              {displayTimestamp(asString(entry.startedAt))}
                            </time>
                          ) : null}
                        </span>
                        <span
                          className="workspace-inspector-flag"
                          data-tone={status.tone}
                        >
                          {status.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="workspace-inspector-empty">
                No terminal history yet.
              </p>
            )}
          </section>
          {currentCommand ? (
            <section
              aria-label="Recorded output"
              className="workspace-inspector-evidence-preview"
            >
              <header className="workspace-inspector-evidence-heading">
                <UiIcon icon={SquareTerminal} size="sm" />
                <strong>Output</strong>
                <button
                  aria-label="Copy command output"
                  className="workspace-inspector-icon"
                  disabled={!selectedCommandOutput}
                  onClick={() => void copyContextText(selectedCommandOutput)}
                  title="Copy command output"
                  type="button"
                >
                  <UiIcon icon={Copy} size="sm" />
                </button>
                <button
                  className="workspace-inspector-action"
                  disabled={!selectedCommandOutput}
                  onClick={() =>
                    insert(
                      "Terminal output added",
                      contextBlock(
                        "terminal",
                        asString(currentCommand.command, "command"),
                        selectedCommandOutput,
                      ),
                    )
                  }
                  title="Add output to chat"
                  type="button"
                >
                  <UiIcon icon={MessageSquarePlus} size="sm" />
                  Add output
                </button>
              </header>
              {selectedCommandOutput ? (
                <section
                  aria-label="Command output"
                  className="workspace-inspector-console workspace-inspector-scroll"
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: Recorded output must be keyboard-scrollable.
                  tabIndex={0}
                >
                  <pre>
                    {bounded(selectedCommandOutput, MAX_COMMAND_PREVIEW)}
                  </pre>
                </section>
              ) : (
                <p className="workspace-inspector-empty">
                  This command produced no output.
                </p>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
