export const COMPOSER_SELECTOR_ROOT_CLASS = "composer-selector-root";

export const COMPOSER_PROJECT_TRIGGER_CLASS =
  "composer-route-trigger composer-project-trigger";

export const COMPOSER_PROJECT_GLYPH_CLASS =
  "grid size-5 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--composer-project-color,var(--accent))_10%,var(--surface-soft))] font-mono text-[length:var(--text-control)] font-bold text-[var(--composer-project-color,var(--accent))]";

export const COMPOSER_POPOVER_CLASS =
  "composer-selector-popover z-70 flex w-[min(420px,calc(100vw-24px))] max-h-[min(620px,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-[var(--radius-floating)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] !p-0 text-[var(--text-soft)] shadow-[0_24px_70px_color-mix(in_srgb,var(--shadow)_76%,transparent)] [&>header]:shrink-0 [&>label]:shrink-0 [&>p]:shrink-0 [&>footer]:shrink-0 [&>div:not(.composer-model-groups)]:shrink-0 [&_.composer-model-groups]:min-h-0 motion-reduce:animate-none";

// SDK portal placement avoids pane/dock clipping and uses the actual free side.
// Keep the workspace heading and project-management action outside the scrolling choices.
export const COMPOSER_PROJECT_POPOVER_CLASS =
  "composer-project-popover z-70 grid w-[min(340px,calc(100vw-24px))] max-h-[min(460px,var(--radix-popover-content-available-height))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[var(--radius-floating)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_98%,var(--bg))] !p-0 text-[var(--text-soft)] shadow-[0_24px_70px_color-mix(in_srgb,var(--shadow)_76%,transparent)] motion-reduce:animate-none";

export const COMPOSER_POPOVER_HEADER_CLASS =
  "flex items-start px-3.5 pt-3.25 pb-1.5 [&>span]:grid [&>span]:gap-0.5 [&_small]:text-[length:var(--text-control)] [&_small]:text-[var(--faint)] [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold [&_strong]:text-[var(--text)]";

export const COMPOSER_SEARCH_CLASS =
  "grid grid-cols-[20px_minmax(0,1fr)] items-center rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[var(--faint)] [&_input]:h-10 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-[length:var(--text-control)] [&_input]:text-[var(--text)] [&_input:focus-visible]:!outline-none [&_input:focus-visible]:!ring-0 [&_input:focus-visible]:!shadow-none focus-within:border-[var(--text-soft)] forced-colors:focus-within:outline forced-colors:focus-within:outline-1 forced-colors:focus-within:outline-offset-0 forced-colors:focus-within:outline-[Highlight]";

/** Static group label inside selector popovers; matches the app's quiet mono-meta register. */
export const COMPOSER_SECTION_LABEL_CLASS =
  "m-0 px-1.75 pb-1 pt-1.5 font-[var(--font-mono)] text-[length:var(--text-meta)] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]";

export const COMPOSER_PROJECT_LIST_CLASS =
  "composer-project-list grid gap-0.5 [&>button]:grid [&>button]:min-h-10 [&>button]:grid-cols-[22px_minmax(0,1fr)_18px] [&>button]:items-center [&>button]:gap-2.25 [&>button]:rounded-lg [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-1.75 [&>button]:py-1 [&>button]:text-left [&>button:focus-visible]:outline [&>button:focus-visible]:outline-1 [&>button:focus-visible]:outline-offset-[-1px] [&>button:focus-visible]:outline-[var(--text-soft)] forced-colors:[&>button:focus-visible]:outline-[Highlight] [&>button]:text-[var(--text-soft)] [&>button:hover]:bg-[var(--surface-hover)] [&>button[aria-current=true]]:bg-[var(--surface-hover)] [&>button[aria-current=true]_strong]:font-semibold [&>button>svg]:text-[var(--accent-text)] [&>button>span:nth-child(2)]:grid [&>button>span:nth-child(2)]:min-w-0 [&>button>span:nth-child(2)]:gap-0.5 [&_small]:truncate [&_small]:text-[length:var(--text-control)] [&_small]:text-[var(--faint)] [&_strong]:truncate [&_strong]:text-[length:var(--text-control)] [&_strong]:font-medium";

export const COMPOSER_ACTIONS_CLASS =
  "flex items-center justify-between gap-2 px-2 pt-1 pb-2 [&_button]:inline-flex [&_button]:min-h-10 [&_button]:items-center [&_button]:gap-1.5 [&_button]:rounded-[var(--radius-md)] [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-2 [&_button]:py-1.25 [&_button]:text-[length:var(--text-control)] [&_button]:text-[var(--muted)] hover:[&_button]:bg-[var(--surface-hover)] hover:[&_button]:text-[var(--text)]";

export const COMPOSER_MODEL_TRIGGER_CLASS =
  "composer-route-trigger composer-model-trigger";

export const COMPOSER_MODEL_NAME_CLASS = "composer-route-label";

export const COMPOSER_MODEL_EFFORT_BADGE_CLASS = "composer-route-mode";

export const COMPOSER_MODEL_GROUPS_CLASS =
  "composer-model-groups grid min-h-0 max-h-[min(470px,56vh)] flex-1 gap-0.5 overflow-y-auto px-1.75 pb-1.75 [&>section]:grid";

export const COMPOSER_PROVIDER_HEADING_CLASS =
  "grid min-h-9 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[var(--radius-md)] border-0 bg-transparent px-1.75 py-1 text-left text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text)] [&>svg]:text-[var(--faint)] [&_strong]:text-[length:var(--text-control)] [&_strong]:font-semibold [&_strong]:text-inherit [&_strong]:normal-case";

export const COMPOSER_MODEL_LIST_CLASS =
  "grid gap-px pl-4 [&>p]:p-3 [&>p]:text-[length:var(--text-control)] [&>p]:text-[var(--faint)]";

export const COMPOSER_MODEL_OPTION_CLASS =
  "grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-md)] px-1 py-0.5 hover:bg-[var(--surface-hover)]";

export const COMPOSER_MODEL_BUTTON_CLASS =
  "grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--radius-md)] border-0 bg-transparent px-2 py-1 text-left text-[var(--text-soft)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--text-soft)] forced-colors:focus-visible:outline-[Highlight] disabled:opacity-55 aria-current:bg-[var(--surface-hover)] aria-current:font-semibold [&>i]:min-w-6 [&>i]:text-right [&>i]:text-[length:var(--text-control)] [&>i]:not-italic [&>i]:text-[var(--accent-text)] [&>i]:uppercase [&>span]:grid [&>span]:min-w-0 [&>span]:gap-px [&_small]:truncate [&_small]:font-mono [&_small]:text-[length:var(--text-control)] [&_small]:text-[var(--faint)] [&_strong]:truncate [&_strong]:text-[length:var(--text-control)] [&_strong]:font-medium";

export const COMPOSER_EFFORT_CLASS =
  "flex items-center gap-1.25 font-mono text-[length:var(--text-control)] tracking-[0.04em] text-[var(--faint)] uppercase [&_select]:h-9 [&_select]:min-w-17 [&_select]:rounded-[5px] [&_select]:border [&_select]:border-[var(--border)] [&_select]:bg-[var(--surface-soft)] [&_select]:pr-4.5 [&_select]:pl-1.5 [&_select]:font-mono [&_select]:text-[length:var(--text-control)] [&_select]:text-[var(--muted)] [&_select]:lowercase hover:[&_select]:border-[var(--border-strong)] hover:[&_select]:text-[var(--text)] [&_select:disabled]:opacity-55";
