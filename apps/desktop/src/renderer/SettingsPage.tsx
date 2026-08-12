import { Suspense, useEffect, useMemo, useState } from "react";
import type {
  DesktopLifecycleState,
  DesktopUpdateState,
  RuntimeStatus,
} from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
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
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import {
  type FlatSetting,
  flattenSettings,
  SettingsFieldCollection,
} from "./settings/SettingsFields";
import "./configuration-pages.css";
import { LazyModelsPage } from "./settings/lazy-panels";
import { SettingsNavigation } from "./settings/SettingsNavigation";

interface SettingsResponse {
  settings?: UnknownRecord;
}

interface ThemeResponse {
  active?: string;
  profile?: UnknownRecord;
  themes?: unknown[];
}

export interface SettingsResourcePolicy {
  settings: boolean;
  themes: boolean;
  desktop: boolean;
  execution: boolean;
  runtime: boolean;
}

/**
 * Keep the settings shell responsive by loading only data needed by the
 * selected category. The settings document remains available for category
 * construction; detail resources are activated as their panels become
 * visible.
 */
export function settingsResourcePolicy(
  category: string,
  active: boolean,
): SettingsResourcePolicy {
  return {
    settings: active,
    themes: active && category === "appearance",
    // Lifecycle and update controls belong to the Electron shell, so they
    // remain usable even when the local agent runtime is stopped.
    desktop: category === "desktop",
    execution: active && category === "execution",
    runtime: active && category === "model",
  };
}

export function settingsCategoryOffline(category: string, active: boolean) {
  return !active && !["appearance", "desktop"].includes(category);
}

