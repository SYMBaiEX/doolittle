export const MESSAGE_RESPONSE_CLASS =
  "min-w-0 text-inherit [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_a]:text-[color-mix(in_srgb,var(--accent)_86%,var(--text))] [&_a]:underline [&_a]:decoration-[color-mix(in_srgb,var(--accent)_36%,transparent)] [&_a]:decoration-1 [&_a]:underline-offset-3 hover:[&_a]:decoration-current [&_blockquote]:border-l-2 [&_blockquote]:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] [&_blockquote]:py-[0.1em] [&_blockquote]:pr-0 [&_blockquote]:pl-[1em] [&_blockquote]:text-[var(--muted)] [&_h1]:text-[1.55em] [&_h2]:border-b [&_h2]:border-[var(--border)] [&_h2]:pb-[0.34em] [&_h2]:text-[1.28em] [&_h3]:text-[1.08em] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:my-[1.2em] [&_hr]:h-px [&_hr]:border-0 [&_hr]:bg-[var(--border)] [&_img]:my-[0.8em] [&_img]:block [&_img]:max-h-[520px] [&_img]:max-w-[min(100%,760px)] [&_img]:rounded-lg [&_img]:border [&_img]:border-[var(--border)] [&_img]:object-contain [&_li]:my-[0.28em] [&_li]:pl-[0.16em] [&_ol]:pl-[1.45em] [&_ul]:pl-[1.45em]";

export const MESSAGE_TOOL_GROUP_CLASS =
  "group overflow-hidden rounded-none border-0 border-[color-mix(in_srgb,var(--border)_62%,transparent)] border-t bg-transparent open:bg-[color-mix(in_srgb,var(--surface-soft)_24%,transparent)]";

export const MESSAGE_TOOL_SUMMARY_CLASS =
  "grid min-h-6 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 px-0.75 py-0.5 select-none hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[color-mix(in_srgb,var(--accent)_54%,transparent)] [&::-webkit-details-marker]:hidden";

export const MESSAGE_TOOL_CARD_CLASS =
  "group overflow-hidden rounded-none border-0 border-[color-mix(in_srgb,var(--border)_62%,transparent)] border-t bg-transparent transition-colors open:border-[color-mix(in_srgb,var(--accent)_18%,var(--border))] open:bg-[color-mix(in_srgb,var(--surface-soft)_24%,transparent)] motion-reduce:transition-none";

export const MESSAGE_TOOL_CARD_SUMMARY_CLASS =
  "grid min-h-5.5 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.25 px-0.75 py-0.5 select-none hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_60%,transparent)] [&::-webkit-details-marker]:hidden";

export const MESSAGE_TOOL_STATE_CLASS =
  "inline-flex items-center gap-1.25 font-mono text-[7px] font-semibold uppercase";

export const MESSAGE_TOOL_BODY_CLASS =
  "max-h-[300px] overflow-auto border-[var(--border)] border-t pt-0.5 pr-2 pb-2 pl-6.5 [scrollbar-gutter:stable] max-[760px]:pl-2.5";

export const MESSAGE_TOOL_SECTION_CLASS = "mt-2.5";

export const MESSAGE_TOOL_SECTION_HEADING_CLASS =
  "mb-1.25 flex items-center justify-between font-mono text-[8px] tracking-[0.08em] text-[var(--faint)] uppercase";

export const MESSAGE_TOOL_PAYLOAD_CLASS =
  "m-0 max-h-55 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_86%,black)] p-2.5 font-mono text-[9px] leading-[1.55] text-[var(--text-soft)]";

export const MESSAGE_AGENT_STEPS_CLASS =
  "group mt-0.75 border-[var(--border)] border-t text-[var(--muted)]";
