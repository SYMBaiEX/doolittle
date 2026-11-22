// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocsPage } from "../../apps/desktop/src/renderer/DocsPage";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import { LogsPage } from "../../apps/desktop/src/renderer/LogsPage";
import { desktopQueryClient } from "../../apps/desktop/src/renderer/lib";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  desktopQueryClient.clear();
  vi.mocked(desktopRequest).mockReset();
  vi.unstubAllGlobals();
});

function render(node: ReactNode) {
  act(() => root.render(node));
}

function button(label: string) {
  const result = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}

function requests() {
  return vi.mocked(desktopRequest).mock.calls.map(([path]) => path);
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

it("loads delivery and shell traces only while their disclosure is open", async () => {
  vi.mocked(desktopRequest).mockImplementation(async (path) => {
    if (path === "/deliveries")
      return { deliveries: [{ channel: "Local notifications" }] } as never;
    if (path === "/terminal/history")
      return { commands: [{ command: "git status", ok: true }] } as never;
    return {
      logs: [{ id: "started", level: "info", message: "Runtime started" }],
    } as never;
  });

  render(<LogsPage active />);
  await settle();
  expect(container.querySelector('[role="log"]')?.textContent).toContain(
    "Runtime started",
  );
  expect(requests()).toEqual(["/logs?limit=500"]);

  const traces = container.querySelector("details");
  if (!traces) throw new Error("Missing delivery and terminal disclosure.");
  act(() => {
    traces.open = true;
    traces.dispatchEvent(new Event("toggle"));
  });
  await settle();
  expect(container.textContent).toContain("Local notifications");
  expect(container.textContent).toContain("git status");
  expect(requests()).toEqual([
    "/logs?limit=500",
    "/deliveries",
    "/terminal/history",
  ]);

  act(() => {
    traces.open = false;
    traces.dispatchEvent(new Event("toggle"));
  });
  await settle();
  expect(container.textContent).not.toContain("git status");
  act(() => button("Refresh").click());
  await settle();
  expect(requests().slice(3)).toEqual(["/logs?limit=500"]);
});

it("runs system checks on demand and distinguishes waiting from empty results", async () => {
  let complete!: (result: { checks: unknown[] }) => void;
  vi.mocked(desktopRequest).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve as typeof complete;
      }),
  );
  render(<DocsPage active />);
  expect(requests()).toEqual([]);

  act(() => button("Run diagnostics").click());
  expect(requests()).toEqual(["/doctor"]);
  expect(container.textContent).toContain("Running local operator diagnostics");
  expect(button("Run again").disabled).toBe(true);

  await act(async () => complete({ checks: [] }));
  await settle();
  expect(
    container.querySelector('[role="status"][data-doctor-state="empty"]')
      ?.textContent,
  ).toContain("No diagnostic results");
  expect(button("Run again").disabled).toBe(false);
});
