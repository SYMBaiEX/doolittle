import { type RefObject, useEffect, useEffectEvent, useRef } from "react";

interface BackgroundState {
  ariaHidden: string | null;
  element: HTMLElement;
  inert: boolean;
}

function isolateDialogBackground(boundary: HTMLElement): () => void {
  const backgroundElements = new Set<HTMLElement>();
  let pathElement: HTMLElement | null = boundary;

  while (pathElement && pathElement !== document.body) {
    const parent: HTMLElement | null = pathElement.parentElement;
    if (!parent) break;
    for (const sibling of parent.children) {
      if (sibling instanceof HTMLElement && sibling !== pathElement) {
        backgroundElements.add(sibling);
      }
    }
    pathElement = parent;
  }

  const background: BackgroundState[] = [...backgroundElements].map(
    (element) => ({
      ariaHidden: element.getAttribute("aria-hidden"),
      element,
      inert: element.inert,
    }),
  );
  for (const entry of background) {
    entry.element.inert = true;
    entry.element.setAttribute("aria-hidden", "true");
  }
  return () => {
    for (const entry of background) {
      entry.element.inert = entry.inert;
      if (entry.ariaHidden === null)
        entry.element.removeAttribute("aria-hidden");
      else entry.element.setAttribute("aria-hidden", entry.ariaHidden);
    }
  };
}

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
  isolationBoundaryRef?: RefObject<HTMLElement | null>,
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
    const restoreBackground = isolationBoundaryRef?.current
      ? isolateDialogBackground(isolationBoundaryRef.current)
      : () => undefined;
    requestAnimationFrame(() => {
      const initialFocus = initialFocusRef.current;
      if (initialFocus) initialFocus.focus();
      else dialogRef.current?.focus();
    });
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      window.removeEventListener("keydown", handleDialogKey);
      restoreBackground();
      const previous = previousFocus.current;
      previousFocus.current = null;
      if (previous?.isConnected) requestAnimationFrame(() => previous.focus());
    };
  }, [dialogRef, initialFocusRef, isolationBoundaryRef, open]);
}
