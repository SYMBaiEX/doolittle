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
