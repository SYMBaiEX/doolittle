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
import { DesktopSettingsPanel } from "./settings/DesktopSettingsPanel";
import { LazyModelsPage } from "./settings/lazy-panels";
import { SettingsAppearancePanel } from "./settings/SettingsAppearancePanel";
import { SettingsExecutionStatusPanel } from "./settings/SettingsExecutionStatusPanel";
import {
  type FlatSetting,
  flattenSettings,
  SettingsFieldCollection,
} from "./settings/SettingsFields";
import { SettingsNavigation } from "./settings/SettingsNavigation";
import {
  SETTINGS_CONTENT_CLASS,
  SETTINGS_CONTENT_HEADER_CLASS,
  SETTINGS_GROUP_CLASS,
  SETTINGS_LAYOUT_CLASS,
  SETTINGS_PAGE_CLASS,
} from "./settings/settings-layout";

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
  const updateLifecycleBackground = (enabled: boolean) => {
    void window.doolittle
      .setKeepRunningInBackground(enabled)
      .then(setLifecycle)
      .catch((error) => setSavedMessage(errorMessage(error)));
  };
  const checkForUpdates = () => {
    setUpdateBusy(true);
    void window.doolittle
      .checkForUpdates()
      .then(setUpdate)
      .catch((error) =>
        setUpdate({ phase: "error", message: errorMessage(error) }),
      )
      .finally(() => setUpdateBusy(false));
  };
  const downloadUpdate = () => {
    setUpdateBusy(true);
    void window.doolittle
      .downloadUpdate()
      .then(setUpdate)
      .catch((error) =>
        setUpdate({ phase: "error", message: errorMessage(error) }),
      )
      .finally(() => setUpdateBusy(false));
  };
  const installUpdate = () => {
    void window.doolittle
      .installUpdate()
      .catch((error) => setSavedMessage(errorMessage(error)));
  };
  const runtimeCategoryOffline = settingsCategoryOffline(category, active);

  return (
    <div className={SETTINGS_PAGE_CLASS}>
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
        <div className={SETTINGS_LAYOUT_CLASS}>
          <SettingsNavigation
            categories={categories}
            category={category}
            onSelect={(id) => {
              setCategory(id);
              setQuery("");
            }}
          />
          <section className={SETTINGS_CONTENT_CLASS}>
            {runtimeCategoryOffline ? (
              <OfflineRouteState>
                Runtime configuration and execution controls are unavailable
                until the local runtime is ready.
              </OfflineRouteState>
            ) : null}
            {!runtimeCategoryOffline ? (
              <header className={SETTINGS_CONTENT_HEADER_CLASS}>
                <div>
                  <span className="eyebrow">Configuration</span>
                  <h2>{activeCategory?.label ?? "Settings"}</h2>
                  <p>{activeCategory?.description}</p>
                </div>
                {categorySupportsSearch ? (
                  <label className="search-field settings-search max-w-80">
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
              <SettingsAppearancePanel
                active={active}
                activeTheme={asString(themes.data?.active, "orange")}
                appearance={appearance}
                density={density}
                onAppearanceChange={changeAppearance}
                onDensityChange={changeDensity}
                onThemeChange={(theme) => void changeTheme(theme)}
                themes={asArray(themes.data?.themes)}
              />
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
              <DesktopSettingsPanel
                lifecycle={lifecycle}
                onBackgroundChange={updateLifecycleBackground}
                onCheckUpdates={checkForUpdates}
                onDownloadUpdate={downloadUpdate}
                onInstallUpdate={installUpdate}
                update={update}
                updateBusy={updateBusy}
              />
            ) : null}
            {!["desktop", "appearance", "model"].includes(category) &&
            !runtimeCategoryOffline ? (
              <section className={SETTINGS_GROUP_CLASS}>
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
              <SettingsExecutionStatusPanel
                data={execution.data}
                error={execution.error}
                loading={execution.loading}
                onReload={execution.reload}
              />
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
