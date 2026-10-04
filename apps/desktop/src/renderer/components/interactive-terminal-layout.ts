export const INTERACTIVE_TERMINAL_ROOT_CLASS =
  "@container/terminal grid h-full min-h-32 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--canvas-bg)] text-[var(--canvas-text-soft)]";

export const INTERACTIVE_TERMINAL_CHROME_CLASS =
  "min-w-0 border-[var(--canvas-border)] bg-[var(--surface-raised)] font-mono text-[length:var(--text-meta)] text-[var(--muted)]";

export const INTERACTIVE_TERMINAL_BUTTON_CLASS =
  "min-h-[var(--control-height)] min-w-[var(--control-height)] rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-1 font-mono text-[length:var(--text-control)] text-[var(--text-soft)] shadow-[var(--control-contact)] transition-[color,background-color,border-color] duration-150 motion-reduce:transition-none hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 max-[760px]:min-h-11 max-[760px]:min-w-11";

export const INTERACTIVE_TERMINAL_PRIMARY_BUTTON_CLASS =
  "min-h-[var(--control-height)] min-w-[var(--control-height)] rounded-[var(--radius-xs)] border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 font-extrabold font-mono text-[length:var(--text-control)] text-[var(--accent-ink)] shadow-[var(--control-contact)] transition-[background-color,border-color] duration-150 motion-reduce:transition-none hover:bg-[var(--accent-hover)] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 max-[760px]:min-h-11 max-[760px]:min-w-11";

export const INTERACTIVE_TERMINAL_ICON_BUTTON_CLASS =
  "inline-flex size-[var(--control-height)] min-h-[var(--control-height)] min-w-[var(--control-height)] shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] p-0 text-[var(--text-soft)] shadow-[var(--control-contact)] transition-[color,background-color,border-color] duration-150 motion-reduce:transition-none hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)] active:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 max-[760px]:size-11 max-[760px]:min-h-11 max-[760px]:min-w-11";
