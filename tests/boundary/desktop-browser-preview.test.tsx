// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserPage } from "../../apps/desktop/src/renderer/BrowserPage";

const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  vi.unstubAllGlobals();
});

const badge = () => container.querySelector(".badge");
const previewFrame = () => container.querySelector("iframe");
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function openDefaultPreview() {
  await act(async () => {
    root.render(<BrowserPage active evidenceAvailable={false} />);
  });
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

it("reports the preview as live only after the frame finishes loading", async () => {
  let resolveProbe: (value: unknown) => void = () => undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve;
        }),
    ),
  );
  await openDefaultPreview();
  expect(badge()?.textContent).toBe("Checking localhost");
  expect(previewFrame()).not.toBeNull();

  await act(async () => {
    resolveProbe({});
    await settle();
  });
  expect(badge()?.textContent).toBe("Loading localhost");
  expect(badge()?.className).not.toContain("good");

  const frame = previewFrame();
  expect(frame).not.toBeNull();
  await act(async () => {
    frame?.dispatchEvent(new Event("load"));
  });
  expect(badge()?.textContent).toBe("Live localhost");
  expect(badge()?.className).toContain("good");
});

it("keeps the unreachable state when the localhost probe fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("connection refused")),
  );
  await openDefaultPreview();
  await act(async () => {
    await settle();
  });
  expect(badge()?.textContent).toBe("Unreachable");
  expect(
    container.querySelector('[data-browser-preview-state="unreachable"]'),
  ).not.toBeNull();
  expect(previewFrame()).toBeNull();
});
