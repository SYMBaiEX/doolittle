import { describe, expect, it } from "vitest";
import { analyticsSessionLabel } from "./AnalyticsPage";

describe("analyticsSessionLabel", () => {
  it("prefers a human title over internal identifiers", () => {
    expect(
      analyticsSessionLabel({
        sessionId: "desktop:4edddc4b-e9a6-4db9-af3b-43fc6908465f",
        title: "Review the local runtime",
        preview: ["ignored preview"],
      }),
    ).toBe("Review the local runtime");
  });

  it("uses persisted preview text when a session has no title", () => {
    expect(
      analyticsSessionLabel({
        sessionId: "desktop:4edddc4b-e9a6-4db9-af3b-43fc6908465f",
        preview: ["[user] Tell me about this repo"],
      }),
    ).toBe("Tell me about this repo");
  });

  it("bounds fallback labels and never exposes a raw session id", () => {
    expect(
      analyticsSessionLabel({
        sessionId: "desktop:4edddc4b-e9a6-4db9-af3b-43fc6908465f",
        usage: { lastPreview: "x".repeat(100) },
      }),
    ).toBe(`${"x".repeat(71)}…`);
    expect(
      analyticsSessionLabel({
        sessionId: "desktop:4edddc4b-e9a6-4db9-af3b-43fc6908465f",
      }),
    ).toBe("Untitled session");
  });
});
