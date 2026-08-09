import { type FormEvent, useId, useRef, useState } from "react";
import { useDialogFocus } from "./dialog-focus";
import {
  COLORS,
  defaultDraft,
  type ProjectDraft,
  type ProjectLike,
} from "./models";

export function ProjectEditor({
  project,
  onClose,
  onSubmit,
  saving,
}: {
  project?: ProjectLike;
  onClose: () => void;
  onSubmit: (draft: ProjectDraft) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(() => defaultDraft(project));
  const titleId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  useDialogFocus(true, dialogRef, firstInput, onClose);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
    });
  };
  return (
    <div className="project-editor-backdrop" role="presentation">
      <form
        className="project-editor"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow">
              {project ? "Project settings" : "New project"}
            </span>
            <h3 id={titleId}>
              {project ? `Edit ${project.name}` : "Create a project"}
            </h3>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close project editor"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </button>
        </header>
        <label>
          Name
          <input
            ref={firstInput}
            value={draft.name}
            onChange={(event) =>
              setDraft((value) => ({ ...value, name: event.target.value }))
            }
            placeholder="e.g. Doolittle Desktop"
            required
            maxLength={100}
          />
        </label>
        <label>
          Description <small>Optional, shown in the project switcher.</small>
          <input
            value={draft.description}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                description: event.target.value,
              }))
            }
            placeholder="What are you working on?"
            maxLength={280}
          />
        </label>
        <label>
          Project instructions{" "}
          <small>Shared context for every new chat in this project.</small>
          <textarea
            rows={5}
            value={draft.instructions}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                instructions: event.target.value,
              }))
            }
            placeholder="Goals, conventions, or things Doolittle should remember…"
            maxLength={4000}
          />
        </label>
        <fieldset>
          <legend>Accent</legend>
          <div className="project-editor__colors">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={draft.color === color ? "is-selected" : ""}
                style={{ background: color }}
                aria-label={`Use ${color} accent`}
                aria-pressed={draft.color === color}
                onClick={() => setDraft((value) => ({ ...value, color }))}
              />
            ))}
          </div>
        </fieldset>
        <footer>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={saving || !draft.name.trim()}
          >
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </button>
        </footer>
      </form>
    </div>
  );
}
