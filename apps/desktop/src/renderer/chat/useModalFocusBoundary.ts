import { type RefObject, useEffect, useEffectEvent, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocusBoundary({
  active,
  initialFocusSelector,
  onClose,
  restoreFocus,
  restoreFocusRef,
}: {
  active: boolean;
  initialFocusSelector?: string;
  onClose: () => void;
  restoreFocus: boolean;
  restoreFocusRef: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(false);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!active) return;
    wasActive.current = true;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      );
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
    };

    window.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      const initialFocus = initialFocusSelector
        ? dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      (initialFocus ?? dialogRef.current)?.focus();
    });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, initialFocusSelector]);

  useEffect(() => {
    if (active || !wasActive.current) return;
    wasActive.current = false;
    if (restoreFocus) {
      requestAnimationFrame(() => restoreFocusRef.current?.focus());
    }
  }, [active, restoreFocus, restoreFocusRef]);

  return dialogRef;
}
