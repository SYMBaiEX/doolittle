// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CompactStatStrip } from "../../apps/desktop/src/renderer/components/CompactStatStrip";

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
});

it("renders a quiet loading indicator instead of the value while pending", () => {
  act(() => {
    root.render(
      <CompactStatStrip
        label="Workspace summary"
        stats={[
          { label: "Agent accounts", pending: true, value: 0 },
          { label: "Conversations", value: 4 },
        ]}
      />,
    );
  });

  const items = container.querySelectorAll(".compact-stat-strip__item");
  expect(items).toHaveLength(2);

  const pending = items[0];
  expect(pending?.textContent).toContain("Agent accounts");
  // The raw value must not read as real data while loading; the only
  // "Loading…" copy is visually hidden text inside the status indicator.
  const status = pending?.querySelector('[role="status"]');
  expect(status).not.toBeNull();
  expect(status?.textContent).toBe("Loading…");
  const pendingValue = pending?.querySelector("strong");
  expect(pendingValue?.textContent).toBe("Loading…");
  expect(pendingValue?.textContent).not.toContain("0");
  expect(
    pendingValue
      ?.querySelector('[role="status"]')
      ?.className.includes("animate-spin"),
  ).toBe(true);
  expect(
    pendingValue
      ?.querySelector('[role="status"]')
      ?.className.includes("motion-reduce:animate-none"),
  ).toBe(true);

  const settled = items[1];
  expect(settled?.querySelector('[role="status"]')).toBeNull();
  expect(settled?.querySelector("strong")?.textContent).toBe("4");
});

it("keeps unavailable values readable once loading settles", () => {
  act(() => {
    root.render(
      <CompactStatStrip
        label="Runtime summary"
        stats={[{ label: "Autonomy", value: "Unavailable" }]}
      />,
    );
  });

  const value = container.querySelector(".compact-stat-strip__item strong");
  expect(value?.textContent).toBe("Unavailable");
  expect(value?.getAttribute("title")).toBe("Unavailable");
});

it("suppresses the stale value tooltip while pending", () => {
  act(() => {
    root.render(
      <CompactStatStrip
        label="Workspace summary"
        stats={[{ label: "Workspace branch", pending: true, value: "main" }]}
      />,
    );
  });

  const value = container.querySelector(".compact-stat-strip__item strong");
  expect(value?.getAttribute("title")).toBeNull();
  expect(value?.textContent).not.toContain("main");
});

it("accepts layout overrides for dense presentations", () => {
  act(() => {
    root.render(
      <CompactStatStrip
        className="test-three-column-layout"
        label="Activity overview"
        stats={[
          { label: "Pending", value: 1 },
          { label: "Attention", value: 2 },
          { label: "Recorded", value: 3 },
        ]}
      />,
    );
  });

  expect(container.querySelector("section")?.className).toContain(
    "test-three-column-layout",
  );
});
