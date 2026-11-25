// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ToolsPage } from "../../apps/desktop/src/renderer/ToolsPage";

vi.mock("../../apps/desktop/src/renderer/tools/ToolCatalogWorkspace", () => ({
  ToolCatalogWorkspace: () =>
    createElement("div", { "data-testid": "tool-results-stub" }),
}));

vi.mock("../../apps/desktop/src/renderer/lib", async (original) => ({
  ...(await original<object>()),
  useApiResource: (path: string | null) => ({
    data:
      path === "/tools"
        ? {
            summary: { total: 2, enabled: 2, categories: ["files"] },
            tools: [
              {
                category: "files",
                description: "Reads files.",
                id: "read-file",
                name: "Read file",
              },
              {
                category: "files",
                description: "Writes files.",
                id: "write-file",
                name: "Write file",
              },
            ],
          }
        : null,
    error: "",
    loading: false,
    reload: async () => {},
  }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("places search and results before the integration bridges diagnostics", async () => {
  act(() => root.render(<ToolsPage active={true} />));
  await act(async () => {});

  const search = container.querySelector<HTMLInputElement>(
    'input[aria-label="Search tools"]',
  );
  const results = container.querySelector('[data-testid="tool-results-stub"]');
  const bridges = Array.from(container.querySelectorAll("summary")).find(
    (element) => element.textContent?.includes("Integration bridges"),
  );
  if (!search || !results || !bridges) {
    throw new Error("expected search, results, and bridges elements");
  }
  // DOM order matches visual order so keyboard focus follows the layout.
  expect(
    search.compareDocumentPosition(bridges) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    results.compareDocumentPosition(bridges) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
