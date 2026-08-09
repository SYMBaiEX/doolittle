import type { FormEvent } from "react";
import type { TaskCapability } from "../orchestration-helpers";
import type { RepositoryWorktreeRecord } from "../orchestration-resources";
import { compactWorkspacePath } from "../workspace-path";
import type { ResourceState, TaskCreatePriority } from "./models";

export function TaskCreateForm({
  active,
  busy,
  title,
  objective,
  capability,
  framework,
  group,
  priority,
  workspaceRoot,
  availableWorktrees,
  accountPoolResource,
  onTitleChange,
  onObjectiveChange,
  onCapabilityChange,
  onFrameworkChange,
  onGroupChange,
  onPriorityChange,
  onWorkspaceRootChange,
  onSubmit,
  onClose,
}: {
  active: boolean;
  busy: boolean;
  title: string;
  objective: string;
  capability: TaskCapability;
  framework: string;
  group: string;
  priority: TaskCreatePriority;
  workspaceRoot: string;
  availableWorktrees: readonly RepositoryWorktreeRecord[];
  accountPoolResource: ResourceState;
  onTitleChange: (value: string) => void;
  onObjectiveChange: (value: string) => void;
  onCapabilityChange: (value: TaskCapability) => void;
  onFrameworkChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onPriorityChange: (value: TaskCreatePriority) => void;
  onWorkspaceRootChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <form className="orchestration-quick-create" onSubmit={onSubmit}>
      <label className="quick-title">
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Ship the settings accessibility pass"
          disabled={!active || busy}
        />
      </label>
      <label className="quick-objective">
        <span>Objective</span>
        <input
          value={objective}
          onChange={(event) => onObjectiveChange(event.target.value)}
          placeholder="Define the exact result and evidence expected"
          disabled={!active || busy}
        />
      </label>
      <label>
        <span>Work type</span>
        <select
          aria-label="Task work type"
          value={capability}
          onChange={(event) =>
            onCapabilityChange(event.target.value as TaskCapability)
          }
          disabled={!active || busy}
        >
          <option value="coding">Coding</option>
          <option value="research">Research</option>
        </select>
      </label>
      <label>
        <span>Framework</span>
        <select
          aria-label="Task framework"
          value={framework}
          onChange={(event) => onFrameworkChange(event.target.value)}
          disabled={!active || busy}
        >
          <option value="">Automatic (Eliza chooses)</option>
          <option value="codex">Codex · uses Codex pool</option>
          <option value="claude">Claude · uses Claude pool</option>
        </select>
      </label>
      <label>
        <span>Group</span>
        <input
          value={group}
          onChange={(event) => onGroupChange(event.target.value)}
          placeholder="product"
          disabled={!active || busy}
        />
      </label>
      <label>
        <span>Priority</span>
        <select
          value={priority}
          onChange={(event) =>
            onPriorityChange(event.target.value as TaskCreatePriority)
          }
          disabled={!active || busy}
        >
          <option value="">default</option>
          <option value="low">low</option>
          <option value="normal">normal</option>
          <option value="high">high</option>
        </select>
      </label>
      <label>
        <span>Worktree</span>
        <select
          aria-label="Task execution worktree"
          value={workspaceRoot}
          onChange={(event) => onWorkspaceRootChange(event.target.value)}
          disabled={!active || busy}
        >
          <option value="">Select an isolated worktree</option>
          {availableWorktrees.map((worktree) => (
            <option key={worktree.path} value={worktree.path}>
              {worktree.branch ?? (worktree.detached ? "detached" : "worktree")}{" "}
              · {compactWorkspacePath(worktree.path)}
            </option>
          ))}
        </select>
      </label>
      <div className="quick-create-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={!active || busy || !title.trim() || !objective.trim()}
        >
          {busy
            ? "Starting…"
            : capability === "coding"
              ? "Create & start coding"
              : "Create research task"}
        </button>
        <button className="text-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="orchestration-task-routing-note">
        Coding starts only in the selected active Git worktree, then hands its
        session receipt to Queue and its branch context to Review. Codex and
        Claude choose an eligible account from their provider pool when the
        delegated session starts.
      </p>
      {accountPoolResource.error ? (
        <p className="orchestration-task-routing-note" role="status">
          Account options could not be refreshed. You can still use automatic
          routing.
          <button
            className="text-button"
            type="button"
            onClick={accountPoolResource.reload}
          >
            Retry account options
          </button>
        </p>
      ) : null}
    </form>
  );
}
