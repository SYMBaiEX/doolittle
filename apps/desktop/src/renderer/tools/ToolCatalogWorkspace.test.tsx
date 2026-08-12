// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnknownRecord } from "../lib";
import { ToolCatalogWorkspace } from "./ToolCatalogWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function tool(index: number): UnknownRecord {
  return {
    id: `TOOL_${index}`,
    name: `Tool ${index}`,
    description: `Purpose ${index}`,
    category: index % 2 ? "messaging" : "workspace",
    transport: index === 2 ? "mcp" : "native",
    source: "eliza-action",
    enabled: index !== 1,
    policyReason: index === 1 ? "Not part of this profile." : "",
    similes: index === 2 ? ["ALIAS_2"] : [],
    allowedProfiles: ["coding", "full"],
  };
}

describe("ToolCatalogWorkspace", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps the large catalog compact and exposes one focused detail", () => {
    act(() =>
      root.render(
        <ToolCatalogWorkspace
          entries={Array.from({ length: 20 }, (_, index) => tool(index))}
          resetKey="full:all"
        />,
      ),
    );

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(12);
    expect(container.textContent).toContain("12 of 20");
    expect(container.textContent).toContain("Purpose 0");
    expect(container.textContent).not.toContain("Purpose 10");
    expect(
      container
        .querySelector('[role="tabpanel"]')
        ?.getAttribute("aria-labelledby"),
    ).toContain("-tool-0");
  });

  it("selects tools with click and roving arrow-key focus", () => {
    act(() =>
      root.render(
        <ToolCatalogWorkspace
          entries={[tool(0), tool(1), tool(2)]}
          resetKey="full:all"
        />,
      ),
    );
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    act(() => tabs[1]?.click());
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("Not part of this profile.");

    act(() =>
      tabs[1]?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      ),
    );
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
    expect(container.textContent).toContain("Purpose 2");
    expect(container.textContent).toContain("ALIAS_2");
    expect(container.textContent).toContain("MCP");
  });

  it("resets selection when the filtered inventory changes", () => {
    act(() =>
      root.render(
        <ToolCatalogWorkspace
          entries={[tool(0), tool(1)]}
          resetKey="full:all"
        />,
      ),
    );
    const second =
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
    act(() => second?.click());
    expect(container.textContent).toContain("Purpose 1");

    act(() =>
      root.render(
        <ToolCatalogWorkspace entries={[tool(2)]} resetKey="full:workspace" />,
      ),
    );
    expect(container.textContent).toContain("Purpose 2");
    expect(
      container.querySelector('[role="tab"]')?.getAttribute("aria-selected"),
    ).toBe("true");
  });
});
