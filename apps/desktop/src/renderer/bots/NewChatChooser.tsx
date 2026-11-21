import type { BotSummary } from "@doolittle/contracts/bots";
import { FolderOpen, Plus, X } from "lucide-react";
import { useId, useRef } from "react";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import type { ProjectLike, ProjectScope } from "../project-manager/models";

export function NewChatChooser({
  bot,
  busy = false,
  transitionError = "",
  onConfirm,
  onClose,
  projects = [],
  scope = "unscoped",
  onScopeChange,
  onChooseLocalFolder,
}: {
  bot?: BotSummary;
  busy?: boolean;
  transitionError?: string;
  onConfirm: () => void;
  onClose: () => void;
  projects?: readonly ProjectLike[];
  scope?: ProjectScope;
  onScopeChange?: (scope: ProjectScope) => void;
  onChooseLocalFolder?: () => void;
}) {
  const titleId = useId();
  const workspaceId = useId();
  const workspaceDetailId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocusBoundary({
    active: true,
    initialFocusSelector: "select",
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose: () => {
      if (!busy) onClose();
    },
    restoreFocus: false,
  });
  const localProjects = projects.filter(
    (project) => !project.archived && project.primaryPath,
  );
  const selectedScope = scope === "all" ? "unscoped" : scope;
  const activeProject = localProjects.find(
    (project) => project.id === selectedScope,
  );
  const workspaceUnavailable = selectedScope !== "unscoped" && !activeProject;
  return (
    <div className="new-chat-backdrop" ref={backdropRef}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="new-chat-chooser"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>
            {bot ? `Start a chat with ${bot.name}` : "New chat"}
          </h2>
          <button
            aria-label="Close new chat"
            disabled={busy}
            className="bot-design-icon"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </header>
        <div className="mx-2 mb-2 grid gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-soft)] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              className="text-[length:var(--text-control)] font-medium"
              htmlFor={workspaceId}
            >
              Project for new chat
            </label>
            {onChooseLocalFolder ? (
              <button
                className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[length:var(--text-control)] text-[var(--text-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                disabled={busy}
                onClick={onChooseLocalFolder}
                type="button"
              >
                <FolderOpen aria-hidden size={14} />
                Choose local folder…
              </button>
            ) : null}
          </div>
          <select
            aria-describedby={workspaceDetailId}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[length:var(--text-control)] text-[var(--text)] focus:outline-none focus:border-[var(--border-strong)]"
            disabled={busy}
            id={workspaceId}
            onChange={(event) => onScopeChange?.(event.target.value)}
            value={selectedScope}
          >
            <option value="unscoped">Private workspace</option>
            {workspaceUnavailable ? (
              <option disabled value={selectedScope}>
                Project unavailable
              </option>
            ) : null}
            {localProjects.length > 0 ? (
              <optgroup label="This computer">
                {localProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <p
            className="m-0 min-w-0 truncate text-[length:var(--text-meta)] text-[var(--muted)]"
            id={workspaceDetailId}
            title={activeProject?.primaryPath}
          >
            {activeProject
              ? `This computer · ${activeProject.primaryPath}`
              : workspaceUnavailable
                ? "Choose an available workspace to continue."
                : "No local project access."}
          </p>
        </div>
        <button
          aria-label={bot ? `Start chat with ${bot.name}` : "Start chat"}
          className="new-chat-choice"
          disabled={busy || !bot || workspaceUnavailable}
          onClick={onConfirm}
          type="button"
        >
          <span aria-hidden className="new-chat-avatar">
            <Plus size={18} />
          </span>
          <span>
            <strong>Start chat</strong>
          </span>
        </button>
        {!bot ? (
          <p className="new-chat-status" role="alert">
            This bot is unavailable.
          </p>
        ) : null}
        {transitionError ? (
          <p className="new-chat-status" role="alert">
            {transitionError}
          </p>
        ) : null}
        {busy ? (
          <p className="new-chat-status" role="status">
            Opening your conversation…
          </p>
        ) : null}
      </div>
    </div>
  );
}
