import { describe, expect, it } from "vitest";
import {
  clampContextPercent,
  compactTokenCount,
  contextPressureLabel,
  contextPressureTone,
} from "./context-pressure";

describe("context pressure presentation", () => {
  it("uses neutral, warning, and critical thresholds", () => {
    expect(contextPressureTone(0.69)).toBe("neutral");
    expect(contextPressureTone(0.7)).toBe("warn");
    expect(contextPressureTone(0.849)).toBe("warn");
    expect(contextPressureTone(0.85)).toBe("bad");
  });

  it("clamps invalid and overflowing percentages", () => {
    expect(clampContextPercent(Number.NaN)).toBe(0);
    expect(clampContextPercent(-20)).toBe(0);
    expect(clampContextPercent(144)).toBe(100);
  });

  it("formats a compact, explicitly estimated usage label", () => {
    expect(compactTokenCount(18_400)).toBe("18.4k");
    expect(compactTokenCount(128_000)).toBe("128k");
    expect(
      contextPressureLabel({
        estimatedTokens: 18_400,
        contextWindowTokens: 128_000,
        usageFraction: 0.14375,
        percent: 14.375,
        overThreshold: false,
        estimated: true,
        sampledMessages: 12,
        totalMessages: 12,
        truncated: false,
      }),
    ).toBe("14% · 18.4k / 128k");
  });
});
