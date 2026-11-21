import type { UiTarget } from "@doolittle/contracts/ui-host";
import type {
  DesktopUiInterfaceBridge,
  UiInterfaceState,
} from "../../shared/ui-interface";

export function observeNativeChatSelection(
  bridge: Pick<
    DesktopUiInterfaceBridge,
    "getSelection" | "getState" | "onState" | "onSurface"
  >,
  callbacks: {
    selectionRevision: () => number;
    restore: (target: UiTarget) => void;
    reveal: (target: UiTarget) => void;
    ready: () => void;
  },
) {
  let disposed = false;
  let generation = 0;
  let mode: UiInterfaceState["mode"] | undefined;

  const restoreSelection = () => {
    const request = ++generation;
    const revision = callbacks.selectionRevision();
    void bridge
      .getSelection()
      .then((target) => {
        if (
          !disposed &&
          request === generation &&
          revision === callbacks.selectionRevision() &&
          target
        ) {
          callbacks.restore(target);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!disposed && request === generation) callbacks.ready();
      });
  };

  const detachSurface = bridge.onSurface(({ target }) => {
    generation++;
    callbacks.reveal(target);
    callbacks.ready();
  });
  const detachState = bridge.onState((state) => {
    const previousMode = mode;
    mode = state.mode;
    if (mode === previousMode) return;

    if (mode !== "default") {
      generation++;
      callbacks.ready();
    } else if (previousMode) {
      // Re-entering the native interface can adopt the host's selection.
      // Inventory notifications within it must leave local drafts selected.
      restoreSelection();
    }
  });
  restoreSelection();
  void bridge
    .getState("presentation")
    .then((state) => {
      if (!disposed) mode ??= state.mode;
    })
    .catch(() => undefined);

  return () => {
    disposed = true;
    detachState();
    detachSurface();
  };
}
