import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { UiIcon } from "../components/UiIcon";
import type {
  DesktopAppearance,
  DesktopDensity,
  DesktopThemeProfile,
} from "../desktop-theme";
import {
  asRecord,
  asString,
  ErrorBlock,
  LoadingBlock,
  titleCase,
} from "../lib";
import {
  SETTINGS_APPEARANCE_BUTTON_CLASS,
  SETTINGS_APPEARANCE_CLASS,
  SETTINGS_GROUP_CLASS,
  SETTINGS_INLINE_CHOICE_CLASS,
  SETTINGS_THEME_BUTTON_CLASS,
  SETTINGS_THEME_GRID_CLASS,
} from "./settings-layout";

export function SettingsAppearancePanel({
  active,
  activeTheme,
  appearance,
  density,
  onAppearanceChange,
  onDensityChange,
  onThemeExport,
  onThemeImport,
  onThemeChange,
  themes,
  themesLoading = false,
  themesError = "",
  themeMigrationError = "",
  onThemeReload,
  themeBusy = false,
  localThemeIds,
}: {
  active: boolean;
  activeTheme: DesktopThemeProfile | null;
  appearance: DesktopAppearance;
  density: DesktopDensity;
  onAppearanceChange: (appearance: DesktopAppearance) => void;
  onDensityChange: (density: DesktopDensity) => void;
  onThemeExport: () => void;
  onThemeImport: (file: File) => void;
  onThemeChange: (theme: string) => void;
  themes: unknown[];
  themesLoading?: boolean;
  themesError?: string;
  themeMigrationError?: string;
  onThemeReload?: () => void;
  themeBusy?: boolean;
  localThemeIds?: readonly string[];
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className={SETTINGS_GROUP_CLASS} aria-busy={themeBusy}>
      <div className="settings-group-heading">
        <h2>Appearance</h2>
      </div>
      <div className="dl-settings-preference-row">
        <div className="setting-copy">
          <strong>Color mode</strong>
          <small>Use light, dark, or match this device.</small>
        </div>
        <fieldset
          aria-label="Application appearance"
          className={SETTINGS_APPEARANCE_CLASS}
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
              className={`${SETTINGS_APPEARANCE_BUTTON_CLASS} ${
                appearance === option ? "selected" : ""
              }`}
              key={option}
              disabled={themeBusy}
              onClick={() => onAppearanceChange(option)}
              title={
                option === "system"
                  ? "Match this device"
                  : `${titleCase(option)} surfaces`
              }
              type="button"
            >
              <UiIcon
                icon={
                  option === "dark" ? Moon : option === "light" ? Sun : Monitor
                }
                size="md"
              />
              <strong>{titleCase(option)}</strong>
            </button>
          ))}
        </fieldset>
      </div>
      <div className={SETTINGS_INLINE_CHOICE_CLASS}>
        <div className="setting-copy">
          <strong>Interface density</strong>
          <small>Spacing across pages, tables, and panels.</small>
        </div>
        <fieldset
          aria-label="Interface density"
          className="dl-settings-choices"
        >
          <legend className="sr-only">Interface density</legend>
          {(["comfortable", "compact"] as const).map((option) => (
            <button
              aria-pressed={density === option}
              className={`dl-settings-choice ${density === option ? "selected" : ""}`}
              key={option}
              disabled={themeBusy}
              onClick={() => onDensityChange(option)}
              type="button"
            >
              {titleCase(option)}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="settings-theme-transfer dl-settings-theme-heading">
        <div className="setting-copy">
          <strong>Interface theme</strong>
          <small id="settings-theme-file-description">
            Colors, typography, spacing, geometry, motion, and layouts. Imported
            files cannot run CSS or scripts.
          </small>
        </div>
        <div className="dl-settings-theme-actions">
          <button
            className="secondary-button"
            aria-describedby="settings-theme-file-description"
            onClick={() => importInputRef.current?.click()}
            disabled={themeBusy}
            type="button"
          >
            Import
          </button>
          <button
            className="secondary-button"
            aria-describedby="settings-theme-file-description"
            disabled={!activeTheme || themeBusy}
            onClick={onThemeExport}
            type="button"
          >
            Export
          </button>
          <input
            accept=".doolittle-theme.json,application/json"
            aria-label="Import Doolittle theme file"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onThemeImport(file);
              event.currentTarget.value = "";
            }}
            ref={importInputRef}
            tabIndex={-1}
            type="file"
          />
        </div>
      </div>
      {themeBusy ? (
        <p className="settings-status-note" role="status">
          Applying interface theme…
        </p>
      ) : null}
      {!active ? (
        <p
          className="m-0 text-sm leading-relaxed text-[var(--text-soft)]"
          role="status"
        >
          Runtime theme sync is unavailable until the local runtime is ready.
          Appearance, density, and local color themes remain available.
        </p>
      ) : null}
      {themeMigrationError ? (
        <p className="m-0 text-sm text-[var(--bad)]" role="alert">
          {themeMigrationError}
        </p>
      ) : null}
      {active && themesLoading ? (
        <LoadingBlock label="Loading runtime color themes…" />
      ) : null}
      {active && themesError ? (
        <ErrorBlock error={themesError} retry={onThemeReload} />
      ) : null}
      {active && !themesLoading && !themesError && themes.length === 0 ? (
        <p className="m-0 text-sm text-[var(--text-soft)]" role="status">
          No color themes are available yet. You can still import a local theme
          file.
        </p>
      ) : null}
      <div className={SETTINGS_THEME_GRID_CLASS}>
        {themes.map((value, index) => {
          const entry = asRecord(value);
          const name = asString(entry.id, asString(entry.name, String(index)));
          const colors = asRecord(entry.colors);
          const darkColors = asRecord(colors.dark);
          const primary = asString(
            entry.primary,
            asString(darkColors.accent, "var(--accent)"),
          );
          const secondary = asString(
            entry.secondary,
            asString(darkColors.accentHover, primary),
          );
          const label = asString(
            entry.label,
            asString(entry.name, titleCase(name)),
          );
          const tagline = asString(
            entry.tagline,
            asString(entry.description, "Desktop color system"),
          );
          return (
            <button
              aria-label={`${label}: ${tagline}`}
              aria-pressed={activeTheme?.name === name}
              className={`${SETTINGS_THEME_BUTTON_CLASS} ${
                activeTheme?.name === name ? "selected" : ""
              }`}
              key={name}
              disabled={
                themeBusy ||
                (!active &&
                  Boolean(localThemeIds) &&
                  !localThemeIds?.includes(name))
              }
              onClick={() => onThemeChange(name)}
              title={
                !active && localThemeIds && !localThemeIds.includes(name)
                  ? "Start the runtime to apply this theme"
                  : tagline
              }
              type="button"
            >
              <span
                aria-hidden="true"
                className="dl-theme-preview"
                style={{
                  background: asString(darkColors.background, "var(--bg)"),
                }}
              >
                <span
                  style={{
                    background: asString(
                      darkColors.navigation,
                      "var(--surface)",
                    ),
                  }}
                >
                  <i style={{ background: primary }} />
                  <i
                    style={{
                      background: asString(
                        darkColors.borderStrong,
                        "var(--border-strong)",
                      ),
                    }}
                  />
                  <i
                    style={{
                      background: asString(
                        darkColors.borderStrong,
                        "var(--border-strong)",
                      ),
                    }}
                  />
                </span>
                <span className="dl-theme-preview-chat">
                  <b
                    style={{
                      background: asString(
                        darkColors.secondaryText,
                        "var(--text-soft)",
                      ),
                    }}
                  />
                  <b
                    style={{
                      background: asString(
                        darkColors.mutedText,
                        "var(--muted)",
                      ),
                      width: "58%",
                    }}
                  />
                  <b style={{ background: secondary }} />
                </span>
              </span>
              <strong>{label}</strong>
              {activeTheme?.name === name ? (
                <UiIcon icon={Check} size="xs" />
              ) : null}
              <span className="dl-theme-description">{tagline}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
