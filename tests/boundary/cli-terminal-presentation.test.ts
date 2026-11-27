import { describe, expect, it } from "vitest";
import { toneTag } from "../../apps/cli/src/cli/activity-chrome";
import {
  contrastSelectionStyle,
  ellipsizeText,
  formatClockTime,
  SEVERITY_BADGES,
  SEVERITY_BLESSED_COLORS,
  severityBlessedTag,
} from "../../apps/cli/src/cli/terminal-presentation";
import { truncate } from "../../apps/cli/src/cli/text-utils";

describe("terminal presentation primitives", () => {
  it("collapses whitespace and ellipsizes single-line truncation", () => {
    expect(ellipsizeText("plain", 10)).toBe("plain");
    expect(ellipsizeText("  spaced   out\ntext  ", 80)).toBe("spaced out text");
    expect(ellipsizeText("x".repeat(40), 10)).toBe("xxxxxxx...");
  });

  it("never splits astral codepoints when truncating", () => {
    const emoji = "😀".repeat(20);
    const truncated = ellipsizeText(emoji, 5);
    // Two codepoints plus the ASCII ellipsis, no lone surrogates.
    expect(truncated).toBe("😀😀...");
    expect([...truncated]).toHaveLength(5);
  });

  it("keeps the legacy truncate behavior byte-identical on BMP text", () => {
    expect(truncate("hello", 10)).toBe(ellipsizeText("hello", 10));
    expect(truncate("x".repeat(600))).toBe(ellipsizeText("x".repeat(600)));
  });

  it("formats clock stamps as two-digit hour/minute/second", () => {
    const stamp = formatClockTime(new Date(2026, 0, 2, 3, 4, 5));
    expect(stamp).toMatch(/^\d{2}:\d{2}:\d{2}/u);
    expect(stamp).toContain("04:05");
  });

  it("keeps severity tokens fixed and independent of decorative theme accents", () => {
    expect(SEVERITY_BADGES).toEqual({
      info: "::",
      success: "[ok]",
      warning: "[!]",
      error: "[x]",
    });
    expect(SEVERITY_BLESSED_COLORS).toEqual({
      info: "blue",
      success: "green",
      warning: "yellow",
      error: "red",
    });
    expect(severityBlessedTag("warning")).toBe("{yellow-fg}[!]{/}");
    expect(severityBlessedTag(undefined)).toBe("{blue-fg}::{/}");
  });

  it("keeps activity tone tags anchored on the canonical severity tokens", () => {
    expect(toneTag("success")).toBe("{green-fg}[ok]{/}");
    expect(toneTag("warning")).toBe("{yellow-fg}[!]{/}");
    expect(toneTag("error")).toBe("{red-fg}[x]{/}");
    expect(toneTag("agent")).toBe("{cyan-fg}<>{/}");
    expect(toneTag(undefined)).toBe("{blue-fg}::{/}");
  });

  it("derives contrast selection pairs for arbitrary hex surfaces", () => {
    expect(contrastSelectionStyle("#0B35F1")).toEqual({
      bg: "#0B35F1",
      fg: "white",
    });
    expect(contrastSelectionStyle("#F2F2F2")).toEqual({
      bg: "#F2F2F2",
      fg: "black",
    });
  });
});
