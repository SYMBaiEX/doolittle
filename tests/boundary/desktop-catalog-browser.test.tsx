// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RegistryCatalogWorkspace } from "../../apps/desktop/src/renderer/registry/RegistryCatalogWorkspace";
import {
  type RegistryEntry,
  registryInstallKey,
  registryRepositoryLink,
} from "../../apps/desktop/src/renderer/registry/registry-model";
import { ToolCatalogWorkspace } from "../../apps/desktop/src/renderer/tools/ToolCatalogWorkspace";

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

it("retains a selected item across filtering when it still matches and updates the panel on keyboard navigation", async () => {
  const items = [
    { id: "src", name: "Source files", description: "Source files detail" },
    { id: "file", name: "File status", description: "File status detail" },
    { id: "git", name: "Git status", description: "Git status detail" },
  ];
  const render = (results: typeof items, query: string) =>
    act(() =>
      root.render(<ToolCatalogWorkspace entries={results} resetKey={query} />),
    );
  const panel = () => container.querySelector('[role="tabpanel"]');
  const selected = () =>
    container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );

  render(items, "");
  const git = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  ).at(-1);
  act(() => git?.click());
  render(items.slice(1), "status");
  expect(selected()?.textContent).toContain("Git status");
  expect(panel()?.getAttribute("aria-labelledby")).toBe(selected()?.id);
  expect(panel()?.textContent).toContain("Git status detail");

  await act(async () => {
    selected()?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  expect(document.activeElement).toBe(selected());
  expect(panel()?.textContent).toContain("File status detail");
});

it("opens compact details, restores the selected row on Back, and returns to results when filtering", async () => {
  const items = [
    { id: "file", name: "File status", description: "File status detail" },
    { id: "git", name: "Git status", description: "Git status detail" },
  ];
  const render = (query: string) =>
    act(() =>
      root.render(<ToolCatalogWorkspace entries={items} resetKey={query} />),
    );
  const frame = () => container.querySelector(".catalog-browser");
  const panel = () => container.querySelector<HTMLElement>('[role="tabpanel"]');
  const settleFocus = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  render("");
  const back = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Back to tools",
  );
  // A rendered Back control identifies the compact presentation; jsdom has no layout.
  vi.spyOn(back as HTMLButtonElement, "getClientRects").mockReturnValue({
    length: 1,
  } as DOMRectList);
  expect(frame()?.getAttribute("data-detail-open")).toBe("false");

  const git = container
    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
    .item(1);
  await act(async () => {
    git.click();
    await settleFocus();
  });
  expect(frame()?.getAttribute("data-detail-open")).toBe("true");
  expect(panel()?.textContent).toContain("Git status detail");
  expect(document.activeElement).toBe(panel());

  await act(async () => {
    back?.click();
    await settleFocus();
  });
  expect(frame()?.getAttribute("data-detail-open")).toBe("false");
  expect(document.activeElement).toBe(git);

  const viewSelected = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "View selected",
  );
  expect(viewSelected?.getAttribute("aria-label")).toBe(
    "View selected: Git status details",
  );
  act(() => viewSelected?.click());
  expect(frame()?.getAttribute("data-detail-open")).toBe("true");
  render("status");
  expect(frame()?.getAttribute("data-detail-open")).toBe("false");
  expect(git.getAttribute("aria-selected")).toBe("true");
  render("");
  expect(frame()?.getAttribute("data-detail-open")).toBe("false");
});

function RegistryReviewFixture({
  entries,
  onApproveInstall,
}: {
  entries: RegistryEntry[];
  onApproveInstall: (entry: RegistryEntry) => void;
}) {
  const [review, setReview] = useState("");
  return (
    <RegistryCatalogWorkspace
      entries={entries}
      installing={false}
      onApproveInstall={onApproveInstall}
      onCancelInstall={() => setReview("")}
      onReviewInstall={(selected) => setReview(registryInstallKey(selected))}
      pendingInstall={review}
      resetKey=""
    />
  );
}

it("requires fresh approval when a selected registry package changes version", () => {
  const approve = vi.fn();
  const entry: RegistryEntry = {
    description: "Installs a fixture integration.",
    installed: false,
    installable: true,
    integrityVerified: true,
    name: "Fixture",
    packageName: "@fixture/example",
    reasons: [],
    repository: "",
    support: "community",
    trust: "verified",
    version: "1.0.0",
  };

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === label,
    );
  act(() =>
    root.render(
      <RegistryReviewFixture entries={[entry]} onApproveInstall={approve} />,
    ),
  );
  act(() => button("Review install")?.click());
  expect(button("Approve 1.0.0")).toBeDefined();

  const updated = { ...entry, version: "1.1.0" };
  act(() =>
    root.render(
      <RegistryReviewFixture entries={[updated]} onApproveInstall={approve} />,
    ),
  );
  expect(button("Approve 1.0.0")).toBeUndefined();
  expect(button("Approve 1.1.0")).toBeUndefined();
  expect(approve).not.toHaveBeenCalled();

  act(() => button("Review install")?.click());
  act(() => button("Approve 1.1.0")?.click());
  expect(approve).toHaveBeenCalledExactlyOnceWith(updated);
});

it("renders the registry repository as a short owner/repo link", async () => {
  const entry: RegistryEntry = {
    description: "Installs a fixture integration.",
    installed: false,
    installable: true,
    integrityVerified: true,
    name: "Fixture",
    packageName: "@fixture/example",
    reasons: [],
    repository: "https://github.com/elizaos/eliza",
    support: "community",
    trust: "verified",
    version: "1.0.0",
  };
  act(() =>
    root.render(
      <RegistryReviewFixture entries={[entry]} onApproveInstall={() => {}} />,
    ),
  );
  const link = container.querySelector<HTMLAnchorElement>(
    '.catalog-facts a[href="https://github.com/elizaos/eliza"]',
  );
  expect(link?.textContent).toBe("elizaos/eliza");
  expect(link?.getAttribute("target")).toBe("_blank");
  expect(link?.getAttribute("rel")).toBe("noreferrer");
});

it("labels repository links conservatively and rejects non-http URLs", () => {
  expect(
    registryRepositoryLink("https://github.com/elizaos/eliza.git"),
  ).toEqual({
    href: "https://github.com/elizaos/eliza.git",
    label: "elizaos/eliza",
  });
  expect(registryRepositoryLink("https://example.com")?.label).toBe(
    "example.com",
  );
  expect(registryRepositoryLink("javascript:alert(1)")).toBeNull();
  expect(registryRepositoryLink("not a url")).toBeNull();
});
