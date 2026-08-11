import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = ["styles.css", "experience.css", "app-polish.css"]
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("\n");
const elizaTailwindCss = readFileSync(
  new URL("./eliza-tailwind.css", import.meta.url),
  "utf8",
);

// These selectors belonged to removed navigation, chat-sidebar, inspector,
// utility, and activity implementations. A complete repository search found
// no current JSX/static contract that can produce them.
const unreachableLegacySelectors = [
  "app-navigation",
  "nav-section",
  "runtime-indicator",
  "window-quick-nav",
  "window-nav-chip",
  "window-status-strip",
  "window-status-chip",
  "loading-skeleton",
  "automation-form",
  "operations-grid",
  "automation-row",
  "automation-title",
  "timeline-item",
  "log-row",
  "chat-sessions",
  "chat-sessions-heading",
  "chat-session-list",
  "chat-session-search",
  "chat-session-row",
  "chat-session-item",
  "chat-session-pin",
  "chat-project-badge",
  "chat-inspector",
  "inspector-section",
  "pill-list",
  "privacy-card",
  "sidebar-recents",
  "sidebar-recents-list",
  "sidebar-recent-card",
  "sidebar-recents-empty",
  "nav-section-toggle",
  "nav-section-items",
  "chat-mobile-session-picker",
  "message-content__paragraph",
  "message-content__list",
  "chat-context-inspector-track",
  "chat-context-inspector",
  "chat-inspector-model-link",
  "chat-operator-strip",
  "chat-operator-label",
  "chat-operator-dot",
  "chat-operator-actions",
  "chat-operator-all",
  "activity-context",
  "activity-raw-details",
  "sidebar-project-context",
  "utility-drawer-header",
  "utility-navigation",
  "utility-navigation-group",
  "utility-navigation-heading",
  "utility-navigation-items",
  "chat-meta-project",
  "chat-meta-context",
] as const;

describe("global CSS selector reachability", () => {
  it("does not retain selectors with no current renderer contract", () => {
    for (const selector of unreachableLegacySelectors) {
      expect(globalCss).not.toMatch(
        new RegExp(`\\.${selector}(?![-\\w])`, "u"),
      );
    }
  });

  it("keeps the current shell, chat chrome, utility, and workbench contracts", () => {
    for (const selector of [
      ".sidebar-focus-nav",
      ".chat-session-meta",
      ".utility-drawer__navigation",
      ".thread-workbench",
    ]) {
      expect(globalCss).toContain(selector);
    }
  });

  it("includes published Eliza component classes in the host Tailwind build", () => {
    expect(elizaTailwindCss).toContain(
      '@source "../../../../node_modules/@elizaos/ui/components/accounts"',
    );
    expect(elizaTailwindCss).toContain(
      '@source "../../../../node_modules/@elizaos/ui/components/composites/page-panel"',
    );
    expect(elizaTailwindCss).toContain(
      '@source "../../../../node_modules/@elizaos/ui/components/ui"',
    );
    expect(elizaTailwindCss).toContain(
      '@source "../../../../node_modules/@elizaos/ui/cloud-ui/components/log-viewer"',
    );
  });
});
