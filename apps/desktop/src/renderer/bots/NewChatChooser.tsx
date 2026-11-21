import type { BotSummary } from "@doolittle/contracts/bots";
import { FolderOpen, Plus, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import type { ProjectLike, ProjectScope } from "../project-manager/models";

export function NewChatChooser({
  bots,
  loading,
  busy = false,
  error,
  transitionError = "",
  onChoose,
  onCreate,
  onClose,
  onRetry,
  projects = [],
  scope = "unscoped",
  onScopeChange,
  onChooseLocalFolder,
}: {
  bots: readonly BotSummary[];
  loading: boolean;
  busy?: boolean;
  error: string;
  transitionError?: string;
  onChoose: (botId: string) => void;
  onCreate: () => void;
  onClose: () => void;
  onRetry: () => void;
  projects?: readonly ProjectLike[];
  scope?: ProjectScope;
  onScopeChange?: (scope: ProjectScope) => void;
  onChooseLocalFolder?: () => void;
}) {
  const [query, setQuery] = useState("");
  const titleId = useId();
  const workspaceId = useId();
  const workspaceDetailId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocusBoundary({
    active: true,
    initialFocusSelector: "input",
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose: () => {
      if (!busy) onClose();
    },
    restoreFocus: false,
  });
  const matches = bots.filter(
    (bot) =>
      !bot.archivedAt &&
      bot.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
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
          <h2 id={titleId}>Start a chat with…</h2>
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
        <label className="new-chat-search">
          <Search aria-hidden size={16} />
          <input
            aria-label="Find a bot"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Choose your bot"
            value={query}
          />
        </label>
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
          className="new-chat-choice"
          disabled={busy}
          onClick={onCreate}
          type="button"
        >
          <span aria-hidden className="new-chat-avatar">
            <Plus size={18} />
          </span>
          <span>
            <strong>Create a new bot</strong>
            <small>Design its character in a conversation</small>
          </span>
        </button>
        <section aria-label="Available bots" className="new-chat-bots">
          {matches.map((bot) => (
            <button
              className="new-chat-choice"
              disabled={busy || workspaceUnavailable}
              key={bot.id}
              onClick={() => onChoose(bot.id)}
              type="button"
            >
              <span aria-hidden className="new-chat-avatar">
                {bot.name.slice(0, 1)}
              </span>
              <span>
                <strong>{bot.name}</strong>
                <small>
                  {bot.isDefault
                    ? "Your lead agent"
                    : bot.character?.bio
                      ? typeof bot.character.bio === "string"
                        ? bot.character.bio
                        : bot.character.bio[0]
                      : "Start a new conversation"}
                </small>
              </span>
            </button>
          ))}
          {loading ? (
            <p role="status">Loading bots…</p>
          ) : !error && matches.length === 0 ? (
            <p>No bots match that name.</p>
          ) : null}
          {error ? (
            <p role="alert">
              Bots could not be loaded.{" "}
              <button className="text-button" onClick={onRetry} type="button">
                Try again
              </button>
            </p>
          ) : null}
          {transitionError ? (
            <p role="alert">{transitionError} Choose a bot to try again.</p>
          ) : null}
          {busy ? <p role="status">Opening your conversation…</p> : null}
        </section>
      </div>
    </div>
  );
}
