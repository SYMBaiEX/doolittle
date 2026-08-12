import { OfflineRouteState } from "../components/OfflineRouteState";
import type { DesktopAppearance, DesktopDensity } from "../desktop-theme";
import { asRecord, asString, Badge, titleCase } from "../lib";

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
              onClick={() => onDensityChange(option)}
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
      <div className="theme-grid" hidden={!active}>
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
              className={activeTheme === name ? "selected" : ""}
              key={name}
              onClick={() => onThemeChange(name)}
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
              <b aria-hidden="true">{activeTheme === name ? "✓" : ""}</b>
            </button>
          );
        })}
      </div>
    </section>
  );
}
