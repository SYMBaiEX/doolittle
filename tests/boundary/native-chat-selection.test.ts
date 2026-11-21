import type { UiTarget } from "@doolittle/contracts/ui-host";
import { expect, it, vi } from "vitest";
import { observeNativeChatSelection } from "../../apps/desktop/src/renderer/interfaces/native-chat-selection";
import type {
  DesktopUiInterfaceBridge,
  UiInterfaceState,
} from "../../apps/desktop/src/shared/ui-interface";

const saved = { botId: "scout", sessionId: "saved-chat" };
const draft = { botId: "lead", sessionId: "unsent-draft" };

function state(mode: UiInterfaceState["mode"]): UiInterfaceState {
  return { mode, installed: [], safeMode: false };
}

function fixture(
  getSelection: () => Promise<UiTarget | undefined>,
  initialMode: UiInterfaceState["mode"] = "default",
) {
  let stateListener:
    | Parameters<DesktopUiInterfaceBridge["onState"]>[0]
    | undefined;
  let surfaceListener:
    | Parameters<DesktopUiInterfaceBridge["onSurface"]>[0]
    | undefined;
  let selected: UiTarget | undefined;
  let revision = 0;
  const callbacks = {
    selectionRevision: () => revision,
    restore: vi.fn((target: UiTarget) => {
      selected = target;
    }),
    reveal: vi.fn((target: UiTarget) => {
      selected = target;
      revision++;
    }),
    ready: vi.fn(),
  };
  const bridge = {
    getSelection: vi.fn(getSelection),
    getState: vi.fn(async () => state(initialMode)),
    onState: (listener: typeof stateListener) => {
      stateListener = listener;
      return () => {
        stateListener = undefined;
      };
    },
    onSurface: (listener: typeof surfaceListener) => {
      surfaceListener = listener;
      return () => {
        surfaceListener = undefined;
      };
    },
  };
  return {
    bridge,
    callbacks,
    current: () => selected,
    selectDraft() {
      selected = draft;
      revision++;
    },
    notify: (mode: UiInterfaceState["mode"]) => stateListener?.(state(mode)),
    reveal: (target: UiTarget) =>
      surfaceListener?.({ target, surface: "details" }),
    watch: () => observeNativeChatSelection(bridge, callbacks),
  };
}

it("keeps an unsent bot draft selected when the default interface refreshes", async () => {
  const profile = fixture(async () => saved);
  const detach = profile.watch();
  await vi.waitFor(() => expect(profile.current()).toEqual(saved));
  profile.selectDraft();
  profile.notify("default");
  profile.notify("default");
  expect(profile.current()).toEqual(draft);
  expect(profile.bridge.getSelection).toHaveBeenCalledTimes(1);
  expect(profile.bridge.getState).toHaveBeenCalledExactlyOnceWith(
    "presentation",
  );
  detach();
});

it("restores the host selection when returning from a previously active interface", async () => {
  const profile = fixture(async () => saved, "trusted-react");
  const detach = profile.watch();
  await vi.waitFor(() =>
    expect(profile.callbacks.ready).toHaveBeenCalledOnce(),
  );
  profile.selectDraft();
  profile.notify("default");
  profile.notify("default");
  await vi.waitFor(() => expect(profile.current()).toEqual(saved));
  expect(profile.bridge.getSelection).toHaveBeenCalledTimes(2);
  detach();
});

it("drops an initial selection response that races with a user's selection", async () => {
  let resolveSelection: (target: UiTarget) => void = () => undefined;
  const pending = new Promise<UiTarget>((resolve) => {
    resolveSelection = resolve;
  });
  const profile = fixture(() => pending);
  const detach = profile.watch();
  profile.notify("default");
  profile.selectDraft();
  resolveSelection(saved);
  await vi.waitFor(() =>
    expect(profile.callbacks.ready).toHaveBeenCalledOnce(),
  );
  expect(profile.current()).toEqual(draft);
  expect(profile.callbacks.restore).not.toHaveBeenCalled();
  detach();
});

it("opens an explicitly requested native surface and remains usable after a failed restore", async () => {
  const profile = fixture(async () => {
    throw new Error("Desktop host unavailable");
  });
  const detach = profile.watch();
  await vi.waitFor(() =>
    expect(profile.callbacks.ready).toHaveBeenCalledOnce(),
  );
  const target = { botId: "lead", sessionId: "host-surface" };
  profile.reveal(target);
  expect(profile.current()).toEqual(target);
  expect(profile.callbacks.reveal).toHaveBeenCalledExactlyOnceWith(target);
  detach();
  profile.reveal(saved);
  expect(profile.current()).toEqual(target);
});
