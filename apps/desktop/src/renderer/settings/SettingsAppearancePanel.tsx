import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useRef } from "react";
import { OfflineRouteState } from "../components/OfflineRouteState";
import { UiIcon } from "../components/UiIcon";
import type {
  DesktopAppearance,
  DesktopDensity,
  DesktopThemeProfile,
} from "../desktop-theme";
import {
  asRecord,
  asString,
  Badge,
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
  SETTINGS_THEME_SIGNAL_CLASS,
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
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <section className={SETTINGS_GROUP_CLASS}>
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
            className={`${SETTINGS_APPEARANCE_BUTTON_CLASS} !min-h-10 max-[760px]:!min-h-11 ${
              appearance === option ? "selected" : ""
            }`}
            key={option}
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
      <div
        className={`${SETTINGS_INLINE_CHOICE_CLASS} [&>fieldset_button]:!min-h-10 max-[760px]:[&>fieldset_button]:!min-h-11 [&>fieldset_button]:!text-sm`}
      >
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
              onClick={() => onDensityChange(option)}
              type="button"
            >
              {titleCase(option)}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="settings-group-heading mt-0.75 mb-0 min-h-8 [&_p]:mt-0.25 [&_p]:text-[length:var(--text-meta)]">
        <div>
          <span className="eyebrow">Color system</span>
          <h2>Interface theme</h2>
          <p>Shared across chat, code, review, workbench, and terminal.</p>
        </div>
        <Badge>
          {activeTheme?.label ?? (active ? "Default" : "Unavailable")}
        </Badge>
      </div>
      <div className="settings-theme-transfer flex min-h-9.5 items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface-soft)_64%,transparent)] px-2 py-1.5 max-[620px]:items-stretch max-[620px]:flex-col">
        <div className="grid min-w-0 gap-0.5">
          <strong className="text-[length:var(--text-control)]">
            Shareable theme file
          </strong>
          <small className="text-[length:var(--text-meta)] leading-[1.45] text-[var(--muted)]">
            Colors, typography, spacing, geometry, motion, and registered
            layouts. Imported files cannot run CSS or scripts.
          </small>
        </div>
        <div className="flex shrink-0 gap-1.25 max-[620px]:w-full [&>button]:min-h-10 max-[760px]:[&>button]:min-h-11 [&>button]:flex-1 [&>button]:px-2.25 [&>button]:text-sm">
          <button
            className="secondary-button"
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            Import
          </button>
          <button
            className="secondary-button"
            disabled={!activeTheme}
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
            type="file"
          />
        </div>
      </div>
      {!active ? (
        <OfflineRouteState>
          Saved color themes are unavailable until the local runtime is ready.
          Appearance and density remain available locally.
        </OfflineRouteState>
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
              className={`${SETTINGS_THEME_BUTTON_CLASS} !min-h-10 max-[760px]:!min-h-11 [&>strong]:!text-sm ${
                activeTheme?.name === name ? "selected" : ""
              }`}
              key={name}
              onClick={() => onThemeChange(name)}
              title={tagline}
              type="button"
            >
              <span
                className={SETTINGS_THEME_SIGNAL_CLASS}
                style={{
                  background: "var(--surface)",
                }}
              >
                <i style={{ background: primary }} />
                <i style={{ background: secondary }} />
                <i
                  style={{
                    background: asString(
                      entry.greenGlow,
                      asString(darkColors.success, "var(--good)"),
                    ),
                  }}
                />
              </span>
              <strong>{label}</strong>
              {activeTheme?.name === name ? (
                <UiIcon icon={Check} size="xs" />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
