// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSettingsPanel } from "./DesktopSettingsPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("DesktopSettingsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps lifecycle controls disabled until shell state is available", () => {
    act(() =>
      root.render(
        <DesktopSettingsPanel
          lifecycle={null}
          onBackgroundChange={vi.fn()}
          onCheckUpdates={vi.fn()}
          onDownloadUpdate={vi.fn()}
          onInstallUpdate={vi.fn()}
          update={null}
          updateBusy={false}
        />,
      ),
    );

    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain("Loading update status…");
  });

  it("forwards lifecycle and downloaded-update actions", () => {
    const onBackgroundChange = vi.fn();
    const onInstallUpdate = vi.fn();
    act(() =>
      root.render(
        <DesktopSettingsPanel
          lifecycle={{ keepRunningInBackground: false }}
          onBackgroundChange={onBackgroundChange}
          onCheckUpdates={vi.fn()}
          onDownloadUpdate={vi.fn()}
          onInstallUpdate={onInstallUpdate}
          update={{ phase: "downloaded", message: "Ready to install" }}
          updateBusy={false}
        />,
      ),
    );

    const background = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    act(() => {
      background?.click();
      container.querySelector<HTMLButtonElement>(".primary-button")?.click();
    });

    expect(onBackgroundChange).toHaveBeenCalledWith(true);
    expect(onInstallUpdate).toHaveBeenCalledOnce();
  });
});
