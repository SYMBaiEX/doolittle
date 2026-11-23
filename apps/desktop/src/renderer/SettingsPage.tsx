import { SettingsFrame, SettingsTabs } from "@doolittle/ui";
import { BUILT_IN_THEMES } from "@doolittle/ui/themes";
import { RefreshCw, Settings2 } from "lucide-react";
import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import type { RuntimeStatus } from "../shared/contracts";
import { OfflineRouteState } from "./components/OfflineRouteState";
import {
  WorkbenchAction,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import type { DesktopNavigationIntent } from "./desktop-navigation-intent";
import {
  APPEARANCE_APPLIED_EVENT,
  announceAppearance,
  announceDensity,
  announceTheme,
  applyDesktopAppearance,
  applyDesktopDensity,
  applyDesktopTheme,
  applyThemeManifest,
  type DesktopAppearance,
  type DesktopDensity,
  getThemeMigrationError,
  legacyThemeProfile,
  loadAppearancePreference,
  loadDensityPreference,
  loadDesktopThemeSource,
  loadStoredDesktopTheme,
  loadStoredThemeManifest,
  parseDesktopThemeProfile,
  subscribeToDesktopThemeChanges,
} from "./desktop-theme";
import {
  DESKTOP_THEME_IMPORT_MAX_BYTES,
  downloadDesktopThemeBundle,
  parseDesktopThemeBundle,
} from "./desktop-theme-transfer";
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
  titleCase,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import { DesktopSettingsPanel } from "./settings/DesktopSettingsPanel";
import {
  isEmbeddedSettingsFeature,
  settingsPanels,
} from "./settings/lazy-panels";
import { SettingsAppearancePanel } from "./settings/SettingsAppearancePanel";
import { SettingsExecutionStatusPanel } from "./settings/SettingsExecutionStatusPanel";
import {
  type FlatSetting,
  flattenSettings,
  SettingsFieldCollection,
} from "./settings/SettingsFields";
import { SettingsNavigation } from "./settings/SettingsNavigation";
import {
  SETTINGS_CONTENT_HEADER_CLASS,
  SETTINGS_PAGE_CLASS,
} from "./settings/settings-layout";
import {
  DESKTOP_SETTINGS_LANDING_EVENT,
  SETTINGS_CATEGORIES,
  SETTINGS_SHELL_SECTIONS,
  type SettingsCategoryId,
  type SettingsShellSection,
  settingsCategoryForSection,
  settingsTabsForCategory,
} from "./settings/settings-sections";
import type { SettingsResponse } from "./settings/settings-types";
import { useDesktopPreferences } from "./settings/use-desktop-preferences";
import "./settings/settings-workbench.css";

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
}

/**
 * Keep the settings shell responsive by loading only data needed by the
 * selected category. The static menu and local preferences remain available
 * while native configuration loads; embedded feature panels own their detail
 * resources.
 */
export function settingsResourcePolicy(
  category: string,
  active: boolean,
): SettingsResourcePolicy {
  return {
    // Embedded feature pages own their resources. The shell only reads the
    // settings document for execution and advanced runtime fields. General
    // preferences are local/native; do not offer a no-op runtime Reload there.
    settings:
      active &&
      !isEmbeddedSettingsFeature(category) &&
      !settingsPreferencesVisible(category),
    themes: active && settingsPreferencesVisible(category),
    // Lifecycle and update controls belong to the Electron shell, so they
    // remain usable even when the local agent runtime is stopped.
    desktop: settingsPreferencesVisible(category),
    execution: active && category === "execution",
  };
}

export function settingsPreferencesVisible(section: string) {
  return section === "appearance" || section === "desktop";
}

export function settingsCategoryOffline(category: string, active: boolean) {
  return !active && !["appearance", "desktop", "interfaces"].includes(category);
}

