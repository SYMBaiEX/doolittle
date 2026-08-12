import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalCss = [
  "styles.css",
  "experience.css",
  "app-polish.css",
  "review.css",
  "coding-workspace.css",
]
  .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
  .join("\n");
const codingWorkspaceCss = readFileSync(
  new URL("./coding-workspace.css", import.meta.url),
  "utf8",
);
const reviewCss = readFileSync(
  new URL("./review.css", import.meta.url),
  "utf8",
);
const interactiveTerminalCss = readFileSync(
  new URL("./components/interactive-terminal.css", import.meta.url),
  "utf8",
);
const elizaTailwindCss = readFileSync(
  new URL("./eliza-tailwind.css", import.meta.url),
  "utf8",
);

// These selectors belonged to removed navigation, chat-sidebar, inspector,
// utility, activity, coding-terminal, worktree-list, and review-repository
// implementations. A complete repository search found no current JSX/static
// contract that can produce them.
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
  "card-grid",
  "fact-list",
  "card-footer",
  "settings-nav-title",
  "settings-nav-note",
  "review-repository-ribbon",
] as const;

const unreachableWorkspaceSelectors = [
  "coding-terminal",
  "coding-terminal-history",
  "coding-terminal-overview",
  "coding-terminal-empty",
  "coding-terminal-panels",
  "coding-terminal-panel",
  "coding-terminal-history-copy",
  "coding-terminal-history-meta",
  "coding-terminal-command",
  "coding-terminal-output",
  "coding-terminal-output-meta",
  "coding-terminal-output-summary",
  "coding-terminal-context-button",
  "coding-terminal-run-status",
  "coding-command-presets",
  "coding-command-composer",
  "coding-command-notice",
  "coding-stop-command",
  "coding-worktree-list",
  "coding-worktrees",
  "coding-worktree-composer",
  "coding-worktree-notice",
  "coding-worktree-dot",
  "coding-worktree-name",
  "coding-worktree-head",
  "coding-readonly-status",
  "review-repository-ribbon",
  "review-repository-identity",
  "review-repository-pr",
  "review-repository-sync",
  "review-repository-mark",
  "review-check-summary",
  "review-comment-thread",
] as const;

const hasExactClassSelector = (selector: string) =>
  new RegExp(`\\.${selector}(?![-\\w])`, "u");

describe("global CSS selector reachability", () => {
  it("does not retain selectors with no current renderer contract", () => {
    for (const selector of unreachableLegacySelectors) {
      expect(globalCss).not.toMatch(
        new RegExp(`\\.${selector}(?![-\\w])`, "u"),
      );
    }
  });

  it("removes confirmed dead coding and review workspace selectors exactly", () => {
    const workspaceCss = `${codingWorkspaceCss}\n${reviewCss}`;
    for (const selector of unreachableWorkspaceSelectors) {
      expect(workspaceCss).not.toMatch(hasExactClassSelector(selector));
    }
    expect(codingWorkspaceCss).not.toContain("coding-terminal-pulse");
  });

  it("keeps live coding, review, and interactive terminal contracts", () => {
    for (const selector of [
      "coding-action-notice",
      "coding-commit-list",
      "coding-worktree-field",
      "coding-worktree-input",
    ]) {
      expect(codingWorkspaceCss).toMatch(hasExactClassSelector(selector));
    }

    for (const selector of [
      "review-branch-record",
      "review-branch-events",
      "review-ci-hero",
      "review-ci-checks",
    ]) {
      expect(reviewCss).toMatch(hasExactClassSelector(selector));
    }

    for (const selector of [
      "interactive-terminal",
      "interactive-terminal-output",
      "interactive-terminal-footer",
    ]) {
      expect(interactiveTerminalCss).toMatch(hasExactClassSelector(selector));
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
