// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RegistryCatalogWorkspace } from "../../apps/desktop/src/renderer/registry/RegistryCatalogWorkspace";
import {
  type RegistryEntry,
  registryInstallKey,
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
