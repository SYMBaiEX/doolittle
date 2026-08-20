import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import type { ComponentProps } from "react";

const buttonTone = {
  default:
    "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-soft)] hover:border-[color-mix(in_srgb,var(--accent)_56%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent-soft)_72%,var(--surface-raised))] hover:text-[var(--text)]",
  primary:
    "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] hover:border-[var(--accent)] hover:bg-[var(--accent)]",
  danger:
    "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-soft)] hover:border-[color-mix(in_srgb,var(--bad)_55%,var(--border))] hover:bg-[color-mix(in_srgb,var(--bad-soft)_50%,var(--surface-raised))] hover:text-[var(--bad)]",
} as const;

export function GitButton({
  className = "",
  current = false,
  tone = "default",
  ...props
}: ComponentProps<typeof Button> & {
  current?: boolean;
  tone?: keyof typeof buttonTone;
}) {
  return (
    <Button
      className={`h-auto min-h-6 rounded-[var(--radius-xs,5px)] border px-1.75 py-0.75 text-[10px] font-bold focus-visible:border-[color-mix(in_srgb,var(--accent)_72%,var(--border))] focus-visible:outline-2 focus-visible:outline-[color-mix(in_srgb,var(--accent)_72%,transparent)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-52 ${buttonTone[tone]} ${
        current
          ? "border-[color-mix(in_srgb,var(--accent)_56%,var(--border))] bg-[color-mix(in_srgb,var(--accent-soft)_72%,var(--surface-raised))] text-[var(--text)]"
          : ""
      } ${className}`}
      size="sm"
      {...props}
    />
  );
}

export function GitInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      className="h-auto min-h-0 w-full rounded-[var(--radius-xs,5px)] border-[var(--border)] bg-[var(--surface)] px-1.75 py-1.5 font-mono text-[10px] text-[var(--text)] focus-visible:border-[color-mix(in_srgb,var(--accent)_72%,var(--border))] focus-visible:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
      density="compact"
      {...props}
    />
  );
}

export function GitTextarea(props: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className="min-h-14.5 w-full resize-y rounded-[var(--radius-xs,5px)] border-[var(--border)] bg-[var(--surface)] px-1.75 py-1.5 font-mono text-[10px] text-[var(--text)] focus-visible:border-[color-mix(in_srgb,var(--accent)_72%,var(--border))] focus-visible:ring-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
      {...props}
    />
  );
}

export const GIT_SECTION_CLASS =
  "grid gap-1.75 rounded-[var(--radius-xs,5px)] border border-[var(--border)] bg-[var(--surface-raised)] p-2.25";

export const GIT_SECTION_HEADER_CLASS =
  "flex min-w-0 items-center justify-start gap-1.5 [&_strong]:font-bold [&_strong]:font-mono [&_strong]:text-[10px] [&_strong]:text-[var(--text-soft)] [&_strong]:uppercase [&_strong]:tracking-[0.06em] [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)]";

export const GIT_LIST_CLASS = "m-0 grid min-w-0 list-none gap-1 p-0";

export const GIT_ROW_CLASS = "flex min-w-0 items-center gap-1.5";

export const GIT_CODE_CLASS =
  "truncate font-mono text-[length:var(--text-meta)] text-[var(--text-soft)]";
