import type {
  RepositoryBranch,
  RepositoryConflict,
  RepositoryRemote,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { GitControlPanel } from "../components/GitControlPanel";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
} from "../lib";
import type { RepositoryControlChange } from "../repository-control";
import {
  bounded,
  commandOutput,
  contextBlock,
} from "../thread-workbench-controller";
import {
  WORKBENCH_CHANGES_BODY_CLASS,
  WORKBENCH_CHECKPOINT_DETAILS_CLASS,
  WORKBENCH_CHECKPOINT_LIST_CLASS,
  WORKBENCH_CHECKPOINTS_BODY_CLASS,
  WORKBENCH_CHECKPOINTS_CLASS,
  WORKBENCH_COMMAND_BUTTON_CLASS,
  WORKBENCH_COMMAND_LIST_CLASS,
  WORKBENCH_DIFF_PREVIEW_CLASS,
  WORKBENCH_EMPTY_CLASS,
  WORKBENCH_LIST_BUTTON_CLASS,
  WORKBENCH_LIST_BUTTON_SELECTED_CLASS,
  WORKBENCH_LIST_CLASS,
  WORKBENCH_PANE_STACK_CLASS,
  WORKBENCH_SPLIT_CLASS,
  WORKBENCH_TERMINAL_BODY_CLASS,
  WORKBENCH_TERMINAL_CLASS,
  WORKBENCH_TERMINAL_PREVIEW_CLASS,
  WORKBENCH_TEXT_BUTTON_CLASS,
  workbenchChangeTone,
} from "./layout";
import {
  compactRailLabel,
  statusTone,
  type WorkbenchController,
} from "./models";
import { ResourceState } from "./ResourceState";

type ChangesPanelController = Pick<
  WorkbenchController,
  | "repositorySummary"
  | "branches"
  | "changeEntries"
  | "conflicts"
  | "remotes"
  | "stashes"
  | "worktrees"
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
    branches,
    changeEntries,
    conflicts,
    remotes,
    stashes,
    worktrees,
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
  return (
    <div
      className={WORKBENCH_CHANGES_BODY_CLASS}
      data-thread-workbench-panel="changes"
    >
      <div className={WORKBENCH_PANE_STACK_CLASS}>
        <GitControlPanel
          active={Boolean(repositorySummary?.isRepository)}
          branches={asArray(branches.data?.branches) as RepositoryBranch[]}
          changes={changeEntries as RepositoryControlChange[]}
          conflicts={asArray(conflicts.data?.conflicts) as RepositoryConflict[]}
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
        <details
          className={WORKBENCH_CHECKPOINTS_CLASS}
          data-thread-workbench="checkpoints"
        >
          <summary>
            <span>
              <strong>Checkpoints</strong>
              <small>Local Git snapshots</small>
            </span>
            <Badge>
              {asArray(checkpoints.data?.checkpoints).length || "None"}
            </Badge>
          </summary>
          <div className={WORKBENCH_CHECKPOINTS_BODY_CLASS}>
            <small>
              Restore requires confirmation and never restarts Doolittle.
            </small>
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
      <ResourceState
        error={changes.error}
        loading={changes.loading}
        retry={changes.reload}
      />
      {!changes.loading && !changes.error ? (
        <div className={WORKBENCH_SPLIT_CLASS}>
          <div className={WORKBENCH_LIST_CLASS}>
            {changeEntries.map((entry) => (
              <button
                aria-current={currentChange === entry.path}
                className={`${WORKBENCH_LIST_BUTTON_CLASS} ${
                  currentChange === entry.path
                    ? WORKBENCH_LIST_BUTTON_SELECTED_CLASS
                    : ""
                }`}
                key={entry.path}
                onClick={() => setSelectedChange(entry.path)}
                title={entry.path}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={workbenchChangeTone(
                    entry.untracked
                      ? "untracked"
                      : entry.staged
                        ? "staged"
                        : "modified",
                  )}
                >
                  {entry.untracked ? "U" : entry.staged ? "S" : "M"}
                </span>
                <span>{entry.path}</span>
                <small>{entry.status}</small>
              </button>
            ))}
            {!changeEntries.length ? (
              <p className={WORKBENCH_EMPTY_CLASS}>Working tree is clean.</p>
            ) : null}
          </div>
          {currentChange ? (
            <div className={WORKBENCH_DIFF_PREVIEW_CLASS}>
              <div>
                <code title={currentChange}>
                  {compactRailLabel(currentChange)}
                </code>
                <button
                  disabled={!patch.data?.patch?.patch}
                  onClick={() =>
                    insert(
                      "Diff context added",
                      contextBlock(
                        "diff",
                        currentChange,
                        asString(patch.data?.patch?.patch),
                      ),
                    )
                  }
                  type="button"
                >
                  Add diff
                </button>
              </div>
              {patch.loading ? (
                <LoadingBlock label="Reading diff…" />
              ) : patch.error ? (
                <ErrorBlock error={patch.error} retry={patch.reload} />
              ) : (
                <pre>{bounded(asString(patch.data?.patch?.patch), 5_000)}</pre>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
      className={WORKBENCH_TERMINAL_BODY_CLASS}
      data-thread-workbench-panel="terminal"
    >
      <ResourceState
        error={terminal.error}
        loading={terminal.loading}
        retry={terminal.reload}
      />
      {!terminal.loading && !terminal.error ? (
        <div className={WORKBENCH_TERMINAL_CLASS}>
          <div className={WORKBENCH_COMMAND_LIST_CLASS}>
            {commandEntries.map((entry, index) => {
              const id = asString(entry.id, `terminal-${index}`);
              const selected = currentCommand === entry;
              return (
                <button
                  aria-current={selected}
                  className={`${WORKBENCH_COMMAND_BUTTON_CLASS} ${
                    selected ? WORKBENCH_LIST_BUTTON_SELECTED_CLASS : ""
                  }`}
                  key={id}
                  onClick={() => setSelectedCommand(id)}
                  type="button"
                >
                  <span>$ {asString(entry.command, "command")}</span>
                  <small>
                    {asString(entry.status, "completed")}
                    {entry.startedAt
                      ? ` · ${displayTimestamp(asString(entry.startedAt))}`
                      : ""}
                  </small>
                </button>
              );
            })}
          </div>
          {currentCommand ? (
            <div className={WORKBENCH_TERMINAL_PREVIEW_CLASS}>
              <div>
                <Badge tone={statusTone(asString(currentCommand.status))}>
                  {asString(currentCommand.status, "recorded")}
                </Badge>
                <button
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
                  type="button"
                >
                  Add output
                </button>
              </div>
              <pre>{bounded(selectedCommandOutput, 5_000)}</pre>
            </div>
          ) : (
            <p className={WORKBENCH_EMPTY_CLASS}>No terminal history yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
