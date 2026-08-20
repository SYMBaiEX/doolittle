export const COMPOSER_SELECTOR_ROOT_CLASS = "relative";

export const COMPOSER_PROJECT_TRIGGER_CLASS =
  "composer-project-trigger flex h-7.75 min-w-[118px] max-w-[260px] items-center gap-1.75 overflow-hidden rounded-t-[9px] border border-[var(--border-strong)] border-b-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] pr-2.5 pl-2 text-[10px] text-[var(--muted)] shadow-[0_-8px_24px_color-mix(in_srgb,var(--shadow)_18%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-strong))] hover:text-[var(--text)] aria-expanded:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-strong))] aria-expanded:text-[var(--text)] max-[760px]:min-w-[102px] max-[760px]:max-w-[190px] [&>i]:ml-auto [&>i]:not-italic [&>i]:text-[var(--faint)] [&>span:not([data-project-glyph])]:truncate [&>span:not([data-project-glyph])]:font-semibold";

export const COMPOSER_PROJECT_GLYPH_CLASS =
  "grid size-5 shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--composer-project-color,var(--accent))_28%,var(--border))] bg-[color-mix(in_srgb,var(--composer-project-color,var(--accent))_10%,var(--surface-soft))] font-mono text-[length:var(--text-meta)] font-bold text-[var(--composer-project-color,var(--accent))]";

export const COMPOSER_POPOVER_CLASS =
  "absolute right-0 bottom-[calc(100%+9px)] z-70 grid overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] text-[var(--text-soft)] shadow-[0_24px_70px_color-mix(in_srgb,var(--shadow)_76%,transparent)]";

export const COMPOSER_POPOVER_HEADER_CLASS =
  "flex items-start border-[var(--border)] border-b px-3.5 pt-3.25 pb-2.5 [&>span]:grid [&>span]:gap-0.5 [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--faint)] [&_strong]:text-[11px] [&_strong]:font-semibold [&_strong]:text-[var(--text)]";

export const COMPOSER_SEARCH_CLASS =
  "grid grid-cols-[20px_minmax(0,1fr)] items-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[var(--faint)] [&_input]:h-8.5 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-[11px] [&_input]:text-[var(--text)] [&_input]:outline-0";

export const COMPOSER_PROJECT_LIST_CLASS =
  "composer-project-list grid max-h-[min(330px,46vh)] gap-0.5 overflow-y-auto px-1.75 pb-1.75 [&>button]:grid [&>button]:min-h-10.75 [&>button]:grid-cols-[22px_minmax(0,1fr)_18px] [&>button]:items-center [&>button]:gap-2.25 [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-1.75 [&>button]:py-1.25 [&>button]:text-left [&>button]:text-[var(--text-soft)] hover:[&>button]:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))] aria-current:[&>button]:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))] [&>button>i]:text-right [&>button>i]:text-[10px] [&>button>i]:not-italic [&>button>i]:text-[var(--accent-text)] [&>button>span:nth-child(2)]:grid [&>button>span:nth-child(2)]:min-w-0 [&>button>span:nth-child(2)]:gap-0.5 [&_small]:truncate [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--faint)] [&_strong]:truncate [&_strong]:text-[11px] [&_strong]:font-semibold";

export const COMPOSER_ACTIONS_CLASS =
  "flex items-center justify-between gap-2 border-[var(--border)] border-t bg-[color-mix(in_srgb,var(--surface-soft)_72%,transparent)] p-2 [&_button]:inline-flex [&_button]:min-h-7.5 [&_button]:items-center [&_button]:gap-1.5 [&_button]:rounded-[7px] [&_button]:border [&_button]:border-transparent [&_button]:bg-transparent [&_button]:px-2 [&_button]:py-1.25 [&_button]:text-[length:var(--text-meta)] [&_button]:text-[var(--muted)] hover:[&_button]:border-[var(--border)] hover:[&_button]:bg-[var(--surface-hover)] hover:[&_button]:text-[var(--text)]";

export const COMPOSER_MODEL_TRIGGER_CLASS =
  "composer-model-trigger flex h-7.5 min-w-0 max-w-[min(310px,38vw)] items-center gap-1.5 overflow-hidden rounded-[7px] border border-transparent bg-transparent px-2 py-1.25 text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] aria-expanded:border-[var(--border)] aria-expanded:bg-[var(--surface-soft)] aria-expanded:text-[var(--text)] max-[760px]:max-w-49 [&>i]:shrink-0 [&>i]:not-italic [&>i]:text-[var(--faint)] [&>small]:shrink-0 [&>small]:font-mono [&>small]:text-[length:var(--text-meta)] [&>small]:text-[var(--faint)] [&>small]:uppercase max-[760px]:[&>small]:hidden";

export const COMPOSER_MODEL_NAME_CLASS =
  "min-w-0 truncate text-[10px] font-semibold";

export const COMPOSER_MODEL_EFFORT_BADGE_CLASS =
  "shrink-0 rounded-[4px] border border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface-soft))] px-1.25 py-0.5 font-mono text-[length:var(--text-meta)] leading-none font-bold text-[var(--accent-text)] uppercase";

export const COMPOSER_MODEL_GROUPS_CLASS =
  "grid max-h-[min(470px,56vh)] gap-0.5 overflow-y-auto px-1.75 pb-1.75 [&>section]:grid";

export const COMPOSER_PROVIDER_HEADING_CLASS =
  "grid min-h-8.5 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[7px] border-0 bg-transparent px-1.75 py-1.5 text-left text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] [&>span]:text-[11px] [&>span]:text-[var(--faint)] [&_strong]:text-[10px] [&_strong]:font-bold [&_strong]:tracking-[0.07em] [&_strong]:text-inherit [&_strong]:uppercase";

export const COMPOSER_MODEL_LIST_CLASS =
  "grid gap-px pl-4 [&>p]:p-3 [&>p]:text-[10px] [&>p]:text-[var(--faint)]";

export const COMPOSER_MODEL_OPTION_CLASS =
  "grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[7px] px-1 py-0.75 hover:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))]";

export const COMPOSER_MODEL_BUTTON_CLASS =
  "grid min-h-7.5 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[7px] border-0 bg-transparent px-2 py-1.25 text-left text-[var(--text-soft)] aria-current:bg-[color-mix(in_srgb,var(--accent)_7%,var(--surface-hover))] [&>i]:min-w-6 [&>i]:text-right [&>i]:text-[length:var(--text-meta)] [&>i]:not-italic [&>i]:text-[var(--accent-text)] [&>i]:uppercase [&>span]:grid [&>span]:min-w-0 [&>span]:gap-px [&_small]:truncate [&_small]:font-mono [&_small]:text-[length:var(--text-meta)] [&_small]:text-[var(--faint)] [&_strong]:truncate [&_strong]:text-[11px] [&_strong]:font-medium";

export const COMPOSER_EFFORT_CLASS =
  "flex items-center gap-1.25 font-mono text-[length:var(--text-meta)] tracking-[0.04em] text-[var(--faint)] uppercase [&_select]:h-6 [&_select]:min-w-17 [&_select]:rounded-[5px] [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface-soft)] [&_select]:pr-4.5 [&_select]:pl-1.5 [&_select]:font-mono [&_select]:text-[length:var(--text-meta)] [&_select]:text-[var(--muted)] [&_select]:lowercase hover:[&_select]:border-[var(--border-strong)] hover:[&_select]:text-[var(--text)]";
