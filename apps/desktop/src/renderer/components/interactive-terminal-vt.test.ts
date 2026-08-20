import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("self", globalThis);
const { appendTerminalBytes, interactiveTerminalTheme } = await import(
  "./InteractiveTerminal"
);

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

  it("builds its ANSI palette from live desktop theme tokens", () => {
    const values = new Map([
      ["--canvas-bg", "#030712"],
      ["--canvas-text", "#f8fafc"],
      ["--canvas-text-soft", "#cbd5e1"],
      ["--accent", "#0b35f1"],
      ["--accent-ink", "#ffffff"],
      ["--good", "#21c55d"],
      ["--warn", "#eab308"],
      ["--bad", "#ef4444"],
      ["--theme-muted", "#64748b"],
      ["--terminal-cyan", "#22d3ee"],
      ["--terminal-magenta", "#d946ef"],
    ]);
    const theme = interactiveTerminalTheme({
      getPropertyValue: (name) => values.get(name) ?? "",
    });

    expect(theme).toMatchObject({
      background: "#030712",
      foreground: "#f8fafc",
      cursor: "#0b35f1",
      selectionBackground: "#0b35f166",
      green: "#21c55d",
      yellow: "#eab308",
      red: "#ef4444",
      blue: "#0b35f1",
      cyan: "#22d3ee",
      magenta: "#d946ef",
    });
  });
});
