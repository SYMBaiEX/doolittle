import { type RefObject, useEffect, useEffectEvent, useRef } from "react";

function isFocusable(element: HTMLElement): boolean {
  return !element.hasAttribute("disabled") && !element.hasAttribute("hidden");
}

export function shouldHandleDialogKey(
  key: string,
  suspended: boolean,
): boolean {
  return !suspended && (key === "Escape" || key === "Tab");
}

export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  suspended = false,
): void {
  const previousFocus = useRef<HTMLElement | null>(null);
  const handleDialogKey = useEffectEvent((event: KeyboardEvent) => {
    if (!shouldHandleDialogKey(event.key, suspended)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter(isFocusable);
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialogRef.current?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    requestAnimationFrame(
      () => initialFocusRef.current?.focus() ?? dialogRef.current?.focus(),
    );
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      window.removeEventListener("keydown", handleDialogKey);
      const previous = previousFocus.current;
      previousFocus.current = null;
      if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
    };
  }, [dialogRef, initialFocusRef, open]);
}
