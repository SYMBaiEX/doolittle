import { cn } from "@elizaos/ui/lib/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import {
  type ButtonProps,
  Button as ElizaButton,
} from "../../../../../node_modules/@elizaos/ui/components/ui/button.js";
import {
  Input as ElizaInput,
  type InputProps,
} from "../../../../../node_modules/@elizaos/ui/components/ui/input.js";
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
} from "../../../../../node_modules/@elizaos/ui/components/ui/select.js";
import {
  Textarea as ElizaTextarea,
  type TextareaProps,
} from "../../../../../node_modules/@elizaos/ui/components/ui/textarea.js";

/**
 * Desktop-only density bridge for the official Eliza controls.
 *
 * The upstream primitives default to 40px controls. Ordinary renderer
 * controls consume Doolittle's shared desktop control-height token (32px
 * comfortable / 28px compact) and retain a 36px mobile target. Explicit
 * Eliza size/density variants keep their upstream geometry.
 */
const standardControlClass =
  "!h-[var(--control-height)] !min-h-[var(--control-height)] !text-[length:var(--text-control)] max-[760px]:!h-9 max-[760px]:!min-h-9";

// Text entry needs room to compose; do not collapse it to a one-line control.
const textareaControlClass =
  "[--doolittle-textarea-min-height:calc(var(--control-height)*2)] !min-h-[var(--doolittle-textarea-min-height)] !text-[length:var(--text-body)] max-[760px]:[--doolittle-textarea-min-height:72px]";

export const ELIZA_SELECT_TEXT_CLASS = "!text-[length:var(--text-control)]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, ...props }, ref) => {
    const standard = size === undefined || size === "default";
    return (
      <ElizaButton
        {...props}
        className={cn(standard ? standardControlClass : undefined, className)}
        ref={ref}
        size={size}
      />
    );
  },
);
Button.displayName = "DoolittleButton";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, density, ...props }, ref) => {
    const standard = density === undefined || density === "default";
    return (
      <ElizaInput
        {...props}
        className={cn(standard ? standardControlClass : undefined, className)}
        density={density}
        ref={ref}
      />
    );
  },
);
Input.displayName = "DoolittleInput";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, density, ...props }, ref) => (
    <ElizaTextarea
      {...props}
      className={cn(
        density === undefined || density === "default"
          ? textareaControlClass
          : undefined,
        className,
      )}
      density={density}
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
    className={cn(standardControlClass, className)}
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
