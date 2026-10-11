import { NativeSelect } from "@doolittle/ui";
import { useEffect, useRef, useState } from "react";
import { Input, Textarea } from "../components/ElizaControls";
import { desktopRequest, EmptyBlock, errorMessage, titleCase } from "../lib";
import {
  SETTINGS_ROW_LAYOUT_CLASS,
  SETTINGS_SWITCH_CLASS,
  SETTINGS_SWITCH_INPUT_CLASS,
  SETTINGS_SWITCH_LABEL_CLASS,
  SETTINGS_SWITCH_TRACK_CLASS,
} from "./settings-layout";

export interface FlatSetting {
  path: string;
  value: unknown;
  category: string;
}

export interface SettingsFieldGroup {
  category: string;
  fields: FlatSetting[];
}

export function settingsCategoryLabel(category: string): string {
  if (category === "mcp") return "MCP";
  if (category === "ui") return "UI";
  return titleCase(category);
}

export function settingFieldLabel(path: string): string {
  const name = path.split(".").at(-1) ?? path;
  return titleCase(name.replace(/([\p{Ll}\d])(\p{Lu})/gu, "$1 $2"));
}

export function settingControlId(path: string): string {
  return `setting-${path.replace(/[^a-z0-9_-]/giu, "-")}`;
}

