export const SETTINGS_PAGE_CLASS = [
  "page page-settings !gap-1.5 [&>.page-header]:!min-h-12 [&>.page-header]:!pb-1.5",
  "[&_.settings-group-heading]:flex [&_.settings-group-heading]:items-center [&_.settings-group-heading]:justify-between [&_.settings-group-heading]:gap-2.5 [&_.settings-group-heading]:pb-0.25 [&_.settings-group-heading_h2]:m-0 [&_.settings-group-heading_h2]:text-sm [&_.settings-group-heading_p]:mt-0.75 [&_.settings-group-heading_p]:mb-0 [&_.settings-group-heading_p]:max-w-155 [&_.settings-group-heading_p]:text-[var(--muted)] [&_.settings-group-heading_p]:text-[length:var(--text-meta)] [&_.settings-group-heading_p]:leading-[1.45]",
  "[&_.settings-rows]:flex [&_.settings-rows]:flex-col [&_.settings-rows]:gap-0.25 [&_.settings-field-groups]:grid [&_.settings-field-groups]:gap-1",
  "[&_.settings-field-disclosure]:overflow-hidden [&_.settings-field-disclosure]:rounded-[var(--radius-xs)] [&_.settings-field-disclosure]:border [&_.settings-field-disclosure]:border-[var(--line-subtle)] [&_.settings-field-disclosure]:bg-[color-mix(in_srgb,var(--surface-soft)_68%,transparent)] [&_.settings-field-disclosure>summary]:flex [&_.settings-field-disclosure>summary]:min-h-10 [&_.settings-field-disclosure>summary]:cursor-pointer [&_.settings-field-disclosure>summary]:list-none [&_.settings-field-disclosure>summary]:items-center [&_.settings-field-disclosure>summary]:justify-between [&_.settings-field-disclosure>summary]:gap-3 [&_.settings-field-disclosure>summary]:px-2.25 [&_.settings-field-disclosure>summary]:py-1.5 [&_.settings-field-disclosure>summary::-webkit-details-marker]:hidden [&_.settings-field-disclosure>summary>span:first-child]:grid [&_.settings-field-disclosure>summary>span:first-child]:gap-0.25 [&_.settings-field-disclosure>summary_strong]:text-[length:var(--text-control)] [&_.settings-field-disclosure>summary_small]:text-[var(--muted)] [&_.settings-field-disclosure>summary_small]:text-[length:var(--text-meta)] [&_.settings-field-disclosure>summary>span:last-child]:font-[var(--font-mono)] [&_.settings-field-disclosure>summary>span:last-child]:text-[var(--muted)] [&_.settings-field-disclosure>summary>span:last-child]:text-[length:var(--text-meta)] [&_.settings-field-disclosure>summary>span:last-child]:tracking-[0.06em] [&_.settings-field-disclosure>summary>span:last-child]:uppercase [&_.settings-field-disclosure[open]>summary]:border-[var(--line-subtle)] [&_.settings-field-disclosure[open]>summary]:border-b [&_.settings-field-disclosure[open]>summary]:bg-[var(--surface-hover)] [&_.settings-field-disclosure>.settings-rows]:px-2.25",
  "[&_.setting-copy]:flex [&_.setting-copy]:min-w-0 [&_.setting-copy]:flex-col [&_.setting-copy]:gap-0.5 [&_.setting-copy_strong]:text-[length:var(--text-meta)] [&_.setting-copy_small]:text-[var(--text-soft)] [&_.setting-copy_small]:text-[length:var(--text-meta)] [&_.setting-copy_small]:leading-[1.4] [&_.setting-copy_code]:truncate [&_.setting-copy_code]:text-[var(--muted)] [&_.setting-copy_code]:text-[length:var(--text-meta)]",
  "[&_.setting-control]:grid [&_.setting-control]:grid-cols-[minmax(0,1fr)_auto] [&_.setting-control]:items-start [&_.setting-control]:gap-1.75 [&_.field-error]:col-start-2 [&_.field-error]:text-[var(--bad)] [&_.field-error]:text-[length:var(--text-meta)]",
  "[&_.settings-model-section]:flex [&_.settings-model-section]:min-w-0 [&_.settings-model-section]:flex-col [&_.settings-model-section]:gap-2 [&_.settings-section-header]:flex [&_.settings-section-header]:min-h-8.5 [&_.settings-section-header]:items-start [&_.settings-section-header]:justify-between [&_.settings-section-header]:gap-3 [&_.settings-section-header]:pb-0.5 [&_.settings-section-header_h2]:mt-0.5 [&_.settings-section-header_h2]:mb-0.25 [&_.settings-section-header_h2]:font-[var(--font-display)] [&_.settings-section-header_h2]:text-sm [&_.settings-section-header_h2]:font-semibold [&_.settings-section-header_h2]:tracking-[-0.015em] [&_.settings-section-header_p]:m-0 [&_.settings-section-header_p]:text-[var(--muted)] [&_.settings-section-header_p]:text-[length:var(--text-meta)] [&_.settings-section-header_p]:leading-[var(--line-meta)]",
].join(" ");

