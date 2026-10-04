import { type ButtonProps, Button as ElizaButton } from "@elizaos/ui/button";
import {
  SelectItem as ElizaSelectItem,
  SelectLabel as ElizaSelectLabel,
  SelectTrigger as ElizaSelectTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
} from "@elizaos/ui/components/ui/select";
import {
  Textarea as ElizaTextarea,
  type TextareaProps,
} from "@elizaos/ui/components/ui/textarea";
import { Input as ElizaInput, type InputProps } from "@elizaos/ui/input";
import { cn } from "@elizaos/ui/lib/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

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

const focusControlClass =
  "rounded-[var(--radius-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] motion-reduce:transition-none disabled:cursor-not-allowed";

const fieldControlClass =
  "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)] placeholder:text-[var(--muted)] focus-visible:border-[var(--focus-ring)] aria-invalid:border-[var(--bad)]";

// Text entry needs room to compose; do not collapse it to a one-line control.
const textareaControlClass =
  "[--doolittle-textarea-min-height:calc(var(--control-height)*2)] !min-h-[var(--doolittle-textarea-min-height)] !text-[length:var(--text-body)] max-[760px]:[--doolittle-textarea-min-height:72px]";

export const ELIZA_SELECT_TEXT_CLASS = "!text-[length:var(--text-control)]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant = "default", ...props }, ref) => {
    const standard = size === undefined || size === "default";
    const quiet = variant === "ghost" || variant === "link";
    return (
      <ElizaButton
        {...props}
        className={cn(
          focusControlClass,
          standard ? standardControlClass : undefined,
          !quiet &&
            "border border-[var(--border)] shadow-[var(--control-contact)] active:shadow-none",
          variant === "default" &&
            "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)]",
          variant === "destructive" &&
            "bg-[var(--bad)] text-[var(--destructive-foreground)] hover:border-[var(--bad)] hover:bg-[var(--bad)]",
          className,
        )}
        ref={ref}
        size={size}
        variant={variant}
      />
    );
  },
);
Button.displayName = "DoolittleButton";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, density, hasError, ...props }, ref) => {
    const standard = density === undefined || density === "default";
    return (
      <ElizaInput
        {...props}
        aria-invalid={props["aria-invalid"] ?? (hasError || undefined)}
        className={cn(
          focusControlClass,
          fieldControlClass,
          standard ? standardControlClass : undefined,
          hasError && "border-[var(--bad)] bg-[var(--bad-soft)]",
          className,
        )}
        density={density}
        hasError={hasError}
        ref={ref}
      />
    );
  },
);
Input.displayName = "DoolittleInput";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, density, hasError, ...props }, ref) => (
    <ElizaTextarea
      {...props}
      aria-invalid={props["aria-invalid"] ?? (hasError || undefined)}
      className={cn(
        focusControlClass,
        fieldControlClass,
        density === undefined || density === "default"
          ? textareaControlClass
          : undefined,
        hasError && "border-[var(--bad)] bg-[var(--bad-soft)]",
        className,
      )}
      density={density}
      hasError={hasError}
      ref={ref}
    />
  ),
);
Textarea.displayName = "DoolittleTextarea";

export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof ElizaSelectTrigger>
>(({ className, ...props }, ref) => (
  <ElizaSelectTrigger
    {...props}
    className={cn(
      focusControlClass,
      fieldControlClass,
      standardControlClass,
      className,
    )}
    ref={ref}
  />
));
SelectTrigger.displayName = "DoolittleSelectTrigger";

export const SelectItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ElizaSelectItem>
>(({ className, ...props }, ref) => (
  <ElizaSelectItem
    {...props}
    className={cn(ELIZA_SELECT_TEXT_CLASS, className)}
    ref={ref}
  />
));
SelectItem.displayName = "DoolittleSelectItem";

export const SelectLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ElizaSelectLabel>
>(({ className, ...props }, ref) => (
  <ElizaSelectLabel
    {...props}
    className={cn(ELIZA_SELECT_TEXT_CLASS, className)}
    ref={ref}
  />
));
SelectLabel.displayName = "DoolittleSelectLabel";

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
};
