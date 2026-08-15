import type { FormEvent } from "react";
import { orchestrationClass as oc } from "./layout";
import type { PlanStatus } from "./models";

export function PlanCreateForm({
  active,
  busy,
  supportsCreate,
  title,
  objective,
  status,
  taskId,
  workflowId,
  onTitleChange,
  onObjectiveChange,
  onStatusChange,
  onTaskIdChange,
  onWorkflowIdChange,
  onSubmit,
  onClose,
}: {
  active: boolean;
  busy: boolean;
  supportsCreate: boolean;
  title: string;
  objective: string;
  status: PlanStatus;
  taskId: string;
  workflowId: string;
  onTitleChange: (value: string) => void;
  onObjectiveChange: (value: string) => void;
  onStatusChange: (value: PlanStatus) => void;
  onTaskIdChange: (value: string) => void;
  onWorkflowIdChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <form className={oc("orchestration-quick-create")} onSubmit={onSubmit}>
      <label className="quick-title">
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={!active || busy}
        />
      </label>
      <label className="quick-objective">
        <span>Objective</span>
        <input
          value={objective}
          onChange={(event) => onObjectiveChange(event.target.value)}
          disabled={!active || busy}
        />
      </label>
      <label>
        <span>Status</span>
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as PlanStatus)}
          disabled={!active || busy}
        >
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="completed">completed</option>
        </select>
      </label>
      <label>
        <span>Task ID</span>
        <input
          value={taskId}
          onChange={(event) => onTaskIdChange(event.target.value)}
          placeholder="optional"
          disabled={!active || busy}
        />
      </label>
      <label>
        <span>Workflow ID</span>
        <input
          value={workflowId}
          onChange={(event) => onWorkflowIdChange(event.target.value)}
          placeholder="optional"
          disabled={!active || busy}
        />
      </label>
      <div className={oc("quick-create-actions")}>
        <button
          className="primary-button"
          type="submit"
          disabled={
            !active ||
            !supportsCreate ||
            busy ||
            !title.trim() ||
            !objective.trim()
          }
        >
          {busy ? "Creating…" : "Create plan"}
        </button>
        <button className="text-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  );
}
