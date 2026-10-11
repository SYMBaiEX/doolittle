import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_CHOICE_SELECTED_CLASS,
  AUTOMATION_RUN_BUTTON_CLASS,
} from "./automations/layout";
import {
  BROWSER_ADDRESS_INPUT_CLASS,
  BROWSER_NAV_BUTTON_CLASS,
} from "./browser/browser-layout";
import {
  CODING_CHANGE_BUTTON_SELECTED_CLASS,
  CODING_DIFF_SOURCE_SELECTED_CLASS,
  CODING_LAYOUT_BUTTON_CLASS,
  CODING_LAYOUT_BUTTON_SELECTED_CLASS,
  CODING_TAB_BUTTON_CLASS,
  CODING_TAB_SELECTED_CLASS,
} from "./coding-workspace/layout";
import { catalogIndexItemClass } from "./components/catalog-browser-layout";
import { MCP_TOOL_BUTTON_SELECTED_CLASS } from "./components/mcp-control/layout";
import { SKILL_FILTER_SELECTED_CLASS } from "./components/skill-workshop-layout";
import { COMPOSER_SEARCH_CLASS } from "./composer-selectors/layout";
import {
  PROVIDER_CONNECTION_DEFAULT_CLASS,
  PROVIDER_CONSOLE_CLASS,
  PROVIDER_IMPORT_FORM_CLASS,
  PROVIDER_POOL_STACK_CLASS,
} from "./connections/layout";
import { MEMORY_GRID_CLASS } from "./memory/memory-layout";
import {
  MODELS_PAGE_CLASS,
  MODELS_WORKSPACE_CLASS,
} from "./models/models-layout";
import { orchestrationClass } from "./orchestration/layout";
import {
  PROJECT_MANAGER_ROW_ACTIVE_CLASS,
  PROJECT_MANAGER_ROW_SELECTED_CLASS,
  PROJECT_MANAGER_SCOPE_ACTIVE_CLASS,
} from "./project-manager/layout";
import {
  REVIEW_LIST_BUTTON_SELECTED_CLASS,
  REVIEW_TAB_CLASS,
  REVIEW_TAB_SELECTED_CLASS,
} from "./review/layout";
import { SESSION_ROW_SELECTED_CLASS } from "./sessions/sessions-layout";
import {
  WORKBENCH_LIST_BUTTON_SELECTED_CLASS,
  WORKBENCH_TAB_CLASS,
  WORKBENCH_TAB_SELECTED_CLASS,
} from "./thread-workbench/layout";

describe("secondary surface selection contract", () => {
  it("gives composer search one wrapper focus marker, including high contrast", async () => {
    for (const utility of [
      "[&_input:focus-visible]:!outline-none",
      "[&_input:focus-visible]:!ring-0",
      "[&_input:focus-visible]:!shadow-none",
      "focus-within:outline-2",
      "focus-within:outline-[var(--focus-ring)]",
      "forced-colors:focus-within:outline-[Highlight]",
    ]) {
      expect(COMPOSER_SEARCH_CLASS).toContain(utility);
    }
    const compiler = await compile("@tailwind utilities;");
    const css = compiler.build(COMPOSER_SEARCH_CLASS.split(" "));
    expect(css).toContain(" input:focus-visible {");
    expect(css).toContain("outline-style: none !important");
    expect(css).toContain("outline-width: 2px");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("outline-color: Highlight");
  });

  it.each([
    ["session", SESSION_ROW_SELECTED_CLASS],
    ["orchestration", orchestrationClass("selected")],
    ["review queue", REVIEW_LIST_BUTTON_SELECTED_CLASS],
    ["review tab", REVIEW_TAB_SELECTED_CLASS],
    ["automation choice", AUTOMATION_CHOICE_SELECTED_CLASS],
    ["coding tab", CODING_TAB_SELECTED_CLASS],
    ["coding layout", CODING_LAYOUT_BUTTON_SELECTED_CLASS],
    ["coding change", CODING_CHANGE_BUTTON_SELECTED_CLASS],
    ["coding diff source", CODING_DIFF_SOURCE_SELECTED_CLASS],
    ["workbench tab", WORKBENCH_TAB_SELECTED_CLASS],
    ["workbench list", WORKBENCH_LIST_BUTTON_SELECTED_CLASS],
    ["project scope", PROJECT_MANAGER_SCOPE_ACTIVE_CLASS],
    ["project selection", PROJECT_MANAGER_ROW_SELECTED_CLASS],
    ["active project", PROJECT_MANAGER_ROW_ACTIVE_CLASS],
    ["skill filter", SKILL_FILTER_SELECTED_CLASS],
    ["MCP tool", MCP_TOOL_BUTTON_SELECTED_CLASS],
    ["default provider", PROVIDER_CONNECTION_DEFAULT_CLASS],
  ])(
    "keeps %s selection typographic without a card or tab highlight",
    (_, value) => {
      expect(value).toContain("font-semibold");
      expect(value).not.toMatch(
        /(?:bg-|shadow-|border-|before:|after:|outline-|underline)/u,
      );
      expect(value).not.toContain("var(--accent)");
    },
  );

  it("separates a catalog's current item from keyboard focus and hover", () => {
    const active = catalogIndexItemClass(true);
    const inactive = catalogIndexItemClass(false);
    expect(active).toContain("font-semibold");
    expect(inactive).not.toContain("font-semibold");
    for (const value of [active, inactive]) {
      expect(value).toContain("focus-visible:outline-[var(--focus-ring)]");
      expect(value).toContain("hover:bg-[var(--surface-hover)]");
      expect(value).not.toMatch(/(?:shadow-\[inset|bg-\[color-mix|border-l-)/u);
    }
  });

  it.each([
    ["coding tabs", CODING_TAB_BUTTON_CLASS],
    ["coding arrangement", CODING_LAYOUT_BUTTON_CLASS],
    ["review tabs", REVIEW_TAB_CLASS],
    ["workbench tabs", WORKBENCH_TAB_CLASS],
    ["browser navigation", BROWSER_NAV_BUTTON_CLASS],
    ["browser address", BROWSER_ADDRESS_INPUT_CLASS],
    ["automation receipts", AUTOMATION_RUN_BUTTON_CLASS],
  ])("retains a distinct visible keyboard focus on %s", (_, value) => {
    expect(value).toContain("focus-visible:outline-[var(--focus-ring)]");
  });

  it("sizes embedded forms against their available pane, not just the window", () => {
    expect(MODELS_PAGE_CLASS).toContain("@container/models");
    expect(MODELS_WORKSPACE_CLASS).toContain("@max-[760px]/models:grid-cols-1");
    expect(PROVIDER_CONSOLE_CLASS).toContain("@container/providers");
    expect(PROVIDER_POOL_STACK_CLASS).toContain(
      "@min-[900px]/providers:grid-cols-2",
    );
    expect(PROVIDER_IMPORT_FORM_CLASS).toContain(
      "@max-[480px]/providers:grid-cols-1",
    );
    expect(MEMORY_GRID_CLASS).toContain("@max-[680px]/memory:grid-cols-1");
  });
});
