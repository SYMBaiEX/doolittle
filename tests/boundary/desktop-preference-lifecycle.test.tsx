// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useDesktopPreferences } from "../../apps/desktop/src/renderer/settings/use-desktop-preferences";
import type { DesktopUpdateState } from "../../apps/desktop/src/shared/contracts";

function Preferences({ visible }: { visible: boolean }) {
  const preferences = useDesktopPreferences(visible);
  return (
    <button
      disabled={preferences.updateBusy}
      onClick={preferences.onInstallUpdate}
      type="button"
    >
      {preferences.update?.message}
    </button>
  );
}

it("recovers an installation failure while another settings section is open", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let update: DesktopUpdateState = { phase: "downloaded", message: "Ready" };
  const listeners = new Set<(state: DesktopUpdateState) => void>();
  vi.stubGlobal("doolittle", {
    getLifecycleState: async () => ({ keepRunningInBackground: true }),
    getUpdateState: async () => update,
    installUpdate: vi.fn().mockResolvedValue(undefined),
    onUpdateState: (listener: (state: DesktopUpdateState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Preferences visible />));
    const button = container.querySelector("button");
    await act(async () => button?.click());
    expect(button?.disabled).toBe(true);

    await act(async () => root.render(<Preferences visible={false} />));
    expect(listeners.size).toBe(1);

    act(() => {
      update = { phase: "error", message: "Install failed" };
      for (const listener of listeners) listener(update);
    });
    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toBe("Install failed");
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
