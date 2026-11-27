// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopSettingsPanel } from "../../apps/desktop/src/renderer/settings/DesktopSettingsPanel";
import type { DesktopUpdateState } from "../../apps/desktop/src/shared/contracts";

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);

afterEach(() => {
  vi.unstubAllGlobals();
});

async function render(update: DesktopUpdateState, onDownloadUpdate = vi.fn()) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () =>
    root.render(
      <DesktopSettingsPanel
        lifecycle={{ keepRunningInBackground: false }}
        update={update}
        updateBusy={false}
        onBackgroundChange={() => {}}
        onCheckUpdates={() => {}}
        onDownloadUpdate={onDownloadUpdate}
        onInstallUpdate={() => {}}
      />,
    ),
  );
  return onDownloadUpdate;
}

it("offers a direct retry when a known update download fails", async () => {
  const onDownloadUpdate = await render({
    phase: "error",
    version: "1.0.0",
    message: "The update download failed.",
  });
  const retry = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Retry download",
  );
  expect(retry).toBeTruthy();
  await act(async () => retry?.click());
  expect(onDownloadUpdate).toHaveBeenCalledTimes(1);
});

it("does not offer a download retry when a check failed before naming an update", async () => {
  await render({
    phase: "error",
    message: "The update check failed.",
  });
  expect(
    Array.from(container.querySelectorAll("button")).some(
      (button) => button.textContent === "Retry download",
    ),
  ).toBe(false);
});
