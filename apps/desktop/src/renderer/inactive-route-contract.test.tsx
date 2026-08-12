import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityPage } from "./ActivityPage";
import { AutomationsPage } from "./AutomationsPage";
import { AnalyticsPage } from "./analytics/AnalyticsPage";
import { BrowserPage } from "./BrowserPage";
import { CompatibilityPage } from "./CompatibilityPage";
import { DashboardPage } from "./DashboardPage";
import { DocsPage } from "./DocsPage";
import { GatewayPage } from "./GatewayPage";
import { KeysPage } from "./KeysPage";
import { LogsPage } from "./LogsPage";
import { MediaPage } from "./MediaPage";
import { PluginsPage } from "./PluginsPage";
import { RegistryPage } from "./RegistryPage";
import { RuntimePage } from "./RuntimePage";
import { RuntimeGateway } from "./runtime/RuntimeGateway";
import { RuntimeInventory } from "./runtime/RuntimeInventory";
import { RuntimeOverview } from "./runtime/RuntimeOverview";
import { SessionsPage } from "./sessions/SessionsPage";

describe("inactive desktop routes", () => {
  const emptyResource = {
    data: null,
    error: "",
    loading: false,
    reload: () => undefined,
  };

  it.each([
    [
      "activity",
      () => <ActivityPage active={false} />,
      "Activity history is unavailable",
      "No activity yet",
    ],
    [
      "automations",
      () => <AutomationsPage active={false} />,
      "Automations stay local",
      "No automations yet",
    ],
    [
      "plugins",
      () => <PluginsPage active={false} />,
      "Plugin assembly is unavailable",
      "No plugins match",
    ],
    [
      "docs",
      () => <DocsPage active={false} />,
      "Runtime diagnostics are unavailable",
      "Checks are ready when you need them.",
    ],
    [
      "keys",
      () => <KeysPage active={false} />,
      "Local credentials cannot be inspected",
      "Save key",
    ],
    [
      "analytics",
      () => <AnalyticsPage active={false} />,
      "Analytics are unavailable",
      "Sessions",
    ],
    [
      "media",
      () => <MediaPage active={false} />,
      "Media operations are unavailable",
      "Inspect / Analyze",
    ],
    [
      "sessions",
      () => (
        <SessionsPage
          active={false}
          openChat={() => undefined}
          onNewConversation={() => undefined}
          refresh={() => undefined}
          sessions={[]}
        />
      ),
      "Saved sessions",
      "No sessions yet",
    ],
    [
      "dashboard",
      () => (
        <DashboardPage
          active={false}
          approvalsResource={emptyResource}
          onOpenChat={() => undefined}
          refreshRuntime={() => Promise.resolve(false)}
          runtime={null}
          sessions={[]}
          tasksResource={emptyResource}
        />
      ),
      "Dashboard data is unavailable",
      "Runtime is stable.",
    ],
    [
      "runtime",
      () => <RuntimePage active={false} />,
      "Runtime diagnostics and capability inventory are unavailable",
      "Running",
    ],
    [
      "logs",
      () => <LogsPage active={false} />,
      "Runtime logs and secondary traces are unavailable",
      "No matching log events",
    ],
    [
      "browser",
      () => <BrowserPage active={false} />,
      "Browser preview and evidence capture are unavailable",
      "No evidence yet",
    ],
    [
      "compatibility",
      () => <CompatibilityPage active={false} />,
      "Compatibility checks are unavailable",
      "No compatibility checks found",
    ],
    [
      "registry",
      () => <RegistryPage active={false} />,
      "Plugin registry search and installs are unavailable",
      "No registry entries",
    ],
    [
      "gateway",
      () => <GatewayPage active={false} />,
      "Gateway history, routes, and sender approvals are unavailable",
      "Running",
    ],
  ] as const)(
    "keeps %s truthful without an empty inventory",
    (_name, view, offlineText, misleadingText) => {
      const markup = renderToStaticMarkup((view as () => ReactElement)());

      expect(markup).toContain(offlineText);
      expect(markup).not.toContain(misleadingText);
    },
  );

  it("does not present cached sessions as current while offline", () => {
    const markup = renderToStaticMarkup(
      <SessionsPage
        active={false}
        openChat={() => undefined}
        onNewConversation={() => undefined}
        refresh={() => undefined}
        sessions={[
          {
            messageCount: 4,
            participants: [],
            preview: ["Cached private transcript"],
            sessionId: "cached-session",
            title: "Cached conversation",
          },
        ]}
      />,
    );

    expect(markup).toContain("Saved sessions");
    expect(markup).not.toContain("Cached conversation");
    expect(markup).not.toContain("Cached private transcript");
  });

  it("keeps inactive runtime child projections compact and truthful", () => {
    const markup = renderToStaticMarkup(
      <>
        <RuntimeOverview
          active={false}
          accountPool={emptyResource}
          autonomy={emptyResource}
          runtime={emptyResource}
        />
        <RuntimeGateway
          active={false}
          gatewayHealth={emptyResource}
          gatewayRuntime={emptyResource}
        />
        <RuntimeInventory
          active={false}
          ecosystem={emptyResource}
          insights={emptyResource}
          plugins={emptyResource}
        />
      </>,
    );

    expect(markup).toContain("Runtime overview is unavailable");
    expect(markup).toContain("Gateway diagnostics are unavailable");
    expect(markup).toContain("Runtime capability inventory is unavailable");
    expect(markup).not.toContain("Running");
    expect(markup).not.toContain("No plugin entries");
  });
});
