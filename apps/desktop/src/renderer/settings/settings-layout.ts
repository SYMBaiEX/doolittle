export const SETTINGS_PAGE_CLASS = [
  "page page-settings gap-2.5",
  "[&_.settings-group-heading]:flex [&_.settings-group-heading]:items-center [&_.settings-group-heading]:justify-between [&_.settings-group-heading]:gap-3 [&_.settings-group-heading]:border-[var(--border)] [&_.settings-group-heading]:border-b [&_.settings-group-heading]:pb-2 [&_.settings-group-heading_h2]:m-0 [&_.settings-group-heading_h2]:text-base [&_.settings-group-heading_p]:mt-1.25 [&_.settings-group-heading_p]:mb-0 [&_.settings-group-heading_p]:max-w-155 [&_.settings-group-heading_p]:text-[var(--muted)] [&_.settings-group-heading_p]:text-[var(--text-meta)] [&_.settings-group-heading_p]:leading-[1.5]",
  "[&_.settings-rows]:flex [&_.settings-rows]:flex-col [&_.settings-field-groups]:grid [&_.settings-field-groups]:gap-1.75",
  "[&_.settings-field-disclosure]:overflow-hidden [&_.settings-field-disclosure]:rounded-[var(--radius-xs)] [&_.settings-field-disclosure]:border [&_.settings-field-disclosure]:border-[var(--line-subtle)] [&_.settings-field-disclosure]:bg-[color-mix(in_srgb,var(--surface-soft)_68%,transparent)] [&_.settings-field-disclosure>summary]:flex [&_.settings-field-disclosure>summary]:min-h-12 [&_.settings-field-disclosure>summary]:cursor-pointer [&_.settings-field-disclosure>summary]:list-none [&_.settings-field-disclosure>summary]:items-center [&_.settings-field-disclosure>summary]:justify-between [&_.settings-field-disclosure>summary]:gap-3.5 [&_.settings-field-disclosure>summary]:px-2.75 [&_.settings-field-disclosure>summary]:py-2 [&_.settings-field-disclosure>summary::-webkit-details-marker]:hidden [&_.settings-field-disclosure>summary>span:first-child]:grid [&_.settings-field-disclosure>summary>span:first-child]:gap-0.5 [&_.settings-field-disclosure>summary_strong]:text-[var(--text-control)] [&_.settings-field-disclosure>summary_small]:text-[var(--muted)] [&_.settings-field-disclosure>summary_small]:text-[var(--text-meta)] [&_.settings-field-disclosure>summary>span:last-child]:font-[var(--font-mono)] [&_.settings-field-disclosure>summary>span:last-child]:text-[var(--muted)] [&_.settings-field-disclosure>summary>span:last-child]:text-[var(--text-meta)] [&_.settings-field-disclosure>summary>span:last-child]:tracking-[0.06em] [&_.settings-field-disclosure>summary>span:last-child]:uppercase [&_.settings-field-disclosure[open]>summary]:border-[var(--line-subtle)] [&_.settings-field-disclosure[open]>summary]:border-b [&_.settings-field-disclosure[open]>summary]:bg-[var(--surface-hover)] [&_.settings-field-disclosure>.settings-rows]:px-2.75",
  "[&_.setting-copy]:flex [&_.setting-copy]:min-w-0 [&_.setting-copy]:flex-col [&_.setting-copy]:gap-1.25 [&_.setting-copy_strong]:text-[var(--text-meta)] [&_.setting-copy_small]:text-[var(--text-soft)] [&_.setting-copy_small]:text-[var(--text-meta)] [&_.setting-copy_small]:leading-[1.45] [&_.setting-copy_code]:truncate [&_.setting-copy_code]:text-[var(--muted)] [&_.setting-copy_code]:text-[var(--text-meta)]",
  "[&_.setting-control]:grid [&_.setting-control]:grid-cols-[minmax(0,1fr)_auto] [&_.setting-control]:items-start [&_.setting-control]:gap-1.75 [&_.field-error]:col-start-2 [&_.field-error]:text-[var(--bad)] [&_.field-error]:text-[var(--text-meta)]",
  "[&_.settings-model-section]:flex [&_.settings-model-section]:min-w-0 [&_.settings-model-section]:flex-col [&_.settings-model-section]:gap-4 [&_.settings-section-header]:flex [&_.settings-section-header]:min-h-15 [&_.settings-section-header]:items-start [&_.settings-section-header]:justify-between [&_.settings-section-header]:gap-5 [&_.settings-section-header]:border-[var(--line-subtle)] [&_.settings-section-header]:border-b [&_.settings-section-header]:pt-0.75 [&_.settings-section-header]:pb-3 [&_.settings-section-header_h2]:mt-1.25 [&_.settings-section-header_h2]:mb-0.5 [&_.settings-section-header_h2]:font-[var(--font-display)] [&_.settings-section-header_h2]:text-xl [&_.settings-section-header_h2]:font-[650] [&_.settings-section-header_h2]:tracking-[-0.025em] [&_.settings-section-header_p]:m-0 [&_.settings-section-header_p]:text-[var(--muted)] [&_.settings-section-header_p]:text-[var(--text-meta)] [&_.settings-section-header_p]:leading-[1.5]",
].join(" ");

