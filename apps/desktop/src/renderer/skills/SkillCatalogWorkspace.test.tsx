// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCatalogItem } from "../catalog-entry-models";
import { SkillCatalogWorkspace } from "./SkillCatalogWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function skill(
  index: number,
  overrides: Partial<SkillCatalogItem> = {},
): SkillCatalogItem {
  return {
    id: `skill-${index}`,
    title: `Workflow ${index}`,
    description: `Reusable workflow purpose ${index}.`,
    slug: `operations/skill-${index}`,
    family: "operations",
    source: "workspace",
    commandName: `skill-${index}`,
    userInvocable: true,
    modelInvocable: true,
    ...overrides,
  };
}

describe("SkillCatalogWorkspace", () => {
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

  it("keeps one skill purpose and invocation policy in the focused detail", () => {
    act(() =>
      root.render(
        <SkillCatalogWorkspace
          entries={Array.from({ length: 20 }, (_, index) => skill(index))}
          resetKey=""
        />,
      ),
    );

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(12);
    expect(container.textContent).toContain("12 of 20");
    expect(container.textContent).toContain("Reusable workflow purpose 0.");
    expect(container.textContent).not.toContain(
      "Reusable workflow purpose 10.",
    );
    expect(container.textContent).toContain("/skill-0");
    expect(container.textContent).toContain("User commandEnabled");
    expect(container.textContent).toContain("Model useEnabled");
  });

  it("calls out a selected skill whose invocation policy is limited", () => {
    act(() =>
      root.render(
        <SkillCatalogWorkspace
          entries={[
            skill(0),
            skill(1, { modelInvocable: false, userInvocable: false }),
          ]}
          resetKey=""
        />,
      ),
    );

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    act(() => tabs[1]?.click());
    expect(container.querySelector('[role="note"]')?.textContent).toContain(
      "one or more runtime invocation paths are disabled",
    );
    expect(
      container.querySelector('[role="tabpanel"] .badge')?.textContent,
    ).toBe("Limited");
  });

  it("moves selection and focus with vertical list keys", () => {
    act(() =>
      root.render(
        <SkillCatalogWorkspace
          entries={[skill(0), skill(1), skill(2)]}
          resetKey=""
        />,
      ),
    );

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    act(() =>
      tabs[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      ),
    );
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
    expect(container.textContent).toContain("Reusable workflow purpose 2.");
  });

  it("progressively reveals the remaining skills", () => {
    act(() =>
      root.render(
        <SkillCatalogWorkspace
          entries={Array.from({ length: 20 }, (_, index) => skill(index))}
          resetKey=""
        />,
      ),
    );

    const showMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Show 8 more",
    );
    act(() => showMore?.click());
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(20);
    expect(container.textContent).not.toContain("12 of 20");
  });
});
