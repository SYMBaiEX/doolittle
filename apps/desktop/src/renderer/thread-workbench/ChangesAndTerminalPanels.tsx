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
    <div className="thread-workbench-panel-body thread-workbench-panel-body--changes">
      <div className="thread-workbench-pane-stack">
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
        <details className="thread-workbench-checkpoints">
          <summary>
            <span>
              <strong>Checkpoints</strong>
              <small>Local Git snapshots</small>
            </span>
            <Badge>
              {asArray(checkpoints.data?.checkpoints).length || "None"}
            </Badge>
          </summary>
          <div className="thread-workbench-checkpoints-body">
            <small>
              Restore requires confirmation and never restarts Doolittle.
            </small>
            {checkpoints.data?.support?.supported ? (
              <button
                className="thread-workbench-text-button"
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
              <div className="thread-workbench-checkpoint-list">
                {asArray(checkpoints.data?.checkpoints)
                  .slice(0, 8)
                  .map((value) => {
                    const checkpoint = asRecord(value);
                    const id = asString(checkpoint.id);
                    if (!id) return null;
                    return (
                      <div key={id}>
                        <span className="thread-workbench-checkpoint-details">
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
        <div className="thread-workbench-split">
          <div className="thread-workbench-list">
            {changeEntries.map((entry) => (
              <button
                aria-current={currentChange === entry.path}
                className={
                  currentChange === entry.path ? "selected" : undefined
                }
                key={entry.path}
                onClick={() => setSelectedChange(entry.path)}
                title={entry.path}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={
                    entry.untracked
                      ? "untracked"
                      : entry.staged
                        ? "staged"
                        : "modified"
                  }
                >
                  {entry.untracked ? "U" : entry.staged ? "S" : "M"}
                </span>
                <span>{entry.path}</span>
                <small>{entry.status}</small>
              </button>
            ))}
            {!changeEntries.length ? (
              <p className="thread-workbench-empty">Working tree is clean.</p>
            ) : null}
          </div>
          {currentChange ? (
            <div className="thread-workbench-preview diff">
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
    <div className="thread-workbench-panel-body thread-workbench-panel-body--terminal">
      <ResourceState
        error={terminal.error}
        loading={terminal.loading}
        retry={terminal.reload}
      />
      {!terminal.loading && !terminal.error ? (
        <div className="thread-workbench-terminal">
          <div className="thread-workbench-command-list">
            {commandEntries.map((entry, index) => {
              const id = asString(entry.id, `terminal-${index}`);
              const selected = currentCommand === entry;
              return (
                <button
                  aria-current={selected}
                  className={selected ? "selected" : undefined}
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
            <div className="thread-workbench-preview terminal">
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
            <p className="thread-workbench-empty">No terminal history yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