export function SettingsPage({
  active,
  section: category,
  onSectionChange,
  writesAllowed = active,
  runtime,
  runtimeLogIntent,
  onConsumeNavigationIntent,
  refreshRuntime,
}: {
  active: boolean;
  section: SettingsShellSection;
  onSectionChange: (section: SettingsShellSection) => void;
  writesAllowed?: boolean;
  runtime?: RuntimeStatus | null;
  runtimeLogIntent?: Extract<
    DesktopNavigationIntent,
    { kind: "runtime-log" }
  > | null;
  onConsumeNavigationIntent?: (id: string) => void;
  refreshRuntime?: () => void;
}) {
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const desktopPanelRef = useRef<HTMLElement>(null);
  const selections = useRef<
    Partial<Record<SettingsCategoryId, SettingsShellSection>>
  >({});
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
  const [query, setQuery] = useState("");
  const [sectionQuery, setSectionQuery] = useState("");
  const [preferenceFeedback, setPreferenceFeedback] = useState<{
    message: string;
    kind: "status" | "error";
  } | null>(null);
  const [savedField, setSavedField] = useState<{
    section: string;
    path: string;
  } | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const themeInFlightRef = useRef(false);
  const [appearance, setAppearance] = useState<DesktopAppearance>(
    loadAppearancePreference,
  );
  const [density, setDensity] = useState<DesktopDensity>(loadDensityPreference);
  const [activeThemeProfile, setActiveThemeProfile] = useState(
    loadStoredDesktopTheme,
  );
  const [themeMigrationError] = useState(getThemeMigrationError);
  const desktopPreferences = useDesktopPreferences(resourcePolicy.desktop);
  useEffect(() => {
    const syncAppliedAppearance = () =>
      setAppearance(loadAppearancePreference());
    const unsubscribe = subscribeToDesktopThemeChanges({
      onAppearance: setAppearance,
      onDensity: setDensity,
      onTheme: setActiveThemeProfile,
    });
    // The shell toggle applies its preference directly. Read the stored
    // preference, not the resolved appearance, so System remains selected.
    window.addEventListener(APPEARANCE_APPLIED_EVENT, syncAppliedAppearance);
    return () => {
      unsubscribe();
      window.removeEventListener(
        APPEARANCE_APPLIED_EVENT,
        syncAppliedAppearance,
      );
    };
  }, []);
  useEffect(() => {
    setQuery("");
    selections.current[settingsCategoryForSection(category).id] = category;
    const content = panelRef.current?.parentElement;
    if (content) content.scrollTop = 0;
    if (category === "desktop") {
      let landing: number;
      const landOnDesktop = () => {
        window.clearTimeout(landing);
        // Let the command palette release its focus trap first.
        landing = window.setTimeout(() => {
          const target = desktopPanelRef.current;
          target?.focus({ preventScroll: true });
          if (content && target) {
            const tabs = content.querySelector<HTMLElement>('[role="tablist"]');
            const tabsOffset = tabs
              ? tabs.getBoundingClientRect().height +
                (Number.parseFloat(window.getComputedStyle(tabs).top) || 0) +
                (Number.parseFloat(
                  window.getComputedStyle(content).paddingTop,
                ) || 0)
              : 0;
            // Scroll only Settings, keeping its sticky tabs above the target.
            // scrollIntoView would also move the outer app at minimum sizes.
            content.scrollTop +=
              target.getBoundingClientRect().top -
              content.getBoundingClientRect().top -
              tabsOffset;
          }
        }, 0);
      };
      landOnDesktop();
      window.addEventListener(DESKTOP_SETTINGS_LANDING_EVENT, landOnDesktop);
      return () => {
        window.clearTimeout(landing);
        window.removeEventListener(
          DESKTOP_SETTINGS_LANDING_EVENT,
          landOnDesktop,
        );
      };
    }
  }, [category]);
  useEffect(() => {
    if (["imported", "builtin"].includes(loadDesktopThemeSource() ?? ""))
      return;
    const profile = parseDesktopThemeProfile(themes.data?.profile);
    if (profile) setActiveThemeProfile(profile);
  }, [themes.data?.profile]);
  const fields = useMemo(
    () => flattenSettings(settings.data?.settings ?? {}),
    [settings.data],
  );
  // All runtime fields stay accessible in Advanced, without changing the menu
  // when a resource loads or unloads during navigation.
  const categories = SETTINGS_CATEGORIES;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFields = fields.filter(
    (field) =>
      (category === "advanced" || field.category === category) &&
      (!normalizedQuery || field.path.toLowerCase().includes(normalizedQuery)),
  );
  const activeCategory = settingsCategoryForSection(category);
  const activeSection = SETTINGS_SHELL_SECTIONS.find(
    (entry) => entry.id === category,
  );
  const tabs = settingsTabsForCategory(activeCategory);
  const tabValue = category === "desktop" ? "appearance" : category;
  const panelAccessibility =
    tabs.length > 1
      ? {
          role: "tabpanel" as const,
          "aria-labelledby": `${panelId}-tab-${tabValue}`,
          tabIndex: 0,
        }
      : { role: "region" as const, "aria-label": activeCategory.label };
  const selectSection = (id: string) => {
    const nextSection = SETTINGS_SHELL_SECTIONS.find(
      (section) => section.id === id,
    );
    if (!nextSection) return;
    onSectionChange(nextSection.id);
  };
  const showPreferences = settingsPreferencesVisible(category);

  const changeTheme = async (theme: string) => {
    if (themeInFlightRef.current) return;
    const builtIn = BUILT_IN_THEMES.find((candidate) => candidate.id === theme);
    setPreferenceFeedback(null);
    if (builtIn) {
      applyThemeManifest(builtIn, "builtin");
      const profile = legacyThemeProfile(builtIn);
      setActiveThemeProfile(profile);
      announceTheme(profile);
      setPreferenceFeedback({
        kind: "status",
        message: `${builtIn.name} layout is now active.`,
      });
      return;
    }
    if (!active) return;
    themeInFlightRef.current = true;
    setThemeBusy(true);
    try {
      const response = await desktopRequest<ThemeResponse>("/theme", "POST", {
        theme,
      });
      const profile = parseDesktopThemeProfile(response.profile);
      if (!profile) {
        throw new Error("The runtime did not return a valid theme profile.");
      }
      applyDesktopTheme(profile, "runtime");
      setActiveThemeProfile(profile);
      announceTheme(profile);
      setPreferenceFeedback({
        kind: "status",
        message: `${profile.label} is now active.`,
      });
      themes.reload();
      settings.reload();
    } catch (error) {
      setPreferenceFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      themeInFlightRef.current = false;
      setThemeBusy(false);
    }
  };

  const changeAppearance = (next: DesktopAppearance) => {
    setPreferenceFeedback(null);
    setAppearance(next);
    applyDesktopAppearance(next);
    announceAppearance(next);
    setPreferenceFeedback({
      kind: "status",
      message:
        next === "system"
          ? "Appearance follows your system."
          : `${titleCase(next)} appearance is now active.`,
    });
  };

  const changeDensity = (next: DesktopDensity) => {
    setPreferenceFeedback(null);
    setDensity(next);
    applyDesktopDensity(next);
    announceDensity(next);
    setPreferenceFeedback({
      kind: "status",
      message: `${titleCase(next)} interface density is now active.`,
    });
  };

  const importTheme = async (file: File) => {
    if (themeInFlightRef.current) return;
    themeInFlightRef.current = true;
    setThemeBusy(true);
    setPreferenceFeedback(null);
    try {
      if (file.size > DESKTOP_THEME_IMPORT_MAX_BYTES)
        throw new Error("Theme files must be 64 KB or smaller.");
      const bundle = parseDesktopThemeBundle(await file.text());
      setAppearance(bundle.appearance);
      applyDesktopAppearance(bundle.appearance);
      announceAppearance(bundle.appearance);
      setDensity(bundle.density);
      applyDesktopDensity(bundle.density);
      announceDensity(bundle.density);
      applyThemeManifest(bundle.theme, "imported");
      const profile = legacyThemeProfile(bundle.theme);
      setActiveThemeProfile(profile);
      announceTheme(profile);
      setPreferenceFeedback({
        kind: "status",
        message: `${bundle.theme.name} was imported and applied.`,
      });
    } catch (error) {
      setPreferenceFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      themeInFlightRef.current = false;
      setThemeBusy(false);
    }
  };

  const exportTheme = () => {
    setPreferenceFeedback(null);
    const theme = loadStoredThemeManifest();
    try {
      downloadDesktopThemeBundle(theme, appearance, density);
      setPreferenceFeedback({
        kind: "status",
        message: `${theme.name} was exported.`,
      });
    } catch (error) {
      setPreferenceFeedback({ kind: "error", message: errorMessage(error) });
    }
  };

  const reloadSettings = () => {
    if (active) settings.reload();
  };
  const runtimeCategoryOffline = settingsCategoryOffline(category, active);
  const EmbeddedPanel =
    !runtimeCategoryOffline && isEmbeddedSettingsFeature(category)
      ? settingsPanels[category]
      : null;
  return (
    <SettingsFrame
      className={SETTINGS_PAGE_CLASS}
      data-settings-searching={Boolean(sectionQuery.trim())}
      navigation={
        <SettingsNavigation
          categories={categories}
          category={category}
          query={sectionQuery}
          onQueryChange={setSectionQuery}
          onSelect={selectSection}
          selections={selections.current}
        />
      }
    >
      <header className={SETTINGS_CONTENT_HEADER_CLASS}>
        <div>
          <h1>{activeCategory.label}</h1>
          <p>{activeCategory.description}</p>
        </div>
        {resourcePolicy.settings ? (
          <WorkbenchAction
            disabled={settings.loading}
            icon={RefreshCw}
            onClick={reloadSettings}
          >
            Reload
          </WorkbenchAction>
        ) : null}
      </header>
      {tabs.length > 1 ? (
        <SettingsTabs
          items={tabs}
          value={tabValue}
          onChange={selectSection}
          panelId={panelId}
          label="Settings subsections"
        />
      ) : null}
      <div
        {...panelAccessibility}
        className="settings-category-panel"
        id={panelId}
        ref={panelRef}
      >
        {showPreferences && preferenceFeedback ? (
          preferenceFeedback.kind === "error" ? (
            <ErrorBlock error={preferenceFeedback.message} />
          ) : (
            <Notice announce="status">{preferenceFeedback.message}</Notice>
          )
        ) : null}
        {runtimeCategoryOffline ? (
          <OfflineRouteState>
            Runtime configuration and execution controls are unavailable until
            the local runtime is ready.
          </OfflineRouteState>
        ) : null}
        {resourcePolicy.settings ? (
          <label className="search-field settings-search max-w-80">
            <span className="sr-only">Search settings</span>
            <input
              placeholder={`Search ${activeSection?.label.toLowerCase() ?? "settings"}`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {resourcePolicy.settings ? (
          settings.loading ? (
            <LoadingBlock label="Loading runtime configuration…" />
          ) : settings.error ? (
            <ErrorBlock error={settings.error} retry={reloadSettings} />
          ) : null
        ) : null}
        {showPreferences ? (
          <section
            aria-label="Desktop settings"
            className="settings-workbench-section outline-none"
            ref={desktopPanelRef}
            tabIndex={-1}
          >
            <DesktopSettingsPanel {...desktopPreferences} />
          </section>
        ) : null}
        {showPreferences ? (
          <SettingsAppearancePanel
            active={active}
            activeTheme={activeThemeProfile}
            themeMigrationError={themeMigrationError}
            themeBusy={themeBusy}
            localThemeIds={BUILT_IN_THEMES.map((theme) => theme.id)}
            appearance={appearance}
            density={density}
            onAppearanceChange={changeAppearance}
            onDensityChange={changeDensity}
            onThemeExport={exportTheme}
            onThemeImport={(file) => void importTheme(file)}
            onThemeChange={(theme) => void changeTheme(theme)}
            themes={[
              ...BUILT_IN_THEMES,
              ...asArray(themes.data?.themes).filter(
                (value) =>
                  !BUILT_IN_THEMES.some(
                    (theme) => theme.id === asString(asRecord(value).name),
                  ),
              ),
            ]}
            themesLoading={themes.loading}
            themesError={themes.error}
            onThemeReload={themes.reload}
          />
        ) : null}
        {EmbeddedPanel ? (
          <Suspense
            fallback={
              <LoadingBlock
                label={`Loading ${activeSection?.label.toLowerCase() ?? "settings"}…`}
              />
            }
          >
            <EmbeddedPanel
              active={active}
              runtimeLogIntent={runtimeLogIntent}
              onConsumeNavigationIntent={onConsumeNavigationIntent}
              onOpenProviders={() => selectSection("accounts")}
              readOnly={!writesAllowed}
              refreshRuntime={() => refreshRuntime?.()}
              runtime={runtime ?? null}
            />
          </Suspense>
        ) : null}
        {resourcePolicy.settings && !settings.loading && !settings.error ? (
          <WorkbenchSection
            actions={<Badge>{visibleFields.length} fields</Badge>}
            className="settings-workbench-section"
            icon={Settings2}
            title={category === "advanced" ? "All settings" : "Configuration"}
          >
            {savedField?.section === category ? (
              <Notice announce="status">{savedField.path} saved.</Notice>
            ) : null}
            <SettingsFieldCollection
              readOnly={!writesAllowed}
              advanced={category === "advanced"}
              fields={visibleFields}
              onReload={settings.reload}
              onSaved={(field: FlatSetting) => {
                setSavedField({ section: category, path: field.path });
                settings.reload();
                if (field.category === "execution") execution.reload();
              }}
              query={query}
            />
          </WorkbenchSection>
        ) : null}
        {!runtimeCategoryOffline && category === "execution" ? (
          <SettingsExecutionStatusPanel
            data={execution.data}
            error={execution.error}
            loading={execution.loading}
            onReload={execution.reload}
          />
        ) : null}
      </div>
    </SettingsFrame>
  );
}
