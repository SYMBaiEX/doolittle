import { Button as ElizaButton } from "@elizaos/ui/button";
import {
  SelectContent as ElizaSelectContent,
  SelectItem as ElizaSelectItem,
  SelectTrigger as ElizaSelectTrigger,
  Select,
  SelectGroup,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
} from "@elizaos/ui/components/ui/select";
import { Textarea as ElizaTextarea } from "@elizaos/ui/components/ui/textarea";
import { Input as ElizaInput } from "@elizaos/ui/input";
import { cn } from "@elizaos/ui/lib/utils";
import type { ComponentPropsWithRef } from "react";

/**
 * Browser-safe density bridge for the official Eliza controls.
 *
 * The upstream primitives default to 40px controls. Ordinary renderer
 * controls consume Doolittle's shared desktop control-height token (40px
 * comfortable / 36px compact) and retain a 44px mobile target. Explicit
 * Eliza size/density variants keep their upstream geometry.
 */
const standardControlClass =
  "!h-[var(--control-height)] !min-h-[var(--control-height)] !text-[length:var(--text-control)] max-[760px]:!h-11 max-[760px]:!min-h-11";

const controlClass =
  "dl-control rounded-[var(--radius-md)] transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out)] motion-reduce:transition-none disabled:cursor-not-allowed";

const fieldControlClass = `${controlClass} dl-field border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)] placeholder:text-[var(--muted)] aria-invalid:border-[var(--bad)]`;
const invalidFieldClass = "border-[var(--bad)] bg-[var(--bad-soft)]";

// Text entry needs room to compose; do not collapse it to a one-line control.
const textareaControlClass =
  "[--doolittle-textarea-min-height:calc(var(--control-height)*2)] !min-h-[var(--doolittle-textarea-min-height)] !text-[length:var(--text-body)] max-[760px]:[--doolittle-textarea-min-height:72px]";

export const ELIZA_SELECT_TEXT_CLASS = "!text-[length:var(--text-control)]";

export function Button({
  className,
  size,
  variant = "default",
  ...props
}: ComponentPropsWithRef<typeof ElizaButton>) {
  const standard = size === undefined || size === "default";
  const quiet = variant === "ghost" || variant === "link";
  return (
    <ElizaButton
      {...props}
      className={cn(
        "dl-button",
        controlClass,
        standard && standardControlClass,
        !quiet && "border border-[var(--border)]",
        variant === "default" &&
          "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]",
        variant === "destructive" &&
          "bg-[var(--bad)] text-[var(--destructive-foreground)] hover:border-[var(--bad)] hover:bg-[var(--bad)]",
        className,
      )}
      size={size}
      variant={variant}
    />
  );
}

export function Input({
  className,
  density,
  hasError,
  ...props
}: ComponentPropsWithRef<typeof ElizaInput>) {
  return (
    <ElizaInput
      {...props}
      aria-invalid={props["aria-invalid"] ?? (hasError || undefined)}
      className={cn(
        fieldControlClass,
        (density === undefined || density === "default") &&
          standardControlClass,
        hasError && invalidFieldClass,
        className,
      )}
      density={density}
      hasError={hasError}
    />
  );
}

export function Textarea({
  className,
  density,
  hasError,
  ...props
}: ComponentPropsWithRef<typeof ElizaTextarea>) {
  return (
    <ElizaTextarea
      {...props}
      aria-invalid={props["aria-invalid"] ?? (hasError || undefined)}
      className={cn(
        fieldControlClass,
        (density === undefined || density === "default") &&
          textareaControlClass,
        hasError && invalidFieldClass,
        className,
      )}
      density={density}
      hasError={hasError}
    />
  );
}

/** Native select for host-owned menus; retains OS keyboard and accessibility behavior. */
export function NativeSelect({
  className,
  ...props
}: ComponentPropsWithRef<"select">) {
  return (
    <select
      {...props}
      className={cn(
        fieldControlClass,
        standardControlClass,
        "border px-2",
        className,
      )}
    />
  );
}

export function SelectTrigger({
  className,
  ...props
}: ComponentPropsWithRef<typeof ElizaSelectTrigger>) {
  return (
    <ElizaSelectTrigger
      {...props}
      className={cn(fieldControlClass, standardControlClass, className)}
    />
  );
}

export function SelectItem({
  className,
  ...props
}: ComponentPropsWithRef<typeof ElizaSelectItem>) {
  return (
    <ElizaSelectItem
      {...props}
      className={cn("dl-select-item", ELIZA_SELECT_TEXT_CLASS, className)}
    />
  );
}

/** Keep SDK collision, portal and keyboard behavior with Doolittle's material. */
export function SelectContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof ElizaSelectContent>) {
  return (
    <ElizaSelectContent
      {...props}
      className={cn("dl-select-content", className)}
    />
  );
}

export {
  Select,
  SelectGroup,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
};
