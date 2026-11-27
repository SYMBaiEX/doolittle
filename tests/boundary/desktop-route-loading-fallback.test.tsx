// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { DesktopRouteLoadingFallback } from "../../apps/desktop/src/renderer/app-shell/DesktopRouteLoadingFallback";

it("uses the shared loading surface for lazy route transitions", () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  try {
    act(() => {
      root.render(<DesktopRouteLoadingFallback label="History" />);
    });

    const surface = host.querySelector(".dl-state-surface");
    expect(surface?.getAttribute("data-kind")).toBe("loading");
    expect(host.querySelector(".loading-block i")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Opening history…",
    );
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
