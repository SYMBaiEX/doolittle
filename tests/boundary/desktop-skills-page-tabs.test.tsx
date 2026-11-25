// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SkillsPage } from "../../apps/desktop/src/renderer/SkillsPage";

vi.mock(
  "../../apps/desktop/src/renderer/components/SkillWorkshopPanel",
  () => ({
    SkillWorkshopPanel: ({ active }: { active: boolean }) =>
      createElement("div", {
        "data-active": String(active),
        "data-testid": "skill-workshop-stub",
      }),
  }),
);

vi.mock("../../apps/desktop/src/renderer/lib", async (original) => ({
  ...(await original<object>()),
  useApiResource: (path: string | null) => ({
    data:
      path === "/skills"
        ? {
            installed: [],
            skills: [
              {
                description: "First skill description.",
                slug: "alpha/first-skill",
                title: "First skill",
              },
              {
                description: "Second skill description.",
                slug: "beta/second-skill",
                title: "Second skill",
              },
              {
                description: "Third skill description.",
                slug: "gamma/third-skill",
                title: "Third skill",
              },
            ],
            summary: { total: 3 },
          }
        : null,
    error: "",
    loading: false,
    reload: async () => {},
  }),
}));

let container: HTMLDivElement;
let root: Root;

const catalogPanel = () =>
  container.querySelector<HTMLElement>("#skills-catalog-panel");
const viewTab = (id: "catalog" | "workshop") =>
  container.querySelector<HTMLButtonElement>(`#skills-${id}-tab`);
const catalogTabs = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '#skills-catalog-panel [role="tab"]',
    ),
  );
const browserDetailOpen = () =>
  catalogPanel()
    ?.querySelector(".catalog-browser")
    ?.getAttribute("data-detail-open");
const workshopStub = () =>
  container.querySelector('[data-testid="skill-workshop-stub"]');

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

it("keeps catalog selection and detail state across view switches", async () => {
  act(() => root.render(<SkillsPage active={true} />));

  const panel = catalogPanel();
  expect(panel).not.toBeNull();
  expect(panel?.hasAttribute("hidden")).toBe(false);
  // The lazy workshop stays unmounted until its tab is first visited.
  expect(workshopStub()).toBeNull();

  const tabs = catalogTabs();
  expect(tabs).toHaveLength(3);
  expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  expect(browserDetailOpen()).toBe("false");

  // Picking a row also opens the compact detail view.
  act(() => tabs[1]?.click());
  expect(catalogTabs()[1]?.getAttribute("aria-selected")).toBe("true");
  expect(browserDetailOpen()).toBe("true");

  act(() => viewTab("workshop")?.click());
  await act(async () => {});
  expect(panel?.hasAttribute("hidden")).toBe(true);
  expect(workshopStub()?.getAttribute("data-active")).toBe("true");

  act(() => viewTab("catalog")?.click());
  expect(panel?.hasAttribute("hidden")).toBe(false);
  expect(catalogTabs()[1]?.getAttribute("aria-selected")).toBe("true");
  expect(browserDetailOpen()).toBe("true");
  // Once visited, the workshop panel stays mounted behind `hidden`.
  expect(workshopStub()).not.toBeNull();
});
