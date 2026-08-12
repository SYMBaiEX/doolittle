import { describe, expect, it } from "vitest";
import {
  logEntryBorderColor,
  logEntryClassName,
  logEntryLevelVariant,
  toLogViewerEntries,
} from "./log-viewer-mapping";

describe("toLogViewerEntries", () => {
  it("renders scope, message, and detail as one scannable line", () => {
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
        message: "gateway.delivery · Retrying delivery · connection reset",
      },
    ]);
  });

  it("provides stable fallbacks for partial runtime events", () => {
    expect(toLogViewerEntries([{}])[0]).toMatchObject({
      level: "info",
      message: "runtime · Event",
    });
  });

  it("keeps routine entries quiet and reserves strong treatment for failures", () => {
    expect(logEntryClassName({ level: "info", message: "ready" })).toBe(
      "log-console-entry is-info",
    );
    expect(logEntryLevelVariant("info")).toBe("secondary");
    expect(logEntryBorderColor("info")).toBe("var(--line-subtle)");

    expect(logEntryClassName({ level: "warning", message: "retry" })).toBe(
      "log-console-entry is-warn",
    );
    expect(logEntryLevelVariant("warning")).toBe("outline");
    expect(logEntryBorderColor("warning")).toBe("var(--warning)");

    expect(logEntryClassName({ level: "fatal", message: "stopped" })).toBe(
      "log-console-entry is-error",
    );
    expect(logEntryLevelVariant("fatal")).toBe("destructive");
    expect(logEntryBorderColor("fatal")).toBe("var(--danger)");
  });
});
