import { type RefObject, useEffect, useEffectEvent, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface BackgroundState {
  ariaHidden: string | null;
  element: HTMLElement;
  inert: boolean;
}

interface ModalFocusInstance {
  isSuspended: () => boolean;
}

const modalFocusInstances: ModalFocusInstance[] = [];
// Closing the top dialog can unregister it before the remaining window
// listeners run. Claiming the event keeps one keypress from cascading through
// every dialog in the stack.
const coordinatedModalKeys = new WeakSet<globalThis.KeyboardEvent>();

function registerModalFocusInstance(instance: ModalFocusInstance): () => void {
  modalFocusInstances.push(instance);
  return () => {
    const index = modalFocusInstances.indexOf(instance);
    if (index >= 0) modalFocusInstances.splice(index, 1);
  };
}

function modalKeyOwner(): ModalFocusInstance | null {
  for (let index = modalFocusInstances.length - 1; index >= 0; index -= 1) {
    const instance = modalFocusInstances[index];
    if (!instance.isSuspended()) return instance;
  }
  return null;
}

function claimModalKey(
  event: globalThis.KeyboardEvent,
  instance: ModalFocusInstance,
): boolean {
  if (coordinatedModalKeys.has(event)) return false;
  if (modalKeyOwner() !== instance) return false;
  coordinatedModalKeys.add(event);
  return true;
}

function isolateModalBackground(dialog: HTMLElement): () => void {
  const backgroundElements = new Set<HTMLElement>();
  let pathElement: HTMLElement | null = dialog;

  while (pathElement && pathElement !== document.body) {
    const parent: HTMLElement | null = pathElement.parentElement;
    if (!parent) break;
    for (const sibling of parent.children) {
      if (
        sibling instanceof HTMLElement &&
        sibling !== pathElement &&
        !sibling.contains(dialog)
      ) {
        backgroundElements.add(sibling);
      }
    }
    pathElement = parent;
  }

  const background: BackgroundState[] = Array.from(backgroundElements).map(
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
      if (entry.ariaHidden === null) {
        entry.element.removeAttribute("aria-hidden");
      } else {
        entry.element.setAttribute("aria-hidden", entry.ariaHidden);
      }
    }
  };
}

export function useModalFocusBoundary<T extends HTMLElement = HTMLDivElement>({
  active,
  dialogRef: providedDialogRef,
  initialFocusRef,
  initialFocusSelector,
  isolationBoundaryRef,
  isolateBackground = false,
  onClose,
  restoreFocus,
  restoreFocusRef,
  restoreFocusTarget,
  suspended = false,
  trapFocus = true,
}: {
  active: boolean;
  dialogRef?: RefObject<T | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  initialFocusSelector?: string;
  isolationBoundaryRef?: RefObject<HTMLElement | null>;
  isolateBackground?: boolean;
  onClose: () => void;
  restoreFocus: boolean;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  restoreFocusTarget?: HTMLElement | null;
  suspended?: boolean;
  trapFocus?: boolean;
}): RefObject<T | null> {
  const fallbackDialogRef = useRef<T | null>(null);
  const dialogRef = providedDialogRef ?? fallbackDialogRef;
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  const close = useEffectEvent(onClose);
  const readSuspended = useEffectEvent(() => suspended);

  const restorePreviousFocus = () => {
    const previousFocus = previousFocusRef.current;
    previousFocusRef.current = null;
    const restoreTarget =
      restoreFocusTarget ?? restoreFocusRef?.current ?? previousFocus;
    if (restoreFocus && restoreTarget?.isConnected) {
      requestAnimationFrame(() => restoreTarget.focus());
    }
  };
  const restoreOnUnmount = useEffectEvent(restorePreviousFocus);

  useEffect(() => {
    return () => {
      if (wasActive.current) restoreOnUnmount();
    };
  }, []);

  useEffect(() => {
    if (!active) return;

    if (!wasActive.current) {
      wasActive.current = true;
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }

    const dialog = dialogRef.current;
    const isolationBoundary = isolationBoundaryRef?.current ?? dialog;
    const restoreBackground =
      isolateBackground && isolationBoundary
        ? isolateModalBackground(isolationBoundary)
        : () => undefined;
    const instance: ModalFocusInstance = {
      isSuspended: () => readSuspended(),
    };
    const unregister = registerModalFocusInstance(instance);

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!claimModalKey(event, instance)) return;
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !trapFocus) return;
      if (!claimModalKey(event, instance)) return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      ).filter((element) => !element.hasAttribute("hidden"));
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
      const initialFocus =
        initialFocusRef?.current ??
        (initialFocusSelector
          ? dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)
          : null);
      (initialFocus ?? dialogRef.current)?.focus();
    });

    return () => {
      unregister();
      window.removeEventListener("keydown", handleKeyDown);
      restoreBackground();
    };
  }, [
    active,
    dialogRef,
    initialFocusRef,
    initialFocusSelector,
    isolateBackground,
    isolationBoundaryRef,
    trapFocus,
  ]);

  useEffect(() => {
    if (active || !wasActive.current) return;
    wasActive.current = false;

    const restoreTarget =
      restoreFocusTarget ??
      restoreFocusRef?.current ??
      previousFocusRef.current;
    previousFocusRef.current = null;
    if (restoreFocus && restoreTarget?.isConnected) {
      requestAnimationFrame(() => restoreTarget.focus());
    }
  }, [active, restoreFocus, restoreFocusRef, restoreFocusTarget]);

  return dialogRef;
}
