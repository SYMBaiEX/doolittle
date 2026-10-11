export const MESSAGE_RESPONSE_CLASS = [
  "min-w-0 [overflow-wrap:anywhere] text-inherit [&>:first-child]:!mt-0 [&>:last-child]:!mb-0 [&_p]:!my-[0.65em] [&_p]:!leading-[1.55]",
  "[&_a]:text-[var(--accent-text)] [&_a]:underline [&_a]:decoration-[color-mix(in_srgb,var(--accent)_36%,transparent)] [&_a]:decoration-1 [&_a]:underline-offset-3 hover:[&_a]:decoration-current",
  "[&_blockquote]:my-[0.5em] [&_blockquote]:border-l-2 [&_blockquote]:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] [&_blockquote]:py-[0.04em] [&_blockquote]:pr-0 [&_blockquote]:pl-[0.68em] [&_blockquote]:text-[var(--muted)]",
  "[&_h1]:!mt-[1.2em] [&_h1]:!mb-[0.4em] [&_h1]:!text-[1.25em] [&_h2]:!mt-[1.1em] [&_h2]:!mb-[0.4em] [&_h2]:!text-[1.125em] [&_h3]:!mt-[1em] [&_h3]:!mb-[0.35em] [&_h3]:!text-[1em] [&_h4]:!mt-[1em] [&_h4]:!mb-[0.35em] [&_h4]:!text-[1em] [&_h1]:!font-semibold [&_h2]:!font-semibold [&_h3]:!font-semibold [&_h4]:!font-semibold",
  "[&_hr]:!my-5 [&_hr]:!border-[var(--border)]",
  "[&_img]:my-[0.75em] [&_img]:block [&_img]:max-h-[520px] [&_img]:max-w-[min(100%,760px)] [&_img]:rounded-[var(--radius-sm)] [&_img]:border [&_img]:border-[var(--border)] [&_img]:object-contain",
  "[&_li]:!my-[0.25em] [&_li]:!pl-[0.08em] [&_ol]:!my-[0.65em] [&_ol]:!pl-[1.2em] [&_ul]:!my-[0.65em] [&_ul]:!pl-[1.2em]",
  "[&_[data-streamdown=code-block]]:!my-1.25 [&_[data-streamdown=code-block]]:!min-h-0 [&_[data-streamdown=code-block]]:!gap-0 [&_[data-streamdown=code-block]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=code-block]]:!border-[var(--border)] [&_[data-streamdown=code-block]]:!bg-[var(--surface-soft)] [&_[data-streamdown=code-block]]:!p-0 [&_[data-streamdown=code-block]]:[contain-intrinsic-size:none]! [&_[data-streamdown=code-block]]:[content-visibility:visible]!",
  "[&_[data-streamdown=code-block-header]]:!min-h-10 [&_[data-streamdown=code-block-header]]:!px-2 [&_[data-streamdown=code-block-header]]:!text-[length:var(--text-meta)]",
  "[&_[data-streamdown=code-block-actions]]:!gap-0 [&_[data-streamdown=code-block-actions]]:!rounded-none [&_[data-streamdown=code-block-actions]]:!border-0 [&_[data-streamdown=code-block-actions]]:!bg-transparent [&_[data-streamdown=code-block-actions]]:!p-0.5 [&_[data-streamdown=code-block-copy-button]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=code-block-copy-button]]:!min-h-10 [&_[data-streamdown=code-block-copy-button]]:!min-w-10 [&_[data-streamdown=code-block-copy-button]]:!p-2",
  "[&_[data-streamdown=code-block-body]]:!h-auto [&_[data-streamdown=code-block-body]]:!min-h-0 [&_[data-streamdown=code-block-body]]:!max-h-[320px] [&_[data-streamdown=code-block-body]]:!overflow-y-auto [&_[data-streamdown=code-block-body]]:!overflow-x-auto [&_[data-streamdown=code-block-body]]:!rounded-none [&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block-body]]:!border-t [&_[data-streamdown=code-block-body]]:!border-[var(--border)] [&_[data-streamdown=code-block-body]]:!bg-[var(--canvas-bg)] [&_[data-streamdown=code-block-body]]:!p-3 [&_[data-streamdown=code-block-body]]:!font-[var(--font-mono)] [&_[data-streamdown=code-block-body]]:!text-[length:var(--text-code,13px)] [&_[data-streamdown=code-block-body]]:!leading-[1.46] [&_[data-streamdown=code-block-body]]:[scrollbar-gutter:stable_both-edges] max-[480px]:[&_[data-streamdown=code-block-body]]:!max-h-[240px] [&_[data-streamdown=code-block-body]_pre]:!m-0 [&_[data-streamdown=code-block-body]_pre]:!min-h-0 [&_[data-streamdown=code-block-body]_pre]:!w-max [&_[data-streamdown=code-block-body]_pre]:!min-w-full [&_[data-streamdown=code-block-body]_pre]:!whitespace-pre",
  "[&_[data-streamdown=inline-code]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=inline-code]]:!bg-[var(--surface-soft)] [&_[data-streamdown=inline-code]]:!px-1 [&_[data-streamdown=inline-code]]:!py-0.25 [&_[data-streamdown=inline-code]]:!text-[0.92em]",
  "[&_[data-streamdown=table-wrapper]]:!my-2.5 [&_[data-streamdown=table-wrapper]]:!gap-0.5 [&_[data-streamdown=table-wrapper]]:!overflow-x-auto [&_[data-streamdown=table-wrapper]]:[scrollbar-gutter:stable] [&_[data-streamdown=table-wrapper]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=table-wrapper]]:!bg-transparent [&_[data-streamdown=table-wrapper]]:!p-0.5 [&_table]:min-w-full [&_table]:w-max [&_table]:border-separate [&_table]:border-spacing-0 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-[var(--surface-soft)] [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-[var(--border)] [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-[var(--text-soft)] [&_td]:border-b [&_td]:border-[color-mix(in_srgb,var(--border)_70%,transparent)] [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_td]:text-[var(--text-soft)] [&_tr:last-child_td]:border-b-0",
].join(" ");

