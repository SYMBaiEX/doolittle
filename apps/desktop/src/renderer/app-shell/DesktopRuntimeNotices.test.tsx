import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BackendState } from "../../shared/contracts";
import { DesktopRuntimeNotices } from "./DesktopRuntimeNotices";

const degradedBackend: BackendState = {
  detail: "The runtime process exited.",
  message: "Runtime stopped unexpectedly.",
  phase: "degraded",
};

const readyBackend: BackendState = {
  message: "Runtime is ready.",
  phase: "ready",
};

describe("DesktopRuntimeNotices", () => {
  it("uses one stable live-region contract for each runtime notice", () => {
    const markup = renderToStaticMarkup(
      <DesktopRuntimeNotices
        backend={degradedBackend}
        globalError="Unable to load the workspace."
        onRefresh={() => undefined}
        onRestart={() => undefined}
      />,
    );

    expect(markup).toContain(
      '<div aria-atomic="true" aria-label="Local runtime unavailable" aria-live="polite" class="runtime-banner" role="status">',
    );
    expect(markup).toContain(
      '<div aria-atomic="true" aria-label="Application error" class="global-error" role="alert">',
    );
    expect(markup).not.toContain('class="global-error" aria-live=');
  });

  it("keeps notices hidden when healthy and preserves action labels", () => {
    const onRefresh = vi.fn();
    const onRestart = vi.fn();
    const markup = renderToStaticMarkup(
      <DesktopRuntimeNotices
        backend={readyBackend}
        globalError=""
        onRefresh={onRefresh}
        onRestart={onRestart}
      />,
    );

    expect(markup).toBe("");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onRestart).not.toHaveBeenCalled();
  });
});