export const SETTINGS_LAYOUT_CLASS =
  "settings-layout grid min-h-0 flex-1 grid-cols-[156px_minmax(0,1fr)] gap-2.5 max-[980px]:grid-cols-1";

export const SETTINGS_NAV_CLASS =
  "settings-nav sticky top-0 grid max-h-full self-start overflow-auto p-0.75 [scrollbar-gutter:stable] max-[980px]:static max-[980px]:flex max-[980px]:max-h-none max-[980px]:flex-row max-[980px]:overflow-x-auto [scrollbar-width:thin]";

export const SETTINGS_NAV_BUTTON_CLASS =
  "relative min-h-7.25 px-1.75 py-1.25 pl-2.25 text-left max-[980px]:shrink-0 [&>strong]:truncate [&>strong]:text-[10px]";

export const SETTINGS_CONTENT_CLASS = "settings-content grid min-h-0 gap-1.75";

export const SETTINGS_CONTENT_HEADER_CLASS =
  "settings-content-header flex min-h-10.5 items-center justify-between gap-3 border-[var(--border)] border-b pt-0.25 pb-1.75 [&_h2]:mt-0.5 [&_h2]:mb-0 [&_h2]:text-base [&_p]:m-0 [&_p]:text-[9px] [&_p]:text-[var(--muted)]";

export const SETTINGS_GROUP_CLASS =
  "settings-group grid gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-subtle)] bg-[var(--surface)] px-2.5 py-2.25";

export const SETTINGS_APPEARANCE_CLASS =
  "appearance-segmented grid grid-cols-3 gap-1.25 max-[620px]:grid-cols-1";

export const SETTINGS_APPEARANCE_BUTTON_CLASS =
  "grid min-h-10.5 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.75 px-2.25 py-1.5 [&>i]:grid [&>i]:size-6.25 [&>i]:place-items-center [&>i]:text-xs [&>strong]:truncate [&>strong]:text-[10px]";

export const SETTINGS_INLINE_CHOICE_CLASS =
  "settings-inline-choice mt-0 flex min-h-10.5 items-center justify-between gap-4.5 px-2 py-1.5 max-[620px]:items-stretch max-[620px]:flex-col [&>div:first-child]:grid [&>div:first-child]:gap-0.25 [&>div:first-child_small]:text-[8px] [&>fieldset]:flex [&>fieldset]:p-0.5 max-[620px]:[&>fieldset]:w-full [&>fieldset_button]:min-h-6 [&>fieldset_button]:px-1.75 [&>fieldset_button]:py-0.75 max-[620px]:[&>fieldset_button]:flex-1";

export const SETTINGS_THEME_GRID_CLASS =
  "theme-grid grid grid-cols-[repeat(auto-fit,minmax(142px,1fr))] gap-1.25 max-[620px]:grid-cols-2";

export const SETTINGS_THEME_BUTTON_CLASS =
  "grid min-h-10.5 grid-cols-[28px_minmax(0,1fr)_12px] items-center gap-1.75 px-1.75 py-1.5 [&>strong]:truncate [&>strong]:text-[9px]";

export const SETTINGS_THEME_SIGNAL_CLASS =
  "theme-card-signal grid size-7 grid-cols-3 gap-0.5 p-1 [&>i]:h-2.25 [&>i]:w-1";

export const SETTINGS_ROW_LAYOUT_CLASS =
  "setting-row grid min-h-11.5 grid-cols-[minmax(160px,0.5fr)_minmax(240px,1fr)] gap-3.75 border-[var(--border)] border-b px-px py-3.25 last:border-b-0 max-[700px]:grid-cols-1";

export const SETTINGS_SWITCH_CLASS =
  "switch flex min-h-8 cursor-pointer items-center gap-2";

export const SETTINGS_SWITCH_INPUT_CLASS = "peer absolute h-px w-px opacity-0";

export const SETTINGS_SWITCH_TRACK_CLASS =
  "relative h-4.25 w-7.75 rounded-full border border-[var(--border-strong)] bg-[var(--surface-hover)] after:absolute after:top-0.5 after:left-0.5 after:size-2.75 after:rounded-full after:bg-[var(--muted)] after:transition-transform after:duration-150 after:content-[''] peer-checked:border-[var(--accent)] peer-checked:bg-[var(--accent-soft)] peer-checked:after:translate-x-3.5 peer-checked:after:bg-[var(--accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]";

export const SETTINGS_SWITCH_LABEL_CLASS =
  "text-[var(--text-soft)] text-[var(--text-meta)]";

export const SETTINGS_EXECUTION_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-1.25";
