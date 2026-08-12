import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityPage } from "./ActivityPage";
import { AutomationsPage } from "./AutomationsPage";
import { AnalyticsPage } from "./analytics/AnalyticsPage";
import { DocsPage } from "./DocsPage";
import { KeysPage } from "./KeysPage";
import { MediaPage } from "./MediaPage";
import { PluginsPage } from "./PluginsPage";
import { SessionsPage } from "./WorkspacePages";

describe("inactive desktop routes", () => {
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
          refresh={() => undefined}
          sessions={[]}
        />
      ),
      "Saved sessions will be available again",
      "No sessions yet",
    ],
  ] as const)(
    "keeps %s truthful without an empty inventory",
    (_name, view, offlineText, misleadingText) => {
      const markup = renderToStaticMarkup((view as () => ReactElement)());

      expect(markup).toContain(offlineText);
      expect(markup).not.toContain(misleadingText);
    },
  );
});
