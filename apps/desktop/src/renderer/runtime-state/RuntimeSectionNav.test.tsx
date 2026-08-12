// @vitest-environment jsdom

import { Tabs, TabsContent } from "@elizaos/ui/components/ui/tabs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuntimeSectionNav } from "./RuntimeSectionNav";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("RuntimeSectionNav", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => null,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps compact labels while exposing section detail accessibly", () => {
    act(() =>
      root.render(
        <Tabs defaultValue="overview">
          <RuntimeSectionNav
            ariaLabel="Runtime sections"
            sections={[
              {
                detail: "Model, accounts, autonomy",
                id: "overview",
                label: "Overview",
              },
              {
                detail: "Transports and deliveries",
                id: "gateway",
                label: "Gateway",
              },
            ]}
          />
          <TabsContent value="overview">Overview content</TabsContent>
          <TabsContent value="gateway">Gateway content</TabsContent>
        </Tabs>,
      ),
    );

    const navigation = container.querySelector(
      '[aria-label="Runtime sections"]',
    );
    const gateway = container.querySelector<HTMLButtonElement>(
      '[aria-label="Gateway: Transports and deliveries"]',
    );

    expect(navigation).not.toBeNull();
    expect(gateway?.title).toBe("Transports and deliveries");
    expect(container.textContent).not.toContain("Model, accounts, autonomy");

    act(() =>
      gateway?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      ),
    );

    expect(gateway?.dataset.state).toBe("active");
    expect(container.textContent).toContain("Gateway content");
  });
});
