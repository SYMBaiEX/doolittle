import { Button as ElizaButton } from "@elizaos/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@elizaos/ui/components/ui/dialog";
import { Input as ElizaInput } from "@elizaos/ui/components/ui/input";
import { ScrollArea } from "@elizaos/ui/components/ui/scroll-area";
import { Search, Settings2, X } from "lucide-react";
import {
  type Dispatch,
  Fragment,
  type RefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UiIcon } from "../components/UiIcon";
import {
  loadPromptLibrary,
  MAX_PROMPT_LIBRARY_ITEMS,
  MAX_PROMPT_TITLE_LENGTH,
  PROMPT_LIBRARY_CHANGE_EVENT,
  PROMPT_LIBRARY_STORAGE_KEY,
  type PromptLibraryEntry,
  type StorageLike,
  savePromptLibrary,
} from "../conversation-persistence";

export interface PromptLibraryProps {
  activeProject?: { id: string; name: string } | null;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setAnnouncement: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<string>>;
}

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function PromptLibrary({
  activeProject,
  composerRef,
  draft,
  setAnnouncement,
  setDraft,
}: PromptLibraryProps) {
  const [entries, setEntries] = useState<PromptLibraryEntry[]>(() => {
    const storage = browserStorage();
    return storage ? loadPromptLibrary(storage) : [];
  });
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"general" | "project">(
    activeProject ? "project" : "general",
  );
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const storage = browserStorage();
    if (storage && savePromptLibrary(storage, entries)) {
      window.dispatchEvent(new Event(PROMPT_LIBRARY_CHANGE_EVENT));
    }
  }, [entries]);

  useEffect(() => {
    if (!activeProject) setScope("general");
  }, [activeProject]);

  useEffect(() => {
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PROMPT_LIBRARY_STORAGE_KEY)
        return;
      const storage = browserStorage();
      if (storage) setEntries(loadPromptLibrary(storage));
    };
    window.addEventListener("storage", refreshFromStorage);
    return () => window.removeEventListener("storage", refreshFromStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  useEffect(() => {
    if (editingId) renameRef.current?.focus();
  }, [editingId]);

  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) =>
        activeProject && scope === "project"
          ? entry.projectId === activeProject.id
          : !entry.projectId,
      ),
    [activeProject, entries, scope],
  );
  const managedEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) =>
      [entry.title, entry.content, entry.projectId ?? "general"]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [entries, query]);

  const focusComposer = () => {
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const saveCurrent = () => {
    const content = draft.trim();
    if (!content) {
      setAnnouncement("Write a prompt before saving it.");
      composerRef.current?.focus();
      return;
    }
    const fallbackTitle =
      content
        .split(/\r?\n/u, 1)[0]
        ?.replace(/\s+/gu, " ")
        .slice(0, MAX_PROMPT_TITLE_LENGTH) || "Saved prompt";
    const nextTitle = (title.trim() || fallbackTitle).slice(
      0,
      MAX_PROMPT_TITLE_LENGTH,
    );
    const now = new Date().toISOString();
    setEntries((current) =>
      [
        {
          id: crypto.randomUUID(),
          title: nextTitle,
          content,
          ...(activeProject && scope === "project"
            ? { projectId: activeProject.id }
            : {}),
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ].slice(0, MAX_PROMPT_LIBRARY_ITEMS),
    );
    setTitle("");
    setAnnouncement(`Saved “${nextTitle}” to the prompt library.`);
  };

  const restore = (entry: PromptLibraryEntry) => {
    setDraft(entry.content);
    setOpen(false);
    setManageOpen(false);
    setAnnouncement(`Restored “${entry.title}”.`);
    focusComposer();
  };

  const remove = (entry: PromptLibraryEntry) => {
    setEntries((current) =>
      current.filter((candidate) => candidate.id !== entry.id),
    );
    if (editingId === entry.id) {
      setEditingId("");
      setEditingTitle("");
    }
    setAnnouncement(`Deleted “${entry.title}” from the prompt library.`);
  };

  const beginRename = (entry: PromptLibraryEntry) => {
    setEditingId(entry.id);
    setEditingTitle(entry.title);
  };

  const cancelRename = () => {
    setEditingId("");
    setEditingTitle("");
  };

  const finishRename = () => {
    const nextTitle = editingTitle.trim().slice(0, MAX_PROMPT_TITLE_LENGTH);
    if (!editingId || !nextTitle) return;
    const now = new Date().toISOString();
    setEntries((current) =>
      current.map((entry) =>
        entry.id === editingId
          ? { ...entry, title: nextTitle, updatedAt: now }
          : entry,
      ),
    );
    cancelRename();
    setAnnouncement(`Renamed prompt to “${nextTitle}”.`);
  };

  return (
    <Fragment>
      <button
        aria-controls="chat-prompt-library"
        aria-expanded={open}
        className="secondary-button !min-h-[30px] rounded-[7px] px-[8px] py-[5px] text-[10px] font-semibold"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        Prompts{visibleEntries.length > 0 ? ` · ${visibleEntries.length}` : ""}
      </button>
      {open ? (
        <section
          aria-label="Prompt library"
          className="chat-prompt-library absolute bottom-[calc(100%+10px)] left-0 z-60 grid max-h-[min(440px,62vh)] w-[min(380px,calc(100vw-32px))] gap-2 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] p-3 text-[var(--text-soft)] shadow-[var(--shell-shadow-lg)]"
          id="chat-prompt-library"
          ref={panelRef}
        >
          <header className="flex items-start justify-between gap-3">
            <div className="chat-prompt-library__heading grid min-w-0 gap-0.5">
              <strong className="text-xs font-semibold text-[var(--text)]">
                Prompt library
              </strong>
              <small className="truncate text-[length:var(--text-meta)] text-[var(--muted)]">
                {activeProject && scope === "project"
                  ? activeProject.name
                  : "General"}
              </small>
            </div>
            <div className="flex items-center gap-1">
              <ElizaButton
                className="!min-h-7 gap-1.5 !rounded-[var(--radius-xs)] px-2 text-[length:var(--text-meta)]"
                onClick={() => {
                  setOpen(false);
                  setManageOpen(true);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <UiIcon icon={Settings2} size="xs" />
                Manage all
              </ElizaButton>
              <ElizaButton
                aria-label="Close prompt library"
                className="!size-7 !min-h-7 !min-w-7 !rounded-[var(--radius-xs)] !p-0"
                onClick={() => setOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <UiIcon icon={X} size="sm" />
              </ElizaButton>
            </div>
          </header>
          {activeProject ? (
            <fieldset
              aria-label="Prompt library scope"
              className="chat-prompt-library__scope flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] p-1"
            >
              <legend className="sr-only">Prompt library scope</legend>
              <button
                aria-pressed={scope === "project"}
                className="min-w-0 flex-1 truncate rounded-[var(--radius-xs)] border-0 bg-transparent px-2 py-1.5 text-[length:var(--text-meta)] text-[var(--muted)] aria-pressed:bg-[var(--surface-raised)] aria-pressed:text-[var(--text)]"
                onClick={() => setScope("project")}
                type="button"
              >
                {activeProject.name}
              </button>
              <button
                aria-pressed={scope === "general"}
                className="min-w-0 flex-1 truncate rounded-[var(--radius-xs)] border-0 bg-transparent px-2 py-1.5 text-[length:var(--text-meta)] text-[var(--muted)] aria-pressed:bg-[var(--surface-raised)] aria-pressed:text-[var(--text)]"
                onClick={() => setScope("general")}
                type="button"
              >
                General
              </button>
            </fieldset>
          ) : null}
          <div className="chat-prompt-library__save grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
            <ElizaInput
              aria-label="Saved prompt title"
              className="!h-8 !min-h-8 !rounded-[var(--radius-sm)] !border-[var(--border)] !bg-[var(--surface-soft)] px-2 text-[11px]"
              maxLength={MAX_PROMPT_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (optional)"
              value={title}
            />
            <ElizaButton
              className="!h-8 !min-h-8 !rounded-[var(--radius-sm)] px-2.5 text-[10px] font-semibold"
              disabled={!draft.trim()}
              onClick={saveCurrent}
              size="sm"
              type="button"
              variant="default"
            >
              Save draft
            </ElizaButton>
          </div>
          {visibleEntries.length > 0 ? (
            <ul className="grid gap-1">
              {visibleEntries.map((entry) => (
                <li
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-1.5 py-1.25 hover:border-[var(--border)] hover:bg-[var(--surface-soft)] focus-within:border-[var(--border)] focus-within:bg-[var(--surface-soft)]"
                  key={entry.id}
                >
                  {editingId === entry.id ? (
                    <input
                      aria-label={`Rename ${entry.title}`}
                      maxLength={MAX_PROMPT_TITLE_LENGTH}
                      onBlur={finishRename}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          finishRename();
                        } else if (event.key === "Escape") {
                          cancelRename();
                        }
                      }}
                      ref={renameRef}
                      value={editingTitle}
                    />
                  ) : (
                    <button
                      className="chat-prompt-library__restore grid min-w-0 gap-0.5 border-0 bg-transparent p-0 text-left"
                      onClick={() => restore(entry)}
                      title={entry.content}
                      type="button"
                    >
                      <strong className="truncate text-[11px] text-[var(--text)]">
                        {entry.title}
                      </strong>
                      <small className="truncate text-[length:var(--text-meta)] text-[var(--muted)]">
                        {entry.content}
                      </small>
                    </button>
                  )}
                  <span className="flex items-center gap-1">
                    <button
                      aria-label={`Rename ${entry.title}`}
                      className="rounded-[var(--radius-xs)] px-1.5 py-1 text-[length:var(--text-meta)] text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
                      onClick={() => beginRename(entry)}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      aria-label={`Delete ${entry.title}`}
                      className="rounded-[var(--radius-xs)] px-1.5 py-1 text-[length:var(--text-meta)] text-[var(--bad)] hover:bg-[var(--surface-raised)]"
                      onClick={() => remove(entry)}
                      type="button"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No saved prompts in this scope. Write a draft and save it here for
              reuse.
            </p>
          )}
        </section>
      ) : null}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent
          aria-describedby="prompt-library-manager-description"
          className="!grid !max-h-[min(720px,calc(100vh-40px))] !w-[min(720px,calc(100vw-32px))] !max-w-none !grid-rows-[auto_auto_minmax(0,1fr)] !gap-3 !overflow-hidden !rounded-[var(--radius-lg)] !border-[var(--border-strong)] !bg-[var(--surface-raised)] !p-4 !shadow-[var(--shell-shadow-lg)]"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLInputElement>(
                '[aria-label="Search saved prompts"]',
              )
              ?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusComposer();
          }}
        >
          <header className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <DialogTitle className="text-sm font-semibold text-[var(--text)]">
                Manage prompt library
              </DialogTitle>
              <p
                className="text-[length:var(--text-meta)] text-[var(--muted)]"
                id="prompt-library-manager-description"
              >
                {entries.length} saved{" "}
                {entries.length === 1 ? "prompt" : "prompts"}. Use $ in chat to
                search prompts and skills.
              </p>
            </div>
            <ElizaButton
              aria-label="Close prompt manager"
              className="!size-8 !min-h-8 !min-w-8 !rounded-[var(--radius-xs)] !p-0"
              onClick={() => setManageOpen(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <UiIcon icon={X} size="sm" />
            </ElizaButton>
          </header>
          <label
            className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 text-[var(--muted)]"
            htmlFor="prompt-library-manager-search"
          >
            <UiIcon icon={Search} size="sm" />
            <ElizaInput
              aria-label="Search saved prompts"
              className="!h-9 !min-h-9 !border-0 !bg-transparent !px-0 !shadow-none focus-visible:!ring-0"
              id="prompt-library-manager-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search saved prompts"
              type="search"
              value={query}
            />
          </label>
          <ScrollArea className="min-h-0">
            {managedEntries.length > 0 ? (
              <ul className="grid gap-1.5 pr-3">
                {managedEntries.map((entry) => (
                  <li
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-soft)] p-2.5"
                    key={entry.id}
                  >
                    {editingId === entry.id ? (
                      <ElizaInput
                        aria-label={`Rename ${entry.title}`}
                        className="!h-8 !min-h-8 !rounded-[var(--radius-xs)]"
                        maxLength={MAX_PROMPT_TITLE_LENGTH}
                        onBlur={finishRename}
                        onChange={(event) =>
                          setEditingTitle(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            finishRename();
                          } else if (event.key === "Escape") {
                            cancelRename();
                          }
                        }}
                        ref={renameRef}
                        value={editingTitle}
                      />
                    ) : (
                      <button
                        className="grid min-w-0 gap-1 border-0 bg-transparent p-0 text-left"
                        onClick={() => restore(entry)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <strong className="truncate text-[11px] font-semibold text-[var(--text)]">
                            {entry.title}
                          </strong>
                          <small className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--accent)]">
                            {entry.projectId ? "Project" : "General"}
                          </small>
                        </span>
                        <small className="truncate text-[length:var(--text-meta)] text-[var(--muted)]">
                          {entry.content}
                        </small>
                      </button>
                    )}
                    <span className="flex items-center gap-1">
                      <ElizaButton
                        aria-label={`Rename ${entry.title}`}
                        className="!min-h-7 !rounded-[var(--radius-xs)] px-2 text-[length:var(--text-meta)]"
                        onClick={() => beginRename(entry)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Rename
                      </ElizaButton>
                      <ElizaButton
                        aria-label={`Delete ${entry.title}`}
                        className="!min-h-7 !rounded-[var(--radius-xs)] px-2 text-[length:var(--text-meta)] text-[var(--bad)]"
                        onClick={() => remove(entry)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Delete
                      </ElizaButton>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] text-center text-[11px] text-[var(--muted)]">
                {entries.length
                  ? "No prompts match this search."
                  : "No saved prompts yet."}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
