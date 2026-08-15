import { OfflineRouteState } from "../components/OfflineRouteState";
import type { DesktopAppearance, DesktopDensity } from "../desktop-theme";
import { asRecord, asString, Badge, titleCase } from "../lib";
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
  onThemeChange,
  themes,
}: {
  active: boolean;
  activeTheme?: string;
  appearance: DesktopAppearance;
  density: DesktopDensity;
  onAppearanceChange: (appearance: DesktopAppearance) => void;
  onDensityChange: (density: DesktopDensity) => void;
  onThemeChange: (theme: string) => void;
  themes: unknown[];
}) {
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
            className={`${SETTINGS_APPEARANCE_BUTTON_CLASS} ${
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
            <i aria-hidden="true">
              {option === "dark" ? "◐" : option === "light" ? "☼" : "◑"}
            </i>
            <strong>{titleCase(option)}</strong>
          </button>
        ))}
      </fieldset>
      <div className={SETTINGS_INLINE_CHOICE_CLASS}>
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
      <div className="settings-group-heading mt-1.75 mb-0 min-h-9.5 border-[var(--border)] border-b pb-1.75 [&_p]:mt-0.5 [&_p]:text-[var(--text-meta)]">
        <div>
          <span className="eyebrow">Color system</span>
          <h2>Operator signal</h2>
          <p>Shared across chat, code, review, workbench, and terminal.</p>
        </div>
        <Badge>
          {active ? titleCase(activeTheme ?? "orange") : "Unavailable"}
        </Badge>
      </div>
      {!active ? (
        <OfflineRouteState>
          Saved color themes are unavailable until the local runtime is ready.
          Appearance and density remain available locally.
        </OfflineRouteState>
      ) : null}
      <div className={SETTINGS_THEME_GRID_CLASS} hidden={!active}>
        {themes.map((value, index) => {
          const entry = asRecord(value);
          const name = asString(entry.name, String(index));
          const primary = asString(entry.primary, "#ff6a00");
          const secondary = asString(entry.secondary, primary);
          const label = asString(entry.label, titleCase(name));
          const tagline = asString(entry.tagline, "Desktop color system");
          return (
            <button
              aria-label={`${label}: ${tagline}`}
              className={`${SETTINGS_THEME_BUTTON_CLASS} ${
                activeTheme === name ? "selected" : ""
              }`}
              key={name}
              onClick={() => onThemeChange(name)}
              title={tagline}
              type="button"
            >
              <span
                className={SETTINGS_THEME_SIGNAL_CLASS}
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
              <b aria-hidden="true">{activeTheme === name ? "✓" : ""}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}
