export const AUTOMATION_PAGE_CLASS =
  "automation-page w-full min-w-0 [--automation-line:var(--border)]";

export const AUTOMATION_BUILDER_CLASS =
  "automation-builder overflow-hidden rounded-[var(--radius-md)] border border-[var(--automation-line)] bg-[var(--surface)]";

export const AUTOMATION_BUILDER_HEADER_CLASS =
  "automation-builder__header grid grid-cols-[minmax(0,1fr)_minmax(220px,0.55fr)] items-end gap-4 px-4 pt-3 pb-2 max-[720px]:grid-cols-1 [&_h2]:mt-0.5 [&_h2]:mb-0 [&_h2]:font-[var(--font-display)] [&_h2]:text-[length:var(--text-control)] [&_h2]:tracking-[-0.015em]";

export const AUTOMATION_FIELD_LABEL_CLASS =
  "grid min-w-0 gap-2 text-[length:var(--text-control)] font-medium text-[var(--text-soft)]";

export const AUTOMATION_FIELD_CONTROL_CLASS =
  "min-h-[var(--control-height)] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-2 text-[length:var(--text-control)] text-[var(--text)] max-[760px]:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

export const AUTOMATION_BUILDER_GRID_CLASS =
  "automation-builder__grid grid grid-cols-3 gap-1.5 px-4 pb-3";

export const AUTOMATION_BUILDER_SECTION_CLASS =
  "automation-builder__section grid content-start gap-4 border-t border-[var(--border)] bg-transparent py-4";

export const AUTOMATION_SECTION_HEADING_CLASS =
  "automation-builder__section-heading flex items-start justify-between gap-3 [&_strong]:text-[length:var(--text-control)] [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--muted)]";

export const AUTOMATION_CHOICE_GRID_CLASS =
  "automation-choice-grid grid grid-cols-3 gap-1 border-b border-[var(--border)] bg-transparent";

export const AUTOMATION_CHOICE_BUTTON_CLASS =
  "flex min-h-[var(--control-height)] items-center justify-center rounded-[var(--radius-sm)] border border-transparent px-2 py-1.5 text-[length:var(--text-control)] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] max-[760px]:min-h-11 focus-within:outline focus-within:outline-1 focus-within:outline-offset-[-2px] focus-within:outline-[var(--focus-ring)] motion-reduce:transition-none";

export const AUTOMATION_CHOICE_SELECTED_CLASS =
  "selected border-[var(--border)] bg-[var(--surface-raised)] font-semibold text-[var(--text)]";

export const AUTOMATION_BUILDER_FOOTER_CLASS =
  "automation-builder__footer flex items-center justify-between gap-3 px-4 pt-1 pb-3 max-[720px]:items-stretch max-[720px]:flex-col [&>span]:text-[length:var(--text-control)] [&>span]:text-[var(--muted)]";

export const AUTOMATION_DETAILS_SUMMARY_CLASS =
  "flex min-h-8 cursor-pointer list-none items-center justify-between rounded-[var(--radius-xs)] px-1.5 py-1.5 text-[length:var(--text-control)] font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden after:text-[var(--faint)] after:content-['+'] [details[open]_&]:after:content-['−']";

export const AUTOMATION_STATUS_DOT_CLASS =
  "automation-run-status size-2 rounded-full bg-[var(--good)]";
