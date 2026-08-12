// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegistryCatalogWorkspace } from "./RegistryCatalogWorkspace";
import { REGISTRY_INSTALL_CAVEAT, type RegistryEntry } from "./registry-model";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function entry(
  index: number,
  overrides: Partial<RegistryEntry> = {},
): RegistryEntry {
  return {
    name: `@example/plugin-${index}`,
    packageName: `@example/plugin-${index}`,
    description: `Package purpose ${index}`,
    version: `1.0.${index}`,
    repository: `https://example.com/plugin-${index}`,
    support: "community",
    trust: "community",
    installed: false,
    installable: false,
    reasons: ["Explicit allowlist required."],
    integrityVerified: false,
    ...overrides,
  };
}

describe("RegistryCatalogWorkspace", () => {
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

  it("keeps registry descriptions in one focused detail pane", () => {
    act(() =>
      root.render(
        <RegistryCatalogWorkspace
          entries={Array.from({ length: 20 }, (_, index) => entry(index))}
          installing={false}
          onApproveInstall={vi.fn()}
          onCancelInstall={vi.fn()}
          onReviewInstall={vi.fn()}
          pendingInstall=""
          resetKey="all:0"
        />,
      ),
    );

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(12);
    expect(container.textContent).toContain("12 of 20");
    expect(container.textContent).toContain("Package purpose 0");
    expect(container.textContent).not.toContain("Package purpose 10");
    expect(container.querySelectorAll(".badge")).toHaveLength(1);
    expect(
      container
        .querySelector('[role="tabpanel"]')
        ?.getAttribute("aria-labelledby"),
    ).toContain("-registry-0");
  });

  it("keeps review and approval explicit in the selected package", () => {
    const eligible = entry(1, {
      installable: true,
      reasons: [],
      support: "first-party",
      trust: "first-party",
    });
    const onApproveInstall = vi.fn();
    const onCancelInstall = vi.fn();
    const onReviewInstall = vi.fn();
    const render = (pendingInstall: string) => (
      <RegistryCatalogWorkspace
        entries={[entry(0), eligible]}
        installing={false}
        onApproveInstall={onApproveInstall}
        onCancelInstall={onCancelInstall}
        onReviewInstall={onReviewInstall}
        pendingInstall={pendingInstall}
        resetKey="all:0"
      />
    );

    act(() => root.render(render("")));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    act(() => tabs[1]?.click());
    const review = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Review install",
    );
    act(() => review?.click());
    expect(onReviewInstall).toHaveBeenCalledWith(eligible);

    act(() => root.render(render(eligible.name)));
    expect(container.textContent).toContain(REGISTRY_INSTALL_CAVEAT);
    const approve = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === `Approve ${eligible.version}`,
    );
    act(() => approve?.click());
    expect(onApproveInstall).toHaveBeenCalledWith(eligible);
    const cancel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel",
    );
    act(() => cancel?.click());
    expect(onCancelInstall).toHaveBeenCalledOnce();
  });

  it("moves selection and focus with vertical list keys", () => {
    act(() =>
      root.render(
        <RegistryCatalogWorkspace
          entries={[entry(0), entry(1), entry(2)]}
          installing={false}
          onApproveInstall={vi.fn()}
          onCancelInstall={vi.fn()}
          onReviewInstall={vi.fn()}
          pendingInstall=""
          resetKey="all:0"
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
    expect(container.textContent).toContain("Package purpose 2");
  });
});
