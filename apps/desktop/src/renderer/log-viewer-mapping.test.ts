import { describe, expect, it } from "vitest";
import {
  logEntryBorderColor,
  logEntryClassName,
  logEntryTone,
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
      "[&_[data-slot=badge]]:border-[var(--line-subtle)] [&_[data-slot=badge]]:bg-[color-mix(in_srgb,var(--surface-raised)_82%,transparent)] [&_[data-slot=badge]]:text-[var(--muted)]",
    );
    expect(logEntryTone("info")).toBe("neutral");
    expect(logEntryBorderColor("info")).toBe("var(--line-subtle)");

    expect(logEntryClassName({ level: "warning", message: "retry" })).toBe(
      "[&_[data-slot=badge]]:border-[color-mix(in_srgb,var(--warning)_48%,var(--border))] [&_[data-slot=badge]]:text-[var(--warning)]",
    );
    expect(logEntryTone("warning")).toBe("warn");
    expect(logEntryBorderColor("warning")).toBe("var(--warning)");

    expect(logEntryClassName({ level: "fatal", message: "stopped" })).toBe("");
    expect(logEntryTone("fatal")).toBe("bad");
    expect(logEntryBorderColor("fatal")).toBe("var(--danger)");
  });
});
