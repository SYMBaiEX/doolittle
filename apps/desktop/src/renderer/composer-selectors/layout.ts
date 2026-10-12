export const COMPOSER_SELECTOR_ROOT_CLASS = "relative";

export const COMPOSER_PROJECT_TRIGGER_CLASS =
  "composer-project-trigger flex h-10 min-w-[96px] max-w-[180px] items-center gap-1.5 overflow-hidden rounded-[var(--radius-md)] border border-transparent bg-transparent pr-2 pl-1.5 text-[length:var(--text-control)] text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] aria-expanded:font-semibold aria-expanded:text-[var(--text)] max-[720px]:min-w-0 max-[720px]:max-w-34 max-[480px]:h-11 max-[480px]:w-11 max-[480px]:justify-center max-[480px]:px-0 max-[480px]:[&>svg]:hidden max-[480px]:[&>span:not([data-project-glyph])]:hidden [&>svg]:ml-auto [&>svg]:text-[var(--faint)] [&>span:not([data-project-glyph])]:truncate [&>span:not([data-project-glyph])]:font-semibold";

export const COMPOSER_PROJECT_GLYPH_CLASS =
  "grid size-5 shrink-0 place-items-center rounded-md border border-[color-mix(in_srgb,var(--composer-project-color,var(--accent))_28%,var(--border))] bg-[color-mix(in_srgb,var(--composer-project-color,var(--accent))_10%,var(--surface-soft))] font-mono text-[length:var(--text-control)] font-bold text-[var(--composer-project-color,var(--accent))]";

export const COMPOSER_POPOVER_CLASS =
  "composer-selector-popover z-70 flex w-[min(420px,calc(100vw-24px))] max-h-[min(620px,var(--radix-popover-content-available-height))] flex-col overflow-y-auto rounded-[var(--radius-floating)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] !p-0 text-[var(--text-soft)] shadow-[0_24px_70px_color-mix(in_srgb,var(--shadow)_76%,transparent)] [&>label]:shrink-0 [&>p]:shrink-0 [&>footer]:shrink-0 [&>div:not(.composer-model-groups)]:shrink-0 [&_.composer-model-groups]:min-h-0 motion-reduce:animate-none";

// SDK portal placement avoids pane/dock clipping and uses the actual free side.
// Only the list scrolls; search and project-management actions stay reachable.
export const COMPOSER_PROJECT_POPOVER_CLASS =
  "composer-project-popover z-70 grid w-[min(340px,calc(100vw-24px))] max-h-[var(--radix-popover-content-available-height)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-[var(--radius-floating)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] !p-0 text-[var(--text-soft)] shadow-[0_24px_70px_color-mix(in_srgb,var(--shadow)_76%,transparent)] [&_.composer-project-list]:min-h-0 motion-reduce:animate-none";

export const COMPOSER_POPOVER_HEADER_CLASS =
  "flex items-start border-[var(--border)] border-b px-3.5 pt-3.25 pb-2.5 [&>span]:grid [&>span]:gap-0.5 [&_small]:text-[length:var(--text-control)] [&_small]:text-[var(--faint)] [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold [&_strong]:text-[var(--text)]";

export const COMPOSER_SEARCH_CLASS =
  "grid grid-cols-[20px_minmax(0,1fr)] items-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[var(--faint)] [&_input]:h-10 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-[length:var(--text-control)] [&_input]:text-[var(--text)] [&_input:focus-visible]:!outline-none [&_input:focus-visible]:!ring-0 [&_input:focus-visible]:!shadow-none focus-within:border-[var(--text-soft)] forced-colors:focus-within:outline forced-colors:focus-within:outline-1 forced-colors:focus-within:outline-offset-0 forced-colors:focus-within:outline-[Highlight]";

export const COMPOSER_PROJECT_LIST_CLASS =
  "composer-project-list grid max-h-[min(330px,46vh)] gap-0.5 overflow-y-auto px-1.75 pb-1.75 [&>button]:grid [&>button]:min-h-10.75 [&>button]:grid-cols-[22px_minmax(0,1fr)_18px] [&>button]:items-center [&>button]:gap-2.25 [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-1.75 [&>button]:py-1.25 [&>button]:text-left [&>button:focus-visible]:outline [&>button:focus-visible]:outline-2 [&>button:focus-visible]:outline-offset-[-2px] [&>button:focus-visible]:outline-[var(--focus-ring)] [&>button]:text-[var(--text-soft)] hover:[&>button]:bg-[var(--surface-hover)] aria-current:[&>button]:font-semibold [&>button>svg]:text-[var(--accent-text)] [&>button>span:nth-child(2)]:grid [&>button>span:nth-child(2)]:min-w-0 [&>button>span:nth-child(2)]:gap-0.5 [&_small]:truncate [&_small]:text-[length:var(--text-control)] [&_small]:text-[var(--faint)] [&_strong]:truncate [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold";