export const SETTINGS_LAYOUT_CLASS =
  "settings-layout grid min-h-0 flex-1 content-start items-start grid-cols-[212px_minmax(0,1fr)] gap-4 max-[1180px]:grid-cols-1 max-[1180px]:gap-2.5";

export const SETTINGS_NAV_CLASS =
  "settings-nav sticky top-0 grid max-h-full min-w-0 self-start content-start gap-2.5 overflow-auto pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] max-[1180px]:static max-[1180px]:flex max-[1180px]:max-h-none max-[1180px]:items-start max-[1180px]:gap-2 max-[1180px]:overflow-x-auto max-[1180px]:pr-0";

export const SETTINGS_NAV_SEARCH_CLASS =
  "settings-section-search block min-w-0 max-[1180px]:w-52 max-[1180px]:shrink-0 [&>input]:h-8 [&>input]:min-w-0 [&>input]:py-1.5";

export const SETTINGS_NAV_GROUP_CLASS =
  "settings-nav-group min-w-0 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:px-2 [&>summary]:py-1 [&>summary]:text-[length:var(--text-meta)] [&>summary]:font-semibold [&>summary]:text-[var(--muted)] [&>div]:grid [&>div]:content-start [&>div]:gap-0.5 max-[1180px]:shrink-0 max-[1180px]:[&>summary]:hidden max-[1180px]:[&:not([open])>div]:grid max-[1180px]:[&>div]:grid-flow-col max-[1180px]:[&>div]:auto-cols-max max-[1180px]:[&>div]:items-center max-[1180px]:[&>div]:gap-1";

export const SETTINGS_NAV_BUTTON_CLASS =
  "relative flex min-h-8 w-full min-w-0 items-center rounded-[var(--radius-xs)] border border-transparent px-2 py-1.25 text-left text-[var(--text-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] [&.selected]:border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] [&.selected]:bg-[var(--accent-soft)] [&.selected]:text-[var(--text)] [&.selected]:shadow-[inset_2px_0_var(--accent)] max-[1180px]:w-auto max-[1180px]:shrink-0 [&>strong]:truncate [&>strong]:text-[length:var(--text-meta)]";

export const SETTINGS_CONTENT_CLASS =
  "settings-content grid min-h-0 min-w-0 content-start self-start gap-2.5";

export const SETTINGS_CONTENT_HEADER_CLASS =
  "settings-content-header flex min-h-10 items-center justify-between gap-3 pb-1 [&_h2]:mt-0.25 [&_h2]:mb-0.5 [&_h2]:text-sm [&_p]:m-0 [&_p]:text-[length:var(--text-meta)] [&_p]:text-[var(--muted)]";

export const SETTINGS_GROUP_CLASS =
  "settings-group grid min-w-0 content-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[color-mix(in_srgb,var(--surface)_94%,var(--bg))] p-3";

export const SETTINGS_APPEARANCE_CLASS =
  "appearance-segmented grid grid-cols-3 gap-1.5 max-[620px]:grid-cols-1";

