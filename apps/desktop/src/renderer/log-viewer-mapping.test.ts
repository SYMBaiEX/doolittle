import { describe, expect, it } from "vitest";
import { toLogViewerEntries } from "./log-viewer-mapping";

describe("toLogViewerEntries", () => {
  it("preserves scope and detail as structured metadata", () => {
    expect(
      toLogViewerEntries([
        {
          at: "2026-08-08T12:00:00.000Z",
          level: "warn",
          scope: "gateway.delivery",
          message: "Retrying delivery",
          detail: "connection reset",
        },
      ]),
    ).toEqual([
      {
        id: "2026-08-08T12:00:00.000Z:gateway.delivery:Retrying delivery:0",
        timestamp: "2026-08-08T12:00:00.000Z",
        level: "warn",
        message: "Retrying delivery",
        metadata: {
          scope: "gateway.delivery",
          detail: "connection reset",
        },
      },
    ]);
  });

  it("provides stable fallbacks for partial runtime events", () => {
    expect(toLogViewerEntries([{}])[0]).toMatchObject({
      level: "info",
      message: "Event",
      metadata: { scope: "runtime" },
    });
  });
});