export function flattenSettings(
  value: unknown,
  prefix = "",
  output: FlatSetting[] = [],
): FlatSetting[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    output.push({
      path: prefix,
      value,
      category: prefix.split(".")[0] || "general",
    });
    return output;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flattenSettings(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

export function groupSettingsByCategory(
  fields: FlatSetting[],
): SettingsFieldGroup[] {
  const groups = new Map<string, FlatSetting[]>();
  for (const field of fields) {
    const group = groups.get(field.category);
    if (group) group.push(field);
    else groups.set(field.category, [field]);
  }
  return [...groups].map(([category, groupedFields]) => ({
    category,
    fields: groupedFields,
  }));
}

const selectOptions: Record<string, string[]> = {
  "model.provider": [
    "ollama",
    "elizacloud",
    "codex",
    "claude-code",
    "devin",
    "openai",
    "anthropic",
  ],
  "execution.backend": [
    "local",
    "docker",
    "ssh",
    "singularity",
    "daytona",
    "modal",
  ],
  "execution.remoteSyncMode": ["mirror", "upload", "none"],
  "execution.remoteArtifactPolicy": ["metadata-only", "download", "ignore"],
  "agent.runDepth": ["minimal", "standard", "deep"],
  "agent.toolProgressMode": ["off", "new", "all"],
};

const settingDescriptions: Record<string, string> = {
  "gateway.sessionTimeoutMinutes":
    "How long an inactive gateway session remains available.",
  "gateway.mirrorResponsesToHistory":
    "Keep gateway responses in the same durable conversation history.",
  "agent.runDepth":
    "Controls how much planning and verification the agent performs.",
  "agent.maxIterations":
    "Safety ceiling for model and tool cycles in one agent run.",
  "agent.toolProgressMode":
    "Choose how much live tool progress appears in the conversation.",
  "mcp.maxRetries":
    "Official Eliza retry ceiling for disconnected MCP servers.",
  "execution.backend":
    "Default environment used for shell commands and workspace tools.",
  "execution.remoteSyncMode":
    "How the active project is transferred to remote execution backends.",
  "execution.remoteArtifactPolicy":
    "What Doolittle retrieves after remote work completes.",
  "execution.commandTimeoutMs":
    "Maximum runtime for a single execution command.",
  "execution.healthTimeoutMs":
    "Maximum wait while checking an execution backend.",
  "execution.containerReadOnlyRoot":
    "Mount the container root filesystem read-only when supported.",
  "execution.sshStrictHostKeyChecking":
    "Reject SSH hosts whose key is missing or has changed.",
};

function settingDescription(field: FlatSetting): string {
  const exact = settingDescriptions[field.path];
  if (exact) return exact;
  if (field.path.endsWith("WorkspacePath"))
    return "Working directory used inside this execution environment.";
  if (field.path.endsWith("BootstrapCommand"))
    return "Command run when preparing this remote environment.";
  if (field.path.endsWith("StatusCommand"))
    return "Command used to verify that this environment is ready.";
  if (field.path.endsWith("InspectCommand"))
    return "Command used to collect diagnostic details.";
  if (field.path.endsWith("EnvPassthrough"))
    return "Environment variable names allowed into this backend.";
  if (Array.isArray(field.value))
    return "One entry per line. Empty lines are ignored.";
  return "Saved locally and applied by the Doolittle runtime.";
}

interface FieldSaveState {
  status: "saving" | "saved" | "error";
  value: string | boolean;
  initial: string | boolean;
  expected: string | boolean;
  error?: string;
}

function controlValue(value: unknown): string | boolean {
  return Array.isArray(value)
    ? value.join("\n")
    : typeof value === "boolean"
      ? value
      : String(value ?? "");
}

type SaveField = (
  field: FlatSetting,
  value: string | boolean,
  next: unknown,
  initial: string | boolean,
) => Promise<void>;

export function SettingControl({
  field,
  onSaved,
  readOnly = false,
  drafts,
  saveState,
  saveField,
  clearSaveError,
}: {
  field: FlatSetting;
  onSaved(field: FlatSetting): void;
  readOnly?: boolean;
  drafts?: Map<string, string | boolean>;
  saveState?: FieldSaveState;
  saveField?: SaveField;
  clearSaveError?: (path: string) => void;
}) {
  const initial = controlValue(field.value);
  const confirmed =
    saveState?.status === "saved" &&
    (saveState.initial === initial || saveState.value === initial)
      ? saveState.value
      : initial;
  const [value, setValue] = useState<string | boolean>(
    () => drafts?.get(field.path) ?? confirmed,
  );
  const [savedValue, setSavedValue] = useState<string | boolean>(confirmed);
  const [localBusy, setBusy] = useState(false);
  const [localError, setError] = useState("");
  const busy = localBusy || saveState?.status === "saving";
  const error =
    localError ||
    (saveState?.status === "error"
      ? (saveState.error ?? "This field could not be saved.")
      : "");
  const [saved, setSaved] = useState(false);
  const savedValueRef = useRef(confirmed);
  const initialValueRef = useRef(initial);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const options = selectOptions[field.path];
  const controlId = settingControlId(field.path);
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const statusId = `${controlId}-status`;
  const dirty = value !== savedValue;
  useEffect(() => {
    if (!dirty) drafts?.delete(field.path);
  }, [dirty, drafts, field.path]);
  const edit = (next: string | boolean) => {
    if (busy || inFlightRef.current || readOnly) return;
    setValue(next);
    setSaved(false);
    setError("");
    clearSaveError?.(field.path);
    if (next === savedValue) drafts?.delete(field.path);
    else drafts?.set(field.path, next);
  };

  useEffect(() => {
    // A refresh may update another field while this one has an unsaved draft.
    // Adopt server changes only when the user has not edited the saved value.
    if (initialValueRef.current === initial) return;
    initialValueRef.current = initial;
    const previous = savedValueRef.current;
    setValue((current) => (current === previous ? initial : current));
    savedValueRef.current = initial;
    setSavedValue(initial);
  }, [initial]);
  useEffect(() => {
    if (
      saveState?.status !== "saved" ||
      (saveState.initial !== initial && saveState.value !== initial)
    )
      return;
    savedValueRef.current = saveState.value;
    setSavedValue(saveState.value);
    setSaved(true);
  }, [saveState, initial]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const persist = async () => {
    if (inFlightRef.current || busy || readOnly || !dirty) return;
    setError("");
    let next: unknown = value;
    if (Array.isArray(field.value)) {
      next = String(value)
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (typeof field.value === "number") {
      if (String(value).trim() === "" || !Number.isFinite(Number(value))) {
        setError("Enter a valid number before saving.");
        return;
      }
      next = Number(value);
    }
    inFlightRef.current = true;
    if (saveField) {
      try {
        await saveField(field, value, next, initial);
      } finally {
        inFlightRef.current = false;
      }
      return;
    }
    setBusy(true);
    try {
      await desktopRequest("/settings", "POST", {
        path: field.path,
        value: next,
      });
      if (!mountedRef.current) return;
      savedValueRef.current = value;
      setSavedValue(value);
      if (drafts?.get(field.path) === value) drafts.delete(field.path);
      setSaved(true);
      onSaved(field);
    } catch (requestError) {
      if (mountedRef.current) setError(errorMessage(requestError));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <div className={SETTINGS_ROW_LAYOUT_CLASS} aria-busy={busy}>
      <div className="setting-copy">
        <strong>
          <label htmlFor={controlId} id={labelId}>
            {settingFieldLabel(field.path)}
          </label>
        </strong>
        <small id={descriptionId}>{settingDescription(field)}</small>
        <code>{field.path}</code>
      </div>
      <div className="setting-control">
        {typeof field.value === "boolean" ? (
          <label className={SETTINGS_SWITCH_CLASS} htmlFor={controlId}>
            <input
              aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
              aria-invalid={Boolean(error)}
              aria-labelledby={labelId}
              checked={Boolean(value)}
              className={SETTINGS_SWITCH_INPUT_CLASS}
              disabled={busy || readOnly}
              id={controlId}
              type="checkbox"
              onChange={(event) => edit(event.target.checked)}
            />
            <i className={SETTINGS_SWITCH_TRACK_CLASS} aria-hidden="true" />
            <span className={SETTINGS_SWITCH_LABEL_CLASS}>
              {value ? "On" : "Off"}
            </span>
          </label>
        ) : Array.isArray(field.value) ? (
          <Textarea
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(error)}
            className="min-w-0 text-sm"
            disabled={busy || readOnly}
            id={controlId}
            rows={Math.min(4, Math.max(2, field.value.length))}
            value={String(value)}
            onChange={(event) => edit(event.target.value)}
          />
        ) : options ? (
          <NativeSelect
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(error)}
            className="min-h-10 min-w-0 text-sm max-[760px]:min-h-11"
            disabled={busy || readOnly}
            id={controlId}
            value={String(value)}
            onChange={(event) => edit(event.target.value)}
          >
            {!options.includes(String(value)) ? (
              <option value={String(value)}>{String(value)}</option>
            ) : null}
            {options.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input
            aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
            aria-invalid={Boolean(error)}
            className="min-w-0 text-sm"
            disabled={busy || readOnly}
            id={controlId}
            type={typeof field.value === "number" ? "number" : "text"}
            step={typeof field.value === "number" ? "any" : undefined}
            value={String(value)}
            onChange={(event) => edit(event.target.value)}
          />
        )}
        <button
          className="secondary-button"
          disabled={busy || readOnly || !dirty}
          onClick={() => void persist()}
          type="button"
          aria-label={`Save ${settingFieldLabel(field.path)}`}
          aria-describedby={statusId}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {dirty && !readOnly ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setValue(savedValue);
              drafts?.delete(field.path);
              setError("");
              clearSaveError?.(field.path);
              setSaved(false);
            }}
            type="button"
            aria-label={`Discard changes to ${settingFieldLabel(field.path)}`}
          >
            Reset
          </button>
        ) : null}
      </div>
      <small className="settings-control-feedback" id={statusId} role="status">
        {readOnly
          ? "Read-only while the runtime is changing. Try again when it is ready."
          : busy
            ? "Saving this field…"
            : dirty
              ? "Unsaved change"
              : saved
                ? "Saved"
                : ""}
      </small>
      {error ? (
        <small className="field-error" id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

function AdvancedSettingsGroup({
  group,
  revealForSearch,
  onSaved,
  readOnly,
  drafts,
  saves,
  saveField,
  clearSaveError,
}: {
  group: SettingsFieldGroup;
  revealForSearch: boolean;
  onSaved(field: FlatSetting): void;
  readOnly: boolean;
  drafts: Map<string, string | boolean>;
  saves: Map<string, FieldSaveState>;
  saveField: SaveField;
  clearSaveError(path: string): void;
}) {
  const [open, setOpen] = useState(revealForSearch);
  useEffect(() => {
    if (revealForSearch) setOpen(true);
  }, [revealForSearch]);
  return (
    <details
      className="settings-field-disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <strong>{settingsCategoryLabel(group.category)}</strong>
          <small>{group.fields.length} runtime fields</small>
        </span>
        <span>{open ? "Hide" : "Edit"}</span>
      </summary>
      <div className="settings-rows">
        {group.fields.map((field) => (
          <SettingControl
            field={field}
            key={field.path}
            onSaved={onSaved}
            readOnly={readOnly}
            drafts={drafts}
            saveState={saves.get(field.path)}
            saveField={saveField}
            clearSaveError={clearSaveError}
          />
        ))}
      </div>
    </details>
  );
}

export function SettingsFieldCollection({
  fields,
  advanced,
  query,
  onReload,
  onSaved,
  readOnly = false,
}: {
  fields: FlatSetting[];
  advanced: boolean;
  query: string;
  onReload(): void;
  onSaved(field: FlatSetting): void;
  readOnly?: boolean;
}) {
  // Volatile drafts belong to this collection, not a filtered/re-grouped row.
  // They are never persisted and a successful save or explicit reset removes them.
  const drafts = useRef(new Map<string, string | boolean>());
  const saves = useRef(new Map<string, FieldSaveState>());
  const [saveRevision, setSaveRevision] = useState(0);
  const generation = useRef(0);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  useEffect(() => {
    generation.current += 1;
    return () => {
      generation.current += 1;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: completion revision must also check an acknowledgment that arrived before the POST reply.
  useEffect(() => {
    let retired = false;
    for (const field of fields) {
      const saved = saves.current.get(field.path);
      if (
        saved?.status === "saved" &&
        controlValue(field.value) === saved.expected
      ) {
        // The temporary confirmed-value override bridges only the first reload.
        // Once the host acknowledges it, future host values win, including a
        // legitimate return to the pre-save baseline.
        saves.current.delete(field.path);
        retired = true;
      }
    }
    if (retired) setSaveRevision((revision) => revision + 1);
  }, [fields, saveRevision]);
  const saveField: SaveField = async (field, value, next, initial) => {
    // The collection, not a filtered row instance, owns write admission and
    // completion. Reappearing rows observe the same pending write immediately.
    if (readOnly || saves.current.get(field.path)?.status === "saving") return;
    const owner = generation.current;
    const pending: FieldSaveState = {
      status: "saving",
      value,
      initial,
      expected: controlValue(next),
    };
    saves.current.set(field.path, pending);
    setSaveRevision((revision) => revision + 1);
    try {
      await desktopRequest("/settings", "POST", {
        path: field.path,
        value: next,
      });
    } catch (requestError) {
      if (
        owner !== generation.current ||
        saves.current.get(field.path) !== pending
      )
        return;
      saves.current.set(field.path, {
        ...pending,
        status: "error",
        error: errorMessage(requestError),
      });
      setSaveRevision((revision) => revision + 1);
      return;
    }
    if (
      owner !== generation.current ||
      saves.current.get(field.path) !== pending
    )
      return;
    // Never discard a newer draft just because an older submission completed.
    if (drafts.current.get(field.path) === value)
      drafts.current.delete(field.path);
    saves.current.set(field.path, { ...pending, status: "saved" });
    setSaveRevision((revision) => revision + 1);
    onSavedRef.current(field);
  };
  const clearSaveError = (path: string) => {
    if (saves.current.get(path)?.status !== "error") return;
    saves.current.delete(path);
    setSaveRevision((revision) => revision + 1);
  };
  if (!fields.length) {
    return (
      <EmptyBlock
        title={query ? "No settings match" : "No settings loaded"}
        actions={
          <button className="secondary-button" onClick={onReload} type="button">
            Reload settings
          </button>
        }
      >
        {query
          ? "Clear the search or choose another category."
          : "Restart the local runtime if configuration has not loaded, then try again."}
      </EmptyBlock>
    );
  }
  if (advanced) {
    const revealForSearch = Boolean(query.trim());
    return (
      <div className="settings-field-groups">
        {groupSettingsByCategory(fields).map((group) => (
          <AdvancedSettingsGroup
            group={group}
            key={group.category}
            onSaved={onSaved}
            readOnly={readOnly}
            drafts={drafts.current}
            saves={saves.current}
            saveField={saveField}
            clearSaveError={clearSaveError}
            revealForSearch={revealForSearch}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="settings-rows">
      {fields.map((field) => (
        <SettingControl
          field={field}
          key={field.path}
          onSaved={onSaved}
          readOnly={readOnly}
          drafts={drafts.current}
          saveState={saves.current.get(field.path)}
          saveField={saveField}
          clearSaveError={clearSaveError}
        />
      ))}
    </div>
  );
}
