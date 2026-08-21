export const MESSAGE_RESPONSE_CLASS = [
  "min-w-0 [overflow-wrap:anywhere] text-inherit [&>:first-child]:!mt-0 [&>:last-child]:!mb-0 [&_p]:!my-[0.48em] [&_p]:!leading-[1.52]",
  "[&_a]:text-[color-mix(in_srgb,var(--accent)_86%,var(--text))] [&_a]:underline [&_a]:decoration-[color-mix(in_srgb,var(--accent)_36%,transparent)] [&_a]:decoration-1 [&_a]:underline-offset-3 hover:[&_a]:decoration-current",
  "[&_blockquote]:my-[0.65em] [&_blockquote]:border-l-2 [&_blockquote]:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] [&_blockquote]:py-[0.05em] [&_blockquote]:pr-0 [&_blockquote]:pl-[0.75em] [&_blockquote]:text-[var(--muted)]",
  "[&_h1]:!mt-[0.8em] [&_h1]:!mb-[0.28em] [&_h1]:!text-[1.12em] [&_h2]:!mt-[0.75em] [&_h2]:!mb-[0.25em] [&_h2]:!text-[1.06em] [&_h3]:!mt-[0.7em] [&_h3]:!mb-[0.2em] [&_h3]:!text-[1em] [&_h4]:!mt-[0.65em] [&_h4]:!mb-[0.2em] [&_h4]:!text-[1em] [&_h1]:!font-semibold [&_h2]:!font-semibold [&_h3]:!font-semibold [&_h4]:!font-semibold",
  "[&_hr]:!hidden",
  "[&_img]:my-[0.75em] [&_img]:block [&_img]:max-h-[520px] [&_img]:max-w-[min(100%,760px)] [&_img]:rounded-[var(--radius-sm)] [&_img]:border [&_img]:border-[var(--border)] [&_img]:object-contain",
  "[&_li]:!my-[0.08em] [&_li]:!pl-[0.1em] [&_ol]:!my-[0.48em] [&_ol]:!pl-[1.25em] [&_ul]:!my-[0.48em] [&_ul]:!pl-[1.25em]",
  "[&_[data-streamdown=code-block]]:!my-1.5 [&_[data-streamdown=code-block]]:!min-h-0 [&_[data-streamdown=code-block]]:!gap-0 [&_[data-streamdown=code-block]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=code-block]]:!border-[var(--border)] [&_[data-streamdown=code-block]]:!bg-[var(--surface-soft)] [&_[data-streamdown=code-block]]:!p-0 [&_[data-streamdown=code-block]]:[contain-intrinsic-size:none]! [&_[data-streamdown=code-block]]:[content-visibility:visible]!",
  "[&_[data-streamdown=code-block-header]]:!h-5.5 [&_[data-streamdown=code-block-header]]:!min-h-5.5 [&_[data-streamdown=code-block-header]]:!px-2 [&_[data-streamdown=code-block-header]]:!text-[length:var(--text-meta)]",
  "[&_[data-streamdown=code-block-actions]]:!gap-0 [&_[data-streamdown=code-block-actions]]:!rounded-none [&_[data-streamdown=code-block-actions]]:!border-0 [&_[data-streamdown=code-block-actions]]:!bg-transparent [&_[data-streamdown=code-block-actions]]:!p-0.5 [&_[data-streamdown=code-block-copy-button]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=code-block-copy-button]]:!p-1",
  "[&_[data-streamdown=code-block-body]]:!h-auto [&_[data-streamdown=code-block-body]]:!min-h-0 [&_[data-streamdown=code-block-body]]:!max-h-[280px] [&_[data-streamdown=code-block-body]]:!overflow-auto [&_[data-streamdown=code-block-body]]:!rounded-none [&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block-body]]:!border-t [&_[data-streamdown=code-block-body]]:!border-[var(--border)] [&_[data-streamdown=code-block-body]]:!bg-[var(--canvas-bg)] [&_[data-streamdown=code-block-body]]:!p-1.75 [&_[data-streamdown=code-block-body]]:!font-[var(--font-mono)] [&_[data-streamdown=code-block-body]]:!text-[11px] [&_[data-streamdown=code-block-body]]:!leading-[1.5] max-[480px]:[&_[data-streamdown=code-block-body]]:!max-h-[220px] [&_[data-streamdown=code-block-body]_pre]:!m-0 [&_[data-streamdown=code-block-body]_pre]:!min-h-0 [&_[data-streamdown=code-block-body]_pre]:!whitespace-pre",
  "[&_[data-streamdown=inline-code]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=inline-code]]:!bg-[var(--surface-soft)] [&_[data-streamdown=inline-code]]:!px-1 [&_[data-streamdown=inline-code]]:!py-0.25 [&_[data-streamdown=inline-code]]:!text-[0.92em]",
  "[&_[data-streamdown=table-wrapper]]:!my-2.5 [&_[data-streamdown=table-wrapper]]:!gap-0.5 [&_[data-streamdown=table-wrapper]]:!rounded-[var(--radius-xs)] [&_[data-streamdown=table-wrapper]]:!bg-transparent [&_[data-streamdown=table-wrapper]]:!p-0.5",
].join(" ");

export const MESSAGE_TOOL_GROUP_CLASS =
  "group overflow-hidden rounded-none border-0 border-[color-mix(in_srgb,var(--border)_62%,transparent)] border-t bg-transparent open:bg-[color-mix(in_srgb,var(--surface-soft)_24%,transparent)]";

export const MESSAGE_TOOL_SUMMARY_CLASS =
  "grid min-h-6 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 px-0.75 py-0.5 select-none hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_54%,transparent)] [&::-webkit-details-marker]:hidden";

export const MESSAGE_TOOL_CARD_CLASS =
  "group overflow-hidden rounded-none border-0 border-[color-mix(in_srgb,var(--border)_62%,transparent)] border-t bg-transparent transition-colors open:border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] open:bg-[color-mix(in_srgb,var(--surface-soft)_24%,transparent)] motion-reduce:transition-none";

export const MESSAGE_TOOL_CARD_SUMMARY_CLASS =
  "grid min-h-5.5 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.25 px-0.75 py-0.5 select-none hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_60%,transparent)] [&::-webkit-details-marker]:hidden";

export const MESSAGE_TOOL_STATE_CLASS =
  "inline-flex items-center gap-1.25 font-mono text-[length:var(--text-meta)] font-semibold uppercase";

export const MESSAGE_TOOL_BODY_CLASS =
  "max-h-[300px] overflow-auto border-[var(--border)] border-t pt-0.5 pr-2 pb-2 pl-6.5 [scrollbar-gutter:stable] max-[760px]:pl-2.5";

export const MESSAGE_TOOL_SECTION_CLASS = "mt-2.5";

export const MESSAGE_TOOL_SECTION_HEADING_CLASS =
  "mb-1.25 flex items-center justify-between font-mono text-[length:var(--text-meta)] tracking-[0.08em] text-[var(--faint)] uppercase";

export const MESSAGE_TOOL_PAYLOAD_CLASS =
  "m-0 max-h-55 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[var(--surface-soft)] p-2.5 font-mono text-[length:var(--text-meta)] leading-[1.55] text-[var(--text-soft)]";

export const MESSAGE_AGENT_STEPS_CLASS =
  "group mt-0.75 border-[var(--border)] border-t text-[var(--muted)]";
