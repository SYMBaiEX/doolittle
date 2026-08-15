import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SetupReadinessPanel } from "./SetupReadinessPanel";

describe("SetupReadinessPanel", () => {
  it("renders one labelled readiness region with supporting diagnostics", () => {
    const markup = renderToStaticMarkup(
      <SetupReadinessPanel
        readiness={{
          detail: "The shell and providers look ready.",
          label: "Ready",
          level: "ready",
          title: "Ready for local work",
          tone: "good",
        }}
      />,
    );

    expect(markup).toContain('aria-labelledby="setup-readiness-title"');
    expect(markup).toContain('data-readiness-tone="good"');
    expect(markup).toContain("Ready for local work");
    expect(markup).toContain("The shell and providers look ready.");
    expect(markup).not.toContain("transports 0/11 ready");
  });
});
