import { X } from "lucide-react";
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
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"general" | "project">(
    activeProject ? "project" : "general",
  );
  const [editingId, setEditingId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storage = browserStorage();
    if (storage) savePromptLibrary(storage, entries);
  }, [entries]);

  useEffect(() => {
    if (!activeProject) setScope("general");
  }, [activeProject]);

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
        className="secondary-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Prompts{visibleEntries.length > 0 ? ` · ${visibleEntries.length}` : ""}
      </button>
      {open ? (
        <section
          aria-label="Prompt library"
          className="chat-prompt-library"
          id="chat-prompt-library"
        >
          <header>
            <div className="chat-prompt-library__heading">
              <strong>Prompt library</strong>
              <small>
                {activeProject && scope === "project"
                  ? activeProject.name
                  : "General"}
              </small>
            </div>
            <button
              aria-label="Close prompt library"
              onClick={() => setOpen(false)}
              type="button"
            >
              <UiIcon icon={X} size="sm" />
            </button>
          </header>
          {activeProject ? (
            <fieldset
              aria-label="Prompt library scope"
              className="chat-prompt-library__scope"
            >
              <legend className="sr-only">Prompt library scope</legend>
              <button
                aria-pressed={scope === "project"}
                onClick={() => setScope("project")}
                type="button"
              >
                {activeProject.name}
              </button>
              <button
                aria-pressed={scope === "general"}
                onClick={() => setScope("general")}
                type="button"
              >
                General
              </button>
            </fieldset>
          ) : null}
          <div className="chat-prompt-library__save">
            <input
              aria-label="Saved prompt title"
              maxLength={MAX_PROMPT_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title (optional)"
              value={title}
            />
            <button
              disabled={!draft.trim()}
              onClick={saveCurrent}
              type="button"
            >
              Save draft
            </button>
          </div>
          {visibleEntries.length > 0 ? (
            <ul>
              {visibleEntries.map((entry) => (
                <li key={entry.id}>
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
                      className="chat-prompt-library__restore"
                      onClick={() => restore(entry)}
                      title={entry.content}
                      type="button"
                    >
                      <strong>{entry.title}</strong>
                      <small>{entry.content}</small>
                    </button>
                  )}
                  <span>
                    <button
                      aria-label={`Rename ${entry.title}`}
                      onClick={() => beginRename(entry)}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      aria-label={`Delete ${entry.title}`}
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
    </Fragment>
  );
}
