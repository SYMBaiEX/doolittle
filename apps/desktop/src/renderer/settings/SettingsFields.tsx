import { useEffect, useState } from "react";
import { desktopRequest, EmptyBlock, errorMessage, titleCase } from "../lib";

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

export function SettingControl({
  field,
  onSaved,
}: {
  field: FlatSetting;
  onSaved(field: FlatSetting): void;
}) {
  const initial = Array.isArray(field.value)
    ? field.value.join("\n")
    : typeof field.value === "boolean"
      ? field.value
      : String(field.value ?? "");
  const [value, setValue] = useState<string | boolean>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const options = selectOptions[field.path];

  const persist = async () => {
    setBusy(true);
    setError("");
    let next: unknown = value;
    if (Array.isArray(field.value)) {
      next = String(value)
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (typeof field.value === "number") {
      next = Number(value);
    }
    try {
      await desktopRequest("/settings", "POST", {
        path: field.path,
        value: next,
      });
      onSaved(field);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setting-row">
      <div className="setting-copy">
        <strong>{titleCase(field.path.split(".").at(-1) ?? field.path)}</strong>
        <small>{settingDescription(field)}</small>
        <code>{field.path}</code>
      </div>
      <div className="setting-control">
        {typeof field.value === "boolean" ? (
          <label className="switch">
            <input
              checked={Boolean(value)}
              type="checkbox"
              onChange={(event) => setValue(event.target.checked)}
            />
            <i />
            <span>{value ? "On" : "Off"}</span>
          </label>
        ) : Array.isArray(field.value) ? (
          <textarea
            rows={Math.min(4, Math.max(2, field.value.length))}
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : options ? (
          <select
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
          >
            {!options.includes(String(value)) ? (
              <option value={String(value)}>{String(value)}</option>
            ) : null}
            {options.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={typeof field.value === "number" ? "number" : "text"}
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void persist()}
          type="button"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}

function AdvancedSettingsGroup({
  group,
  revealForSearch,
  onSaved,
}: {
  group: SettingsFieldGroup;
  revealForSearch: boolean;
  onSaved(field: FlatSetting): void;
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
      {open ? (
        <div className="settings-rows">
          {group.fields.map((field) => (
            <SettingControl
              field={field}
              key={`${field.path}:${JSON.stringify(field.value)}`}
              onSaved={onSaved}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}

export function SettingsFieldCollection({
  fields,
  advanced,
  query,
  onReload,
  onSaved,
}: {
  fields: FlatSetting[];
  advanced: boolean;
  query: string;
  onReload(): void;
  onSaved(field: FlatSetting): void;
}) {
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
          key={`${field.path}:${JSON.stringify(field.value)}`}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}
