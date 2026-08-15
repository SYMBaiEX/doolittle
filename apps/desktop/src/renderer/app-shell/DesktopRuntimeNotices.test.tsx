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

    expect(markup).toContain('aria-label="Local runtime unavailable"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Application error"');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toMatch(/aria-label="Application error"[^>]*aria-live/u);
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
