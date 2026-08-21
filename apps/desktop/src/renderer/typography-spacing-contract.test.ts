import { describe, expect, it } from "vitest";
import {
  COMMAND_PALETTE_ITEM_CLASS,
  ROUTE_DIALOG_CLASS,
  ROUTE_DIALOG_HEADER_CLASS,
} from "./app-shell/overlay-layout";
import { VIEW_PRIMITIVES_CLASS } from "./app-shell/view-layout";
import {
  AUTOMATION_BUILDER_GRID_CLASS,
  AUTOMATION_BUILDER_HEADER_CLASS,
  AUTOMATION_BUILDER_SECTION_CLASS,
} from "./automations/layout";
import { BROWSER_PLACEHOLDER_CLASS } from "./browser/browser-layout";
import { CHAT_WORKSPACE_CLASS } from "./chat/layout";
import { CATALOG_DETAIL_HEADER_CLASS } from "./components/catalog-browser-layout";
import {
  MODEL_FORM_ACTIONS_CLASS,
  MODELS_PAGE_CLASS,
} from "./models/models-layout";
import { orchestrationClass } from "./orchestration/layout";
import {
  PROJECT_EDITOR_CLASS,
  PROJECT_MANAGER_CLASS,
  PROJECT_MANAGER_DETAIL_CLASS,
  PROJECT_MANAGER_HEADER_CLASS,
} from "./project-manager/layout";
import { REVIEW_DETAIL_HEADER_CLASS } from "./review/layout";
import {
  SETTINGS_PAGE_CLASS,
  SETTINGS_ROW_LAYOUT_CLASS,
} from "./settings/settings-layout";

describe("desktop typography and spacing rhythm", () => {
  it("keeps shared headers, body copy, and metadata on named rhythm tokens", () => {
    expect(VIEW_PRIMITIVES_CLASS).toContain("leading-[var(--line-title)]");
    expect(VIEW_PRIMITIVES_CLASS).toContain("leading-[var(--line-body)]");
    expect(VIEW_PRIMITIVES_CLASS).toContain("leading-[var(--line-meta)]");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-message-body]:leading-[var(--line-body)]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-welcome>p]:leading-[var(--line-body)]",
    );
  });

  it("keeps modal and route workspace padding compact", () => {
    expect(PROJECT_MANAGER_HEADER_CLASS).toContain("px-4 pt-4 pb-3");
    expect(PROJECT_MANAGER_DETAIL_CLASS).toContain("p-4");
    expect(PROJECT_MANAGER_DETAIL_CLASS).not.toContain("px-7");
    expect(PROJECT_EDITOR_CLASS).toContain("gap-3");
    expect(PROJECT_EDITOR_CLASS).toContain("p-4");
    expect(ROUTE_DIALOG_CLASS).toContain("p-[clamp(14px,2vw,24px)]");
    expect(PROJECT_MANAGER_CLASS).toContain("100svh");
    expect(PROJECT_MANAGER_CLASS).not.toContain("100vh");
  });

  it("keeps repeated controls and empty states dense without microtype", () => {
    expect(COMMAND_PALETTE_ITEM_CLASS).toContain("min-h-9.5");
    expect(SETTINGS_ROW_LAYOUT_CLASS).toContain("min-h-9");
    expect(SETTINGS_PAGE_CLASS).toContain(
      "[&_.settings-section-header]:min-h-8.5",
    );
    expect(BROWSER_PLACEHOLDER_CLASS).toContain("p-6");
    expect(AUTOMATION_BUILDER_HEADER_CLASS).toContain("px-4 pt-3 pb-2");
  });

  it("keeps decorative separators out of ordinary document surfaces", () => {
    expect(CHAT_WORKSPACE_CLASS).not.toContain("[&_.starter-grid]:border-t");
    expect(CHAT_WORKSPACE_CLASS).not.toContain(
      "[&_.starter-grid_button]:border-b",
    );
    expect(SETTINGS_PAGE_CLASS).not.toContain(
      "[&_.settings-group-heading]:border-b",
    );
    expect(SETTINGS_ROW_LAYOUT_CLASS).not.toContain("border-b");
    expect(MODELS_PAGE_CLASS).not.toContain("min-h-[74px]");
    expect(MODEL_FORM_ACTIONS_CLASS).not.toContain("border-t");
    expect(AUTOMATION_BUILDER_HEADER_CLASS).not.toContain("border-b");
    expect(AUTOMATION_BUILDER_GRID_CLASS).not.toContain("border-t");
    expect(AUTOMATION_BUILDER_SECTION_CLASS).not.toContain("border-r");
    expect(ROUTE_DIALOG_HEADER_CLASS).not.toContain("border-b");
    expect(CATALOG_DETAIL_HEADER_CLASS).not.toContain("border-b");
    expect(REVIEW_DETAIL_HEADER_CLASS).not.toContain("border-b");
    expect(orchestrationClass("orchestration-detail-header")).not.toContain(
      "border-b",
    );
    expect(orchestrationClass("orchestration-detail-row")).not.toContain(
      "border-b",
    );
    expect(orchestrationClass("orchestration-evidence")).not.toContain(
      "border-t",
    );
    expect(orchestrationClass("orchestration-note-composer")).not.toContain(
      "border-t",
    );
  });
});