export const MESSAGE_TOOL_GROUP_CLASS =
  "group mt-2 overflow-hidden rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-[color-mix(in_srgb,var(--surface-soft)_34%,transparent)] ";

export const MESSAGE_TOOL_SUMMARY_CLASS =
  "grid min-h-10 w-full cursor-pointer list-none grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2 border-0 bg-transparent px-2.25 py-1.5 text-left select-none hover:bg-[color-mix(in_srgb,var(--surface-hover)_66%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden max-[560px]:grid-cols-[auto_minmax(0,1fr)_auto_auto]";

export const MESSAGE_TOOL_LIST_CLASS =
  "m-0 grid max-h-40 list-none gap-0.5 overflow-y-auto border-[var(--border)] border-t px-1.25 py-1 [scrollbar-gutter:stable]";

export const MESSAGE_TOOL_ROW_CLASS =
  "grid min-h-10 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-xs)] border border-transparent bg-transparent px-1.75 py-1 text-left hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

export const MESSAGE_TOOL_ROW_SELECTED_CLASS =
  "font-semibold text-[var(--text)]";

export const MESSAGE_TOOL_STATE_CLASS =
  "inline-flex items-center gap-1.25 font-mono text-[length:var(--text-meta)] font-medium";

export const MESSAGE_TOOL_BODY_CLASS =
  "max-h-[270px] overflow-auto border-[var(--border)] border-t bg-[color-mix(in_srgb,var(--surface)_28%,transparent)] px-2.25 py-1.5 [scrollbar-gutter:stable]";

export const MESSAGE_TOOL_SECTION_CLASS = "mt-2.5";

export const MESSAGE_TOOL_SECTION_HEADING_CLASS =
  "mb-1.25 flex items-center justify-between font-mono text-[length:var(--text-meta)] tracking-[0.08em] text-[var(--faint)] uppercase";

export const MESSAGE_TOOL_PAYLOAD_CLASS =
  "m-0 max-h-44 overflow-auto whitespace-pre rounded-[var(--radius-xs)] border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-[color-mix(in_srgb,var(--surface-soft)_88%,transparent)] px-2 py-1.75 font-mono text-[length:var(--text-code,13px)] leading-[1.5] text-[var(--text-soft)] [scrollbar-gutter:stable_both-edges]";

export const MESSAGE_AGENT_STEPS_CLASS =
  "group mt-0.5 border-[color-mix(in_srgb,var(--border)_68%,transparent)] border-t text-[var(--muted)]";
