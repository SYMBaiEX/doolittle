import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import { type FormEvent, useId, useRef, useState } from "react";
import { useDialogFocus } from "./dialog-focus";
import {
  PROJECT_EDITOR_BACKDROP_CLASS,
  PROJECT_EDITOR_CLASS,
  PROJECT_EDITOR_LABEL_CLASS,
} from "./layout";
import {
  COLORS,
  defaultDraft,
  type ProjectDraft,
  type ProjectLike,
  projectAccentColor,
  THEME_PROJECT_COLOR,
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
    <div className={PROJECT_EDITOR_BACKDROP_CLASS} role="presentation">
      <form
        className={PROJECT_EDITOR_CLASS}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        tabIndex={-1}
      >
        <header className="flex items-start justify-between">
          <div>
            <span className="eyebrow">
              {project ? "Project settings" : "New project"}
            </span>
            <h3
              className="mt-1 mb-0 font-[var(--font-display)] text-sm tracking-[-0.015em]"
              id={titleId}
            >
              {project ? `Edit ${project.name}` : "Create a project"}
            </h3>
          </div>
          <Button
            type="button"
            className="text-lg"
            size="icon-sm"
            variant="ghost"
            aria-label="Close project editor"
            onClick={onClose}
            disabled={saving}
          >
            ×
          </Button>
        </header>
        <label
          className={PROJECT_EDITOR_LABEL_CLASS}
          htmlFor={`${titleId}-name`}
        >
          Name
          <Input
            id={`${titleId}-name`}
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
        <label
          className={PROJECT_EDITOR_LABEL_CLASS}
          htmlFor={`${titleId}-description`}
        >
          Description <small>Optional, shown in the project switcher.</small>
          <Input
            id={`${titleId}-description`}
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
        <label
          className={PROJECT_EDITOR_LABEL_CLASS}
          htmlFor={`${titleId}-instructions`}
        >
          Project instructions{" "}
          <small>Shared context for every new chat in this project.</small>
          <Textarea
            id={`${titleId}-instructions`}
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
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.75 text-xs text-[var(--text-soft)]">
            Accent
          </legend>
          <div className="project-editor__colors flex flex-wrap gap-1.75">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`size-6 rounded-full border-2 border-transparent p-0 outline-offset-2 ${draft.color === color ? "is-selected border-[var(--text)] shadow-[0_0_0_2px_var(--surface-raised),0_0_0_3px_var(--accent)]" : ""}`}
                style={{ background: projectAccentColor(color) }}
                aria-label={
                  color === THEME_PROJECT_COLOR
                    ? "Follow desktop theme accent"
                    : `Use ${color} accent`
                }
                aria-pressed={draft.color === color}
                onClick={() => setDraft((value) => ({ ...value, color }))}
              />
            ))}
          </div>
        </fieldset>
        <footer className="flex items-start justify-end gap-2 border-[var(--border)] border-t pt-3.75">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !draft.name.trim()}>
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </Button>
        </footer>
      </form>
    </div>
  );
}
