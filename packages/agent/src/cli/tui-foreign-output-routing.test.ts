import { describe, expect, it } from "bun:test";
import {
  formatForeignTerminalArgs,
  shouldDeferForeignOutput,
  shouldSuppressForeignTerminalLine,
} from "@/cli/tui-foreign-output-routing";

describe("tui foreign output routing", () => {
  it("defers output when text entry or overlays are active", () => {
    expect(shouldDeferForeignOutput(true, false)).toBe(true);
    expect(shouldDeferForeignOutput(false, true)).toBe(true);
    expect(shouldDeferForeignOutput(false, false)).toBe(false);
  });

  it("suppresses known noisy foreign terminal lines", () => {
    expect(
      shouldSuppressForeignTerminalLine(
        "DynamicPromptExecFromState failed while booting",
      ),
    ).toBe(true);
    expect(shouldSuppressForeignTerminalLine("a normal operator message")).toBe(
      false,
    );
  });

  it("formats foreign terminal args into a sanitized line", () => {
    const formatted = formatForeignTerminalArgs([
      "hello",
      { nested: { count: 2 } },
    ]);

    expect(formatted).toContain("hello");
    expect(formatted).toContain("nested");
    expect(formatted).toContain("count");
  });
});
