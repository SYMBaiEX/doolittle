// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToastViewport } from "../../apps/desktop/src/renderer/components/ToastViewport";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderViewport(
  props: Partial<Parameters<typeof ToastViewport>[0]> = {},
) {
  await act(async () => {
    root.render(
      <ToastViewport
        onDismiss={() => {}}
        onPause={() => {}}
        onResume={() => {}}
        toasts={[
          {
            id: "toast-info",
            tone: "info",
            title: "Ready",
            message: "The workspace is ready.",
          },
          {
            id: "toast-error",
            tone: "error",
            title: "Failed",
            message: "The action failed.",
          },
        ]}
        {...props}
      />,
    );
  });
}

it("keeps live announcements on individual toasts rather than the viewport", async () => {
  await renderViewport();

  const viewport = container.querySelector("section");
  expect(viewport).toBeTruthy();
  expect(viewport?.hasAttribute("aria-live")).toBe(false);
  expect(viewport?.hasAttribute("aria-relevant")).toBe(false);

  const status = container.querySelector('[role="status"]');
  const alert = container.querySelector('[role="alert"]');
  expect(status?.textContent).toContain("The workspace is ready.");
  expect(alert?.textContent).toContain("The action failed.");
  expect(status?.closest("li")?.hasAttribute("tabindex")).toBe(false);
  expect(alert?.closest("li")?.hasAttribute("tabindex")).toBe(false);
});

it("pauses and resumes a toast when focus enters and leaves its controls", async () => {
  const onPause = vi.fn();
  const onResume = vi.fn();
  await renderViewport({
    onPause,
    onResume,
    toasts: [
      {
        id: "toast-info",
        tone: "info",
        message: "The workspace is ready.",
      },
    ],
  });

  const dismiss = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Dismiss info toast"]',
  );
  expect(dismiss).toBeTruthy();

  await act(async () => dismiss?.focus());
  expect(onPause).toHaveBeenCalledWith("toast-info");

  await act(async () => dismiss?.blur());
  expect(onResume).toHaveBeenCalledWith("toast-info");
});

class MockResizeObserver {
  static callbacks: ResizeObserverCallback[] = [];
  constructor(callback: ResizeObserverCallback) {
    MockResizeObserver.callbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

async function renderOverflowingToast() {
  MockResizeObserver.callbacks = [];
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  const longMessage = "Backend failure detail. ".repeat(60);
  await renderViewport({
    toasts: [
      {
        id: "toast-long",
        tone: "error",
        title: "Failed",
        message: longMessage,
      },
    ],
  });
  const message = container.querySelector<HTMLDivElement>(".line-clamp-4");
  expect(message).toBeTruthy();
  Object.defineProperty(message, "scrollHeight", {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(message, "clientHeight", {
    configurable: true,
    value: 60,
  });
  await act(async () => {
    for (const callback of MockResizeObserver.callbacks) {
      callback([], {} as ResizeObserver);
    }
  });
  return { message: message as HTMLDivElement, longMessage };
}

it("clamps long messages and expands them on demand", async () => {
  const { longMessage } = await renderOverflowingToast();

  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-expanded="false"]',
  );
  expect(toggle?.textContent).toBe("Show more");
  expect(toggle?.getAttribute("aria-controls")).toBeTruthy();

  // The full text stays in the DOM for assistive technology while clamped.
  const clamped = container.querySelector(".line-clamp-4");
  expect(clamped?.textContent).toContain(longMessage.slice(0, 40));

  await act(async () => toggle?.click());
  expect(container.querySelector(".line-clamp-4")).toBeNull();

  const collapse = container.querySelector<HTMLButtonElement>(
    'button[aria-expanded="true"]',
  );
  expect(collapse?.textContent).toBe("Show less");

  await act(async () => collapse?.click());
  expect(container.querySelector(".line-clamp-4")).toBeTruthy();
});

it("hides the expansion toggle when a short message fits", async () => {
  MockResizeObserver.callbacks = [];
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  await renderViewport({
    toasts: [
      {
        id: "toast-short",
        tone: "info",
        message: "The workspace is ready.",
      },
    ],
  });

  expect(container.querySelector("button[aria-controls]")).toBeNull();
  // Short messages are still clamped in the collapsed state, bounding height.
  expect(container.querySelector(".line-clamp-4")).toBeTruthy();
});
