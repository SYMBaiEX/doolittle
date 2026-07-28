import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("self", globalThis);
const { appendTerminalBytes } = await import("./InteractiveTerminal");

describe("interactive terminal VT output", () => {
  it("preserves raw ANSI and carriage-return bytes for xterm", () => {
    const output = appendTerminalBytes(
      "build ",
      "\u001B[32mok\u001B[0m\rcomplete\n",
    );

    expect(output).toBe("build \u001B[32mok\u001B[0m\rcomplete\n");
  });

  it("labels output that the runtime truncated before the cursor", () => {
    expect(appendTerminalBytes("before", "after", true)).toBe(
      "before\n[Doolittle retained the newest terminal output.]after",
    );
  });
});
