// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BackendState } from "../../shared/contracts";
import { DesktopWindowTools } from "./DesktopWindowTools";

const backend: BackendState = {
  message: "Runtime ready",
  phase: "ready",
};

function renderTools(utilityOpen: boolean): string {
  return renderToStaticMarkup(
    <DesktopWindowTools
      backend={backend}
      onOpenPalette={() => undefined}
      onOpenSettings={() => undefined}
      onRefresh={() => undefined}
      onToggleUtilities={() => undefined}
      platform="darwin"
      utilityOpen={utilityOpen}
    />,
  );
}

describe("DesktopWindowTools", () => {
  it("renders a responsive icon-and-label utility control", () => {
    const markup = renderTools(false);

    expect(markup).toContain('aria-label="Open Activity"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("activity");
    expect(markup).toContain("<span>Activity</span>");
  });

  it("announces the close action while the utility drawer is expanded", () => {
    const markup = renderTools(true);

    expect(markup).toContain('aria-label="Close Activity"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('title="Close Activity"');
  });

  it("keeps Settings available in every non-chat header with an icon tooltip", () => {
    const markup = renderTools(false);
    expect(markup).toContain('aria-label="Open settings"');
    expect(markup).toContain('title="Settings"');
    expect(markup).toContain("size-10");
  });

  it("uses the supplied route action for Settings", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onOpenSettings = vi.fn();
    act(() =>
      root.render(
        <DesktopWindowTools
          backend={backend}
          onOpenPalette={vi.fn()}
          onOpenSettings={onOpenSettings}
          onRefresh={vi.fn()}
          onToggleUtilities={vi.fn()}
          platform="darwin"
          utilityOpen={false}
        />,
      ),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open settings"]')
        ?.click(),
    );
    expect(onOpenSettings).toHaveBeenCalledOnce();
    act(() => root.unmount());
    container.remove();
  });
});
