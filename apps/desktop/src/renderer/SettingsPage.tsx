import { useEffect, useMemo, useState } from "react";
import type {
  DesktopLifecycleState,
  DesktopUpdateState,
  RuntimeStatus,
} from "../shared/contracts";
import { ConnectionsPage } from "./ConnectionsPage";
import {
  announceAppearance,
  announceDensity,
  announceTheme,
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopTheme,
  type DesktopAppearance,
  type DesktopDensity,
  loadAppearancePreference,
  loadDensityPreference,
  parseDesktopThemeProfile,
} from "./desktop-theme";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import { ModelsPage } from "./ModelsPage";

interface SettingsResponse {
  settings?: UnknownRecord;
}

interface ThemeResponse {
  active?: string;
  profile?: UnknownRecord;
  themes?: unknown[];
}

interface FlatSetting {
  path: string;
  value: unknown;
  category: string;
}

function flattenSettings(
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
  for (const [key, child] of Object.entries(value as UnknownRecord)) {
    flattenSettings(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
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
  "mcp.serverCommand":
    "Command used to launch the local Model Context Protocol server.",
  "mcp.timeoutMs": "Maximum time to wait for an MCP operation.",
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

function SettingControl({
  field,
  saved,
}: {
  field: FlatSetting;
  saved: () => void;
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
      saved();
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

export function SettingsPage({ active }: { active: boolean }) {
  const settings = useApiResource<SettingsResponse>(
    active ? "/settings" : null,
    [active],
  );
  const themes = useApiResource<ThemeResponse>(active ? "/theme" : null, [
    active,
  ]);
  const execution = useApiResource<Record<string, unknown>>(
    active ? "/execution/status" : null,
    [active],
  );
  const runtime = useApiResource<RuntimeStatus>(
    active ? "/runtime/status" : null,
    [active],
  );
  const [category, setCategory] = useState("providers");
  const [query, setQuery] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [appearance, setAppearance] = useState<DesktopAppearance>(
    loadAppearancePreference,
  );
  const [density, setDensity] = useState<DesktopDensity>(loadDensityPreference);
  const [lifecycle, setLifecycle] = useState<DesktopLifecycleState | null>(
    null,
  );
  const [update, setUpdate] = useState<DesktopUpdateState | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    void window.doolittle
      .getLifecycleState()
      .then((state) => !disposed && setLifecycle(state));
    void window.doolittle
      .getUpdateState()
      .then((state) => !disposed && setUpdate(state));
    const unsubscribe = window.doolittle.onUpdateState((state) => {
      if (!disposed) setUpdate(state);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [active]);
  const fields = useMemo(
    () => flattenSettings(settings.data?.settings ?? {}),
    [settings.data],
  );
  const rawCategories = [...new Set(fields.map((field) => field.category))];
  const categories = [
    {
      id: "providers",
      label: "Providers",
      description: "Account sign in",
      count: 2,
    },
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme and display",
      count: fields.filter((field) => field.category === "ui").length,
    },
    {
      id: "desktop",
      label: "Desktop",
      description: "Updates and lifecycle",
      count: 2,
    },
    ...rawCategories
      .filter(
        (value) => !["ui", "providers", "desktop", "advanced"].includes(value),
      )
      .map((value) => ({
        id: value,
        label: value === "mcp" ? "MCP" : titleCase(value),
        description:
          value === "model"
            ? "Models and inference"
            : value === "execution"
              ? "Permissions and tools"
              : "Runtime preferences",
        count: fields.filter((field) => field.category === value).length,
      })),
    {
      id: "advanced",
      label: "Advanced",
      description: "Every runtime field",
      count: fields.length,
    },
  ];
  const fieldCategory =
    category === "appearance"
      ? "ui"
      : category === "advanced"
        ? "all"
        : category;
  const visibleFields = fields.filter((field) => {
    const normalized = query.trim().toLowerCase();
    return (
      (fieldCategory === "all" || field.category === fieldCategory) &&
      (fieldCategory === "all" || field.path !== "ui.theme") &&
      (!normalized || field.path.toLowerCase().includes(normalized))
    );
  });
  const activeCategory =
    categories.find((entry) => entry.id === category) ?? categories[0];

  const changeTheme = async (theme: string) => {
    try {
      const response = await desktopRequest<ThemeResponse>("/theme", "POST", {
        theme,
      });
      const profile = parseDesktopThemeProfile(response.profile);
      if (!profile) {
        throw new Error("The runtime did not return a valid theme profile.");
      }
      applyDesktopTheme(profile);
      announceTheme(profile);
      setSavedMessage(`${profile.label} is now active everywhere.`);
      themes.reload();
      settings.reload();
    } catch (error) {
      setSavedMessage(errorMessage(error));
    }
  };

  const changeAppearance = (next: DesktopAppearance) => {
    setAppearance(next);
    applyDesktopAppearance(next);
    announceAppearance(next);
    setSavedMessage(
      next === "system"
        ? "Appearance now follows your system."
        : `${titleCase(next)} appearance is now active.`,
    );
  };

  const changeDensity = (next: DesktopDensity) => {
    setDensity(next);
    applyDesktopDensity(next);
    announceDensity(next);
    setSavedMessage(`${titleCase(next)} interface density is now active.`);
  };

  return (
    <div className="page page-settings">
      <PageHeader
        eyebrow="Doolittle"
        title="Settings"
        description="Accounts, appearance, models, execution, and local desktop behavior—organized around what you want to change."
        actions={
          <button
            className="secondary-button"
            onClick={settings.reload}
            type="button"
          >
            Reload
          </button>
        }
      />
      {savedMessage ? <Notice>{savedMessage}</Notice> : null}
      {settings.loading ? (
        <LoadingBlock label="Loading runtime configuration…" />
      ) : settings.error ? (
        <ErrorBlock error={settings.error} retry={settings.reload} />
      ) : (
        <div className="settings-layout">
          <aside className="settings-nav" aria-label="Settings categories">
            <div className="settings-nav-title">
              <span>Settings</span>
              <small>Local</small>
            </div>
            {categories.map((entry) => (
              <button
                className={category === entry.id ? "selected" : ""}
                key={entry.id}
                onClick={() => {
                  setCategory(entry.id);
                  setQuery("");
                }}
                type="button"
              >
                <span>
                  <strong>{entry.label}</strong>
                  <small>{entry.description}</small>
                </span>
                <i>{entry.count}</i>
              </button>
            ))}
            <div className="settings-nav-note">
              <strong>Private by default</strong>
              <p>Account tokens and API keys never appear in this page.</p>
            </div>
          </aside>
          <section className="settings-content">
            {category !== "providers" ? (
              <header className="settings-content-header">
                <div>
                  <span className="eyebrow">Configuration</span>
                  <h2>{activeCategory?.label ?? "Settings"}</h2>
                  <p>{activeCategory?.description}</p>
                </div>
                {category !== "desktop" ? (
                  <label className="search-field settings-search">
                    <span className="sr-only">Search settings</span>
                    <input
                      placeholder={`Search ${activeCategory?.label.toLowerCase()}`}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                ) : null}
              </header>
            ) : null}
            {category === "providers" ? (
              <ConnectionsPage active={active} embedded />
            ) : null}
            {category === "appearance" || category === "advanced" ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">Appearance</span>
                    <h2>Light, dark & system</h2>
                  </div>
                </div>
                <fieldset
                  aria-label="Application appearance"
                  className="appearance-segmented"
                >
                  <legend className="sr-only">Application appearance</legend>
                  {(["dark", "light", "system"] as const).map((option) => (
                    <button
                      aria-pressed={appearance === option}
                      className={appearance === option ? "selected" : ""}
                      key={option}
                      onClick={() => changeAppearance(option)}
                      type="button"
                    >
                      <i aria-hidden="true">
                        {option === "dark"
                          ? "◐"
                          : option === "light"
                            ? "☼"
                            : "◑"}
                      </i>
                      <span>
                        <strong>{titleCase(option)}</strong>
                        <small>
                          {option === "system"
                            ? "Match this device"
                            : `${titleCase(option)} surfaces`}
                        </small>
                      </span>
                    </button>
                  ))}
                </fieldset>
                <div className="settings-inline-choice">
                  <div>
                    <strong>Interface density</strong>
                    <small>
                      Adjust the shared spacing used by pages, cards, lists,
                      tables, and management panels.
                    </small>
                  </div>
                  <fieldset aria-label="Interface density">
                    <legend className="sr-only">Interface density</legend>
                    {(["comfortable", "compact"] as const).map((option) => (
                      <button
                        aria-pressed={density === option}
                        className={density === option ? "selected" : ""}
                        key={option}
                        onClick={() => changeDensity(option)}
                        type="button"
                      >
                        {titleCase(option)}
                      </button>
                    ))}
                  </fieldset>
                </div>
                <div className="settings-group-heading theme-heading">
                  <div>
                    <span className="eyebrow">Color system</span>
                    <h2>Operator signal</h2>
                    <p>
                      The selected palette follows you through chat, code,
                      review, workbench, and the terminal.
                    </p>
                  </div>
                  <Badge>
                    {titleCase(asString(themes.data?.active, "orange"))}
                  </Badge>
                </div>
                <div className="theme-grid">
                  {asArray(themes.data?.themes).map((value, index) => {
                    const entry = asRecord(value);
                    const name = asString(entry.name, String(index));
                    const primary = asString(entry.primary, "#ff6a00");
                    const secondary = asString(entry.secondary, primary);
                    return (
                      <button
                        className={
                          themes.data?.active === name ? "selected" : ""
                        }
                        key={name}
                        onClick={() => void changeTheme(name)}
                        type="button"
                      >
                        <span
                          className="theme-card-signal"
                          style={{
                            background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                          }}
                        >
                          <i style={{ background: primary }} />
                          <i style={{ background: secondary }} />
                          <i
                            style={{
                              background: asString(entry.greenGlow, "#86b875"),
                            }}
                          />
                        </span>
                        <span>
                          <strong>
                            {asString(entry.label, titleCase(name))}
                          </strong>
                          <small>
                            {asString(entry.tagline, "Desktop color system")}
                          </small>
                        </span>
                        <b aria-hidden="true">
                          {themes.data?.active === name ? "✓" : ""}
                        </b>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {category === "model" ? (
              <ModelsPage
                active={active}
                embedded
                refreshRuntime={() => {
                  runtime.reload();
                  settings.reload();
                }}
                runtime={runtime.data ?? null}
              />
            ) : null}
            {category === "desktop" || category === "advanced" ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">Desktop</span>
                    <h2>Background & updates</h2>
                  </div>
                </div>
                <div className="settings-rows">
                  <div className="setting-row">
                    <div className="setting-copy">
                      <strong>Keep running in the background</strong>
                      <small>
                        When enabled, closing the window hides Doolittle so
                        active local work can continue. Quit always stops it.
                      </small>
                    </div>
                    <div className="setting-control">
                      <label className="switch">
                        <input
                          checked={lifecycle?.keepRunningInBackground ?? false}
                          disabled={!lifecycle}
                          type="checkbox"
                          onChange={(event) =>
                            void window.doolittle
                              .setKeepRunningInBackground(event.target.checked)
                              .then(setLifecycle)
                              .catch((error) =>
                                setSavedMessage(errorMessage(error)),
                              )
                          }
                        />
                        <i />
                        <span>
                          {lifecycle?.keepRunningInBackground ? "On" : "Off"}
                        </span>
                      </label>
                    </div>
                  </div>
                  <div className="setting-row">
                    <div className="setting-copy">
                      <strong>Application updates</strong>
                      <small>
                        {update?.message ?? "Loading update status…"}
                      </small>
                      {update?.progress !== undefined ? (
                        <small>{update.progress}% downloaded</small>
                      ) : null}
                    </div>
                    <div className="setting-control">
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          disabled={
                            updateBusy ||
                            update?.phase === "unavailable" ||
                            update?.phase === "checking" ||
                            update?.phase === "downloading"
                          }
                          onClick={() => {
                            setUpdateBusy(true);
                            void window.doolittle
                              .checkForUpdates()
                              .then(setUpdate)
                              .catch((error) =>
                                setUpdate({
                                  phase: "error",
                                  message: errorMessage(error),
                                }),
                              )
                              .finally(() => setUpdateBusy(false));
                          }}
                          type="button"
                        >
                          Check for updates
                        </button>
                        {update?.phase === "available" ? (
                          <button
                            className="secondary-button"
                            disabled={updateBusy}
                            onClick={() => {
                              setUpdateBusy(true);
                              void window.doolittle
                                .downloadUpdate()
                                .then(setUpdate)
                                .catch((error) =>
                                  setUpdate({
                                    phase: "error",
                                    message: errorMessage(error),
                                  }),
                                )
                                .finally(() => setUpdateBusy(false));
                            }}
                            type="button"
                          >
                            Download
                          </button>
                        ) : null}
                        {update?.phase === "downloaded" ? (
                          <button
                            className="primary-button"
                            onClick={() =>
                              void window.doolittle
                                .installUpdate()
                                .catch((error) =>
                                  setSavedMessage(errorMessage(error)),
                                )
                            }
                            type="button"
                          >
                            Install and restart
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {!["providers", "desktop", "appearance", "model"].includes(
              category,
            ) ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">{activeCategory?.label}</span>
                    <h2>
                      {category === "advanced"
                        ? "Complete configuration"
                        : `${activeCategory?.label} settings`}
                    </h2>
                  </div>
                  <Badge>{visibleFields.length} fields</Badge>
                </div>
                <div className="settings-rows">
                  {visibleFields.length ? (
                    visibleFields.map((field) => (
                      <SettingControl
                        field={field}
                        key={`${field.path}:${JSON.stringify(field.value)}`}
                        saved={() => {
                          setSavedMessage(`${field.path} saved.`);
                          settings.reload();
                          if (field.category === "execution")
                            execution.reload();
                        }}
                      />
                    ))
                  ) : (
                    <EmptyBlock
                      title={query ? "No settings match" : "No settings loaded"}
                      actions={
                        <button
                          className="secondary-button"
                          onClick={settings.reload}
                          type="button"
                        >
                          Reload settings
                        </button>
                      }
                    >
                      {query
                        ? "Clear the search or choose another category."
                        : "Restart the local runtime if configuration has not loaded, then try again."}
                    </EmptyBlock>
                  )}
                </div>
              </section>
            ) : null}
            {category === "execution" || category === "advanced" ? (
              <section className="settings-group">
                <div className="settings-group-heading">
                  <div>
                    <span className="eyebrow">Readiness</span>
                    <h2>Execution backends</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={execution.reload}
                    type="button"
                  >
                    Recheck
                  </button>
                </div>
                {execution.loading ? (
                  <LoadingBlock />
                ) : execution.error ? (
                  <ErrorBlock
                    error={execution.error}
                    retry={execution.reload}
                  />
                ) : (
                  <div className="stack-list">
                    {asArray(execution.data?.backends).map((value, index) => {
                      const backend = asRecord(value);
                      return (
                        <div
                          className="status-row"
                          key={asString(backend.backend, String(index))}
                        >
                          <div>
                            <strong>
                              {titleCase(asString(backend.backend, "Backend"))}
                            </strong>
                            <small>
                              {asString(backend.detail, "No health detail")}
                            </small>
                          </div>
                          <Badge tone={backend.ready ? "good" : "warn"}>
                            {backend.ready ? "Ready" : "Unavailable"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