export function SettingsPage({ active }: { active: boolean }) {
  const [category, setCategory] = useState("appearance");
  const resourcePolicy = settingsResourcePolicy(category, active);
  const settings = useApiResource<SettingsResponse>(
    resourcePolicy.settings ? "/settings" : null,
    [resourcePolicy.settings],
  );
  const themes = useApiResource<ThemeResponse>(
    resourcePolicy.themes ? "/theme" : null,
    [resourcePolicy.themes],
  );
  const execution = useApiResource<Record<string, unknown>>(
    resourcePolicy.execution ? "/execution/status" : null,
    [resourcePolicy.execution],
  );
  const runtime = useApiResource<RuntimeStatus>(
    resourcePolicy.runtime ? "/runtime/status" : null,
    [resourcePolicy.runtime],
  );
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
    if (!resourcePolicy.desktop) return;
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
  }, [resourcePolicy.desktop]);
  const fields = useMemo(
    () => flattenSettings(settings.data?.settings ?? {}),
    [settings.data],
  );
  const rawCategories = [...new Set(fields.map((field) => field.category))];
  const categories = [
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme and display",
    },
    {
      id: "desktop",
      label: "Desktop",
      description: "Updates and lifecycle",
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
      })),
    {
      id: "advanced",
      label: "Advanced",
      description: "Every runtime field",
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
  const categorySupportsSearch = !["appearance", "desktop", "model"].includes(
    category,
  );

  const changeTheme = async (theme: string) => {
    if (!active) return;
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

  const reloadSettings = () => {
    if (active) settings.reload();
  };
  const runtimeCategoryOffline = settingsCategoryOffline(category, active);

  return (
    <div className="page page-settings">
      <PageHeader
        eyebrow="Doolittle"
        title="Settings"
        description="Local preferences and runtime controls."
        actions={
          <button
            className="secondary-button"
            disabled={!active}
            onClick={reloadSettings}
            type="button"
          >
            Reload
          </button>
        }
      />
      {savedMessage ? <Notice>{savedMessage}</Notice> : null}
      {active && settings.loading ? (
        <LoadingBlock label="Loading runtime configuration…" />
      ) : active && settings.error ? (
        <ErrorBlock error={settings.error} retry={reloadSettings} />
      ) : (
        <div className="settings-layout">
          <SettingsNavigation
            categories={categories}
            category={category}
            onSelect={(id) => {
              setCategory(id);
              setQuery("");
            }}
          />
          <section className="settings-content">
            {runtimeCategoryOffline ? (
              <OfflineRouteState>
                Runtime configuration and execution controls are unavailable
                until the local runtime is ready.
              </OfflineRouteState>
            ) : null}
            {!runtimeCategoryOffline ? (
              <header className="settings-content-header">
                <div>
                  <span className="eyebrow">Configuration</span>
                  <h2>{activeCategory?.label ?? "Settings"}</h2>
                  <p>{activeCategory?.description}</p>
                </div>
                {categorySupportsSearch ? (
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
            {!runtimeCategoryOffline && category === "appearance" ? (
              <section className="settings-group">
                <fieldset
                  aria-label="Application appearance"
                  className="appearance-segmented"
                >
                  <legend className="sr-only">Application appearance</legend>
                  {(["dark", "light", "system"] as const).map((option) => (
                    <button
                      aria-label={`${titleCase(option)}: ${
                        option === "system"
                          ? "Match this device"
                          : `${titleCase(option)} surfaces`
                      }`}
                      aria-pressed={appearance === option}
                      className={appearance === option ? "selected" : ""}
                      key={option}
                      onClick={() => changeAppearance(option)}
                      title={
                        option === "system"
                          ? "Match this device"
                          : `${titleCase(option)} surfaces`
                      }
                      type="button"
                    >
                      <i aria-hidden="true">
                        {option === "dark"
                          ? "◐"
                          : option === "light"
                            ? "☼"
                            : "◑"}
                      </i>
                      <strong>{titleCase(option)}</strong>
                    </button>
                  ))}
                </fieldset>
                <div className="settings-inline-choice">
                  <div>
                    <strong>Interface density</strong>
                    <small>Spacing across pages, tables, and panels.</small>
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
                      Shared across chat, code, review, workbench, and terminal.
                    </p>
                  </div>
                  <Badge>
                    {active
                      ? titleCase(asString(themes.data?.active, "orange"))
                      : "Unavailable"}
                  </Badge>
                </div>
                {!active ? (
                  <OfflineRouteState>
                    Saved color themes are unavailable until the local runtime
                    is ready. Appearance and density remain available locally.
                  </OfflineRouteState>
                ) : null}
                <div className="theme-grid" hidden={!active}>
                  {asArray(themes.data?.themes).map((value, index) => {
                    const entry = asRecord(value);
                    const name = asString(entry.name, String(index));
                    const primary = asString(entry.primary, "#ff6a00");
                    const secondary = asString(entry.secondary, primary);
                    const label = asString(entry.label, titleCase(name));
                    const tagline = asString(
                      entry.tagline,
                      "Desktop color system",
                    );
                    return (
                      <button
                        aria-label={`${label}: ${tagline}`}
                        className={
                          themes.data?.active === name ? "selected" : ""
                        }
                        key={name}
                        onClick={() => void changeTheme(name)}
                        title={tagline}
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
                        <strong>{label}</strong>
                        <b aria-hidden="true">
                          {themes.data?.active === name ? "✓" : ""}
                        </b>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {!runtimeCategoryOffline && category === "model" ? (
              <Suspense
                fallback={<LoadingBlock label="Loading model settings…" />}
              >
                <LazyModelsPage
                  active={active}
                  embedded
                  refreshRuntime={() => {
                    runtime.reload();
                    settings.reload();
                  }}
                  runtime={runtime.data ?? null}
                />
              </Suspense>
            ) : null}
            {!runtimeCategoryOffline && category === "desktop" ? (
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
            {!["desktop", "appearance", "model"].includes(category) &&
            !runtimeCategoryOffline ? (
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
                <SettingsFieldCollection
                  advanced={category === "advanced"}
                  fields={visibleFields}
                  onReload={settings.reload}
                  onSaved={(field: FlatSetting) => {
                    setSavedMessage(`${field.path} saved.`);
                    settings.reload();
                    if (field.category === "execution") execution.reload();
                  }}
                  query={query}
                />
              </section>
            ) : null}
            {!runtimeCategoryOffline && category === "execution" ? (
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
