export const INTERACTIVE_TERMINAL_ROOT_CLASS =
  "grid h-full min-h-60 grid-rows-[auto_minmax(120px,1fr)_auto] overflow-hidden bg-[var(--canvas-bg)] text-[var(--canvas-text-soft)]";

export const INTERACTIVE_TERMINAL_CHROME_CLASS =
  "min-w-0 border-[var(--canvas-border)] bg-[color-mix(in_srgb,var(--surface-raised)_86%,var(--canvas-bg))] font-mono text-[10px] text-[var(--muted)]";

export const INTERACTIVE_TERMINAL_BUTTON_CLASS =
  "min-h-6 rounded-[var(--radius-xs)] border border-[var(--border)] bg-transparent px-1.75 py-1 font-mono text-[length:var(--text-meta)] text-[var(--text-soft)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

export const INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS =
  "min-h-6 rounded-[var(--radius-xs)] border border-[var(--accent)] bg-[var(--accent)] px-1.75 py-1 font-extrabold font-mono text-[length:var(--text-meta)] text-[var(--accent-ink)] uppercase tracking-[0.05em] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50";

export const INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS =
  "min-h-6.5 min-w-6.5 shrink-0 rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--border)_52%,transparent)] bg-[color-mix(in_srgb,var(--surface-soft)_78%,transparent)] p-0 text-[var(--text-soft)] hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)]";