export const COMPOSER_ACTIONS_CLASS =
  "flex items-center justify-between gap-2 border-[var(--border)] border-t bg-[color-mix(in_srgb,var(--surface-soft)_72%,transparent)] p-2 [&_button]:inline-flex [&_button]:min-h-10 [&_button]:items-center [&_button]:gap-1.5 [&_button]:rounded-[var(--radius-md)] [&_button]:border [&_button]:border-transparent [&_button]:bg-transparent [&_button]:px-2 [&_button]:py-1.25 [&_button]:text-[length:var(--text-control)] [&_button]:text-[var(--muted)] hover:[&_button]:border-[var(--border)] hover:[&_button]:bg-[var(--surface-hover)] hover:[&_button]:text-[var(--text)]";

export const COMPOSER_MODEL_TRIGGER_CLASS =
  "composer-model-trigger flex h-10 min-w-0 max-w-[min(210px,30vw)] items-center gap-1.25 overflow-hidden rounded-[var(--radius-md)] border border-transparent bg-transparent px-2 py-1 text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] aria-expanded:font-semibold aria-expanded:text-[var(--text)] max-[720px]:max-w-40 max-[480px]:h-11 max-[480px]:max-w-none max-[480px]:px-1.5 [&>svg]:shrink-0 [&>svg]:text-[var(--faint)]";

export const COMPOSER_MODEL_NAME_CLASS =
  "min-w-0 truncate text-[length:var(--text-control)] font-semibold";

export const COMPOSER_MODEL_EFFORT_BADGE_CLASS =
  "shrink-0 text-[length:var(--text-meta)] leading-none font-medium text-[var(--muted)]";

export const COMPOSER_MODEL_GROUPS_CLASS =
  "composer-model-groups grid min-h-0 max-h-[min(470px,56vh)] flex-1 gap-0.5 overflow-y-auto px-1.75 pb-1.75 [&>section]:grid";

export const COMPOSER_PROVIDER_HEADING_CLASS =
  "grid min-h-10 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-md)] border-0 bg-transparent px-1.75 py-1.5 text-left text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] [&>svg]:text-[var(--faint)] [&_strong]:text-[length:var(--text-control)] [&_strong]:font-bold [&_strong]:text-inherit [&_strong]:normal-case";

export const COMPOSER_MODEL_LIST_CLASS =
  "grid gap-px pl-4 [&>p]:p-3 [&>p]:text-[length:var(--text-control)] [&>p]:text-[var(--faint)]";

export const COMPOSER_MODEL_OPTION_CLASS =
  "grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-md)] px-1 py-0.75 hover:bg-[var(--surface-hover)]";

export const COMPOSER_MODEL_BUTTON_CLASS =
  "grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-md)] border-0 bg-transparent px-2 py-1.25 text-left text-[var(--text-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] aria-current:font-semibold [&>i]:min-w-6 [&>i]:text-right [&>i]:text-[length:var(--text-control)] [&>i]:not-italic [&>i]:text-[var(--accent-text)] [&>i]:uppercase [&>span]:grid [&>span]:min-w-0 [&>span]:gap-px [&_small]:truncate [&_small]:font-mono [&_small]:text-[length:var(--text-control)] [&_small]:text-[var(--faint)] [&_strong]:truncate [&_strong]:text-[length:var(--text-control)] [&_strong]:font-medium";

export const COMPOSER_EFFORT_CLASS =
  "flex items-center gap-1.25 font-mono text-[length:var(--text-control)] tracking-[0.04em] text-[var(--faint)] uppercase [&_select]:h-10 [&_select]:min-w-17 [&_select]:rounded-[5px] [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface-soft)] [&_select]:pr-4.5 [&_select]:pl-1.5 [&_select]:font-mono [&_select]:text-[length:var(--text-control)] [&_select]:text-[var(--muted)] [&_select]:lowercase hover:[&_select]:border-[var(--border-strong)] hover:[&_select]:text-[var(--text)]";