export const SETTINGS_APPEARANCE_BUTTON_CLASS =
  "grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-xs)] border border-[var(--line-subtle)] bg-[var(--surface-soft)] px-2.5 py-1.75 text-left text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] [&.selected]:border-[var(--accent-border)] [&.selected]:bg-[var(--accent-soft)] [&.selected]:text-[var(--text)] [&>svg]:mx-0.5 [&>svg]:text-[var(--muted)] [&.selected>svg]:text-[var(--accent)] [&>strong]:truncate [&>strong]:text-[length:var(--text-control)]";

export const SETTINGS_INLINE_CHOICE_CLASS =
  "settings-inline-choice mt-0 flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-xs)] bg-[var(--surface-soft)] px-2.5 py-1.75 max-[620px]:items-stretch max-[620px]:flex-col [&>div:first-child]:grid [&>div:first-child]:gap-0.5 [&>div:first-child_small]:text-[length:var(--text-meta)] [&>div:first-child_small]:text-[var(--muted)] max-[620px]:[&>fieldset]:w-full [&>fieldset]:flex [&>fieldset]:gap-0.5 [&>fieldset]:rounded-[var(--radius-xs)] [&>fieldset]:bg-[var(--bg)] [&>fieldset]:p-0.5 [&>fieldset_button]:min-h-7 [&>fieldset_button]:rounded-[var(--radius-xs)] [&>fieldset_button]:px-2 [&>fieldset_button]:py-0.75 [&>fieldset_button]:text-[length:var(--text-meta)] [&>fieldset_button]:text-[var(--text-soft)] [&>fieldset_button:hover]:bg-[var(--surface-hover)] [&>fieldset_button.selected]:bg-[var(--accent-soft)] [&>fieldset_button.selected]:text-[var(--text)] max-[620px]:[&>fieldset_button]:flex-1";

export const SETTINGS_THEME_GRID_CLASS =
  "theme-grid grid grid-cols-4 gap-1.5 max-[1280px]:grid-cols-3 max-[760px]:grid-cols-2 max-[480px]:grid-cols-1";

export const SETTINGS_THEME_BUTTON_CLASS =
  "grid min-h-11 grid-cols-[28px_minmax(0,1fr)_12px] items-center gap-2 rounded-[var(--radius-xs)] border border-[var(--line-subtle)] bg-[var(--surface-soft)] px-2 py-1.5 text-left text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] [&.selected]:border-[var(--accent-border)] [&.selected]:bg-[var(--accent-soft)] [&.selected]:text-[var(--text)] [&.selected>svg]:text-[var(--accent)] [&>strong]:truncate [&>strong]:text-[length:var(--text-meta)]";

export const SETTINGS_THEME_SIGNAL_CLASS =
  "theme-card-signal grid size-7 grid-cols-3 gap-0.5 rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,currentColor_14%,transparent)] p-1 [&>i]:h-2.5 [&>i]:w-1.25";

export const SETTINGS_ROW_LAYOUT_CLASS =
  "setting-row grid min-h-9 grid-cols-[minmax(160px,0.5fr)_minmax(240px,1fr)] gap-2.5 rounded-[var(--radius-xs)] px-0.75 py-1.5 max-[700px]:grid-cols-1";

export const SETTINGS_SWITCH_CLASS =
  "switch flex min-h-7 cursor-pointer items-center gap-2";

export const SETTINGS_SWITCH_INPUT_CLASS = "peer absolute h-px w-px opacity-0";

export const SETTINGS_SWITCH_TRACK_CLASS =
  "relative h-4.25 w-7.75 rounded-full border border-[var(--border-strong)] bg-[var(--surface-hover)] after:absolute after:top-0.5 after:left-0.5 after:size-2.75 after:rounded-full after:bg-[var(--muted)] after:transition-transform after:duration-150 after:content-[''] peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)] peer-checked:after:translate-x-3.5 peer-checked:after:bg-[var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]";

export const SETTINGS_SWITCH_LABEL_CLASS =
  "text-[var(--text-soft)] text-[length:var(--text-meta)]";

export const SETTINGS_EXECUTION_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-1";
