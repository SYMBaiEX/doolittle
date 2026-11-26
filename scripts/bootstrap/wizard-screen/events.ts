import type blessed from "blessed";

type ProgramEmit = (eventName: string | symbol, ...args: unknown[]) => boolean;
type ProgramEmitter = { emit: ProgramEmit };

export interface WizardInputLock {
  setLocked: (locked: boolean) => void;
}

function isWizardInputEvent(eventName: string | symbol): boolean {
  return (
    typeof eventName === "string" &&
    (eventName === "keypress" ||
      eventName === "mouse" ||
      eventName.startsWith("key "))
  );
}

function isWizardAbortKey(
  eventName: string | symbol,
  args: unknown[],
): boolean {
  if (eventName === "key C-c") {
    return true;
  }
  if (eventName !== "keypress") {
    return false;
  }
  const key = args[1] as { full?: unknown } | undefined;
  return key?.full === "C-c";
}

/**
 * Blessed direct key bindings are registered on the program rather than the
 * focused element, so lockKeys/focus changes alone cannot suspend a modal's
 * Enter/Escape handlers. While the too-small replacement surface is active we
 * filter input events at the program emitter instead, leaving only Ctrl-C
 * through for the global abort path. Output events such as resize are untouched.
 */
export function createWizardInputLock(
  screen: blessed.Widgets.Screen,
): WizardInputLock {
  const program = screen.program as unknown as ProgramEmitter;
  const originalEmit = program.emit;
  let locked = false;

  const filteringEmit = function (
    this: ProgramEmitter,
    eventName: string | symbol,
    ...args: unknown[]
  ): boolean {
    if (
      locked &&
      isWizardInputEvent(eventName) &&
      !isWizardAbortKey(eventName, args)
    ) {
      return false;
    }
    return originalEmit.call(this, eventName, ...args);
  };

  return {
    setLocked(nextLocked) {
      if (locked === nextLocked) {
        return;
      }
      locked = nextLocked;
      program.emit = locked ? filteringEmit : originalEmit;
    },
  };
}

export interface WizardScreenEventHandlers {
  onResize: () => void;
  onWarning: (warning: unknown) => void;
  onAbort: () => void;
}

export function installWizardScreenEvents(
  screen: blessed.Widgets.Screen,
  handlers: WizardScreenEventHandlers,
): void {
  screen.on("resize", handlers.onResize);
  screen.on("warning", handlers.onWarning);
  screen.key(["C-c"], () => {
    screen.destroy();
    handlers.onAbort();
  });
}
