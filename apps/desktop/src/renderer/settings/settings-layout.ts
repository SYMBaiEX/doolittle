/** Settings uses the shared UI composition, with one token-driven form rhythm. */
export const SETTINGS_PAGE_CLASS = "page page-settings !min-h-0 !p-0 !gap-0";
export const SETTINGS_LAYOUT_CLASS = "settings-layout dl-settings-layout";
export const SETTINGS_NAV_CLASS = "settings-nav dl-settings-menu";
export const SETTINGS_NAV_SEARCH_CLASS =
  "settings-section-search dl-settings-menu-search";
export const SETTINGS_NAV_GROUP_CLASS =
  "settings-nav-group dl-settings-menu-group";
export const SETTINGS_NAV_BUTTON_CLASS = "dl-settings-menu-item";
export const SETTINGS_CONTENT_CLASS = "settings-content dl-settings-content";
export const SETTINGS_CONTENT_HEADER_CLASS =
  "settings-content-header dl-settings-page-heading";
export const SETTINGS_GROUP_CLASS =
  "settings-group grid min-w-0 content-start gap-5 py-4";
export const SETTINGS_APPEARANCE_CLASS =
  "appearance-segmented grid grid-cols-3 gap-2 max-[620px]:grid-cols-1";
export const SETTINGS_APPEARANCE_BUTTON_CLASS =
  "grid min-h-10 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] [&.selected]:border-[var(--accent-border)] [&.selected]:bg-[var(--accent-soft)] [&.selected]:text-[var(--text)] [&>svg]:text-[var(--muted)] [&.selected>svg]:text-[var(--accent-text)] max-[760px]:min-h-11";
export const SETTINGS_INLINE_CHOICE_CLASS =
  "settings-inline-choice flex min-h-10 flex-wrap items-center justify-between gap-3 py-3 [&>div:first-child]:grid [&>div:first-child]:gap-1 [&>div:first-child_small]:text-sm [&>div:first-child_small]:leading-relaxed [&>div:first-child_small]:text-[var(--muted)] [&>fieldset]:flex [&>fieldset]:gap-1 [&>fieldset_button]:min-h-10 [&>fieldset_button]:rounded-[var(--radius-sm)] [&>fieldset_button]:px-3 [&>fieldset_button]:text-sm [&>fieldset_button]:text-[var(--text-soft)] [&>fieldset_button:hover]:bg-[var(--surface-hover)] [&>fieldset_button.selected]:bg-[var(--surface-selected)] [&>fieldset_button.selected]:text-[var(--text)] max-[760px]:[&>fieldset_button]:min-h-11";
export const SETTINGS_THEME_GRID_CLASS =
  "theme-grid grid grid-cols-3 gap-2 max-[1280px]:grid-cols-2 max-[620px]:grid-cols-1";
export const SETTINGS_THEME_BUTTON_CLASS =
  "grid min-h-10 grid-cols-[24px_minmax(0,1fr)_16px] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text-soft)] hover:bg-[var(--surface-hover)] [&.selected]:border-[var(--accent-border)] [&.selected]:bg-[var(--accent-soft)] [&.selected]:text-[var(--text)] [&.selected>svg]:text-[var(--accent-text)] [&>strong]:truncate max-[760px]:min-h-11";
export const SETTINGS_THEME_SIGNAL_CLASS =
  "theme-card-signal grid size-6 grid-cols-3 gap-0.5 rounded-[var(--radius-xs)] border border-[var(--border)] p-1 [&>i]:h-2 [&>i]:w-1";
export const SETTINGS_ROW_LAYOUT_CLASS =
  "setting-row grid min-h-10 min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-6 border-b border-[var(--border)] py-4 last:border-b-0 max-[900px]:grid-cols-1 max-[900px]:gap-3";
export const SETTINGS_SWITCH_CLASS =
  "switch relative flex min-h-10 cursor-pointer items-center gap-2 max-[760px]:min-h-11";
export const SETTINGS_SWITCH_INPUT_CLASS =
  "peer absolute top-0 left-0 !h-px !w-px !border-0 !p-0 !m-0 opacity-0";
export const SETTINGS_SWITCH_TRACK_CLASS =
  "relative h-5 w-9 rounded-full border border-[var(--border-strong)] bg-[var(--surface-hover)] after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-[var(--muted)] after:transition-transform after:duration-150 after:content-[''] peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)] peer-checked:after:translate-x-4 peer-checked:after:bg-[var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] motion-reduce:after:transition-none";
export const SETTINGS_SWITCH_LABEL_CLASS = "text-sm text-[var(--text-soft)]";
export const SETTINGS_EXECUTION_GRID_CLASS = "grid min-w-0 gap-0";
