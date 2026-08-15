// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DesktopRouteErrorBoundary,
  type DesktopRouteErrorBoundaryProps,
} from "./DesktopRouteErrorBoundary";

function erroredBoundary(
  overrides: Partial<DesktopRouteErrorBoundaryProps> = {},
) {
  const boundary = new DesktopRouteErrorBoundary({
    children: null,
    label: "Connections",
    onReturnToChat: vi.fn(),
    resetKey: "connections",
    ...overrides,
  });
  boundary.state = {
    componentStack: "at ConnectionsPage",
    copied: false,
    error: new Error("provider list failed"),
    resetKey: "connections",
  };
  return boundary;
}

describe("DesktopRouteErrorBoundary", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    consoleError.mockRestore();
    container.remove();
  });

  it("keeps route recovery local and exposes accessible escape actions", () => {
    const markup = renderToStaticMarkup(erroredBoundary().render());

    expect(markup).toContain('data-recovery-scope="route"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Connections view encountered a rendering error");
    expect(markup).toContain("Retry Connections");
    expect(markup).toContain("Return to Chat");
    expect(markup).toContain("provider list failed");
  });

  it("clears a failed route when navigation changes its reset key", () => {
    const boundary = erroredBoundary();
    const nextState = DesktopRouteErrorBoundary.getDerivedStateFromProps(
      {
        ...boundary.props,
        resetKey: "chat",
      },
      boundary.state,
    );

    expect(nextState).toMatchObject({
      componentStack: "",
      copied: false,
      error: null,
      resetKey: "chat",
    });
  });

  it("invokes the route reset hook before clearing a failed route", () => {
    const onRetry = vi.fn();
    const boundary = erroredBoundary({ onRetry });

    act(() => (boundary as unknown as { retry: () => void }).retry());

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("catches a route render failure without requiring the root boundary", () => {
    function BrokenRoute(): ReactNode {
      throw new Error("route exploded");
    }

    act(() => {
      root.render(
        createElement(
          DesktopRouteErrorBoundary,
          {
            label: "Connections",
            onReturnToChat: vi.fn(),
            resetKey: "connections",
          } as unknown as DesktopRouteErrorBoundaryProps,
          createElement(BrokenRoute),
        ),
      );
    });

    expect(
      container.querySelector('[data-recovery-scope="route"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Retry Connections");
    expect(consoleError).toHaveBeenCalled();
  });
});
