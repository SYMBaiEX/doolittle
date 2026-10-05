export const AUTOMATION_PAGE_CLASS =
  "page automation-page gap-3 [--automation-line:color-mix(in_srgb,var(--accent)_28%,var(--border))]";

export const AUTOMATION_BUILDER_CLASS =
  "automation-builder overflow-hidden rounded-[var(--radius-md)] border border-[var(--automation-line)] bg-[var(--surface)]";

export const AUTOMATION_BUILDER_HEADER_CLASS =
  "automation-builder__header grid grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] items-end gap-4 px-4 pt-3 pb-2 max-[720px]:grid-cols-1 [&_h2]:mt-0.5 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-sm [&_h2]:tracking-[-0.015em]";

export const AUTOMATION_FIELD_LABEL_CLASS =
  "grid min-w-0 gap-1.5 text-[length:var(--text-control)] font-semibold tracking-[0.06em] text-[var(--muted)] uppercase";

export const AUTOMATION_FIELD_CONTROL_CLASS =
  "min-h-[var(--control-height)] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-2 text-[length:var(--text-control)] text-[var(--text)] max-[760px]:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

export const AUTOMATION_BUILDER_GRID_CLASS =
  "automation-builder__grid grid grid-cols-3 gap-1.5 px-4 pb-3 max-[1040px]:grid-cols-1";

export const AUTOMATION_BUILDER_SECTION_CLASS =
  "automation-builder__section grid content-start gap-3 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--surface-soft)_68%,transparent)] p-3";

export const AUTOMATION_SECTION_HEADING_CLASS =
  "automation-builder__section-heading flex items-start justify-between gap-3 [&_strong]:text-sm [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]";

export const AUTOMATION_CHOICE_GRID_CLASS =
  "automation-choice-grid grid grid-cols-3 gap-1 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] p-1";

export const AUTOMATION_CHOICE_BUTTON_CLASS =
  "min-h-[var(--control-height)] rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--text-control)] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] max-[760px]:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50";

export const AUTOMATION_CHOICE_SELECTED_CLASS =
  "selected bg-[var(--accent-soft)] text-[var(--accent-text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_34%,var(--border))]";

export const AUTOMATION_BUILDER_FOOTER_CLASS =
  "automation-builder__footer flex items-center justify-between gap-3 px-4 pt-1 pb-3 max-[720px]:items-stretch max-[720px]:flex-col [&>span]:text-[length:var(--text-control)] [&>span]:text-[var(--muted)]";

export const AUTOMATION_WORKSPACE_CLASS =
  "automation-workspace grid grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] items-start gap-3 max-[1040px]:grid-cols-1";

export const AUTOMATION_JOB_CARD_CLASS =
  "automation-job-card border-b border-[var(--line-subtle)] bg-transparent py-4";

export const AUTOMATION_JOB_SUMMARY_CLASS =
  "automation-job-summary my-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-[620px]:grid-cols-1";

export const AUTOMATION_DETAILS_SUMMARY_CLASS =
  "flex min-h-8 cursor-pointer list-none items-center justify-between rounded-[var(--radius-xs)] px-1.5 py-1.5 text-[length:var(--text-control)] font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden after:text-[var(--faint)] after:content-['+'] [details[open]_&]:after:content-['−']";

export const AUTOMATION_RUNS_PANEL_CLASS =
  "automation-runs-panel overflow-hidden [&[open]>summary]:border-b [&[open]>summary]:border-[var(--border)] [&>summary]:flex [&>summary]:min-h-14 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3 [&>summary]:px-4 [&>summary]:py-3 [&>summary::-webkit-details-marker]:hidden [&>summary>span:first-child]:grid [&>summary>span:first-child]:gap-0.5 [&>summary_small]:text-[length:var(--text-meta)] [&>summary_small]:text-[var(--muted)]";

export const AUTOMATION_RUN_BUTTON_CLASS =
  "grid min-h-12 w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]";

export const AUTOMATION_TRACE_CLASS =
  "automation-trace rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5";

export const AUTOMATION_STATUS_DOT_CLASS =
  "automation-run-status size-2 rounded-full bg-[var(--good)]";
