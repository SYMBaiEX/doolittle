export const COMMAND_PALETTE_LOADING_BACKDROP_CLASS =
  "command-palette-loading-backdrop fixed inset-0 z-160 grid place-items-center bg-[color-mix(in_srgb,var(--shadow)_80%,transparent)] p-4";

export const COMMAND_PALETTE_LOADING_DISMISS_CLASS =
  "command-palette-loading-dismiss absolute inset-0 cursor-default border-0 bg-transparent";

export const COMMAND_PALETTE_LOADING_CLASS =
  "command-palette-loading relative z-1 w-[min(620px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,transparent)] shadow-[var(--shell-shadow-lg)] outline-none";

export const COMMAND_PALETTE_LOADING_HEADER_CLASS =
  "command-palette-loading__header grid min-h-10 grid-cols-[auto_1fr_auto] items-center gap-2 px-2.5 pt-2 pb-1 [&_h2]:m-0 [&_h2]:text-[11px] [&_h2]:font-semibold [&_h2]:text-[var(--text-soft)]";

export const COMMAND_PALETTE_LOADING_STATUS_CLASS =
  "command-palette-loading__status mx-2.5 mt-1.25 mb-2.5 flex min-h-16 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 text-[length:var(--text-sm)] text-[var(--muted)] [&_i]:size-2 [&_i]:shrink-0 [&_i]:animate-pulse [&_i]:rounded-full [&_i]:bg-[var(--accent)] [&_i]:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_10%,transparent)] motion-reduce:[&_i]:animate-none";

export const COMMAND_PALETTE_LOADING_MARK_CLASS =
  "command-palette__mark font-[var(--font-mono)] text-[13px] font-bold text-[var(--accent)]";

export const COMMAND_PALETTE_LOADING_CLOSE_CLASS =
  "command-palette__close h-6 min-w-0 rounded-[5px] border border-[var(--border)] bg-[var(--surface)] px-1.75 font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)] normal-case";
