import { describe, expect, it, mock } from "bun:test";
import { bootstrapColor, createBootstrapOutput, paint } from "./output";

describe("bootstrap output helpers", () => {
  it("formats painted text with the shared reset suffix", () => {
    expect(paint("hello", bootstrapColor.cyan)).toBe(
      `${bootstrapColor.cyan}hello${bootstrapColor.reset}`,
    );
  });

  it("routes section, info, and warn through the wizard screen when present", () => {
    const sections: Array<{ title: string; detail?: string }> = [];
    const lines: string[] = [];
    const output = createBootstrapOutput(() => ({
      setSection(title, detail) {
        sections.push({ title, detail });
      },
      appendLine(message) {
        lines.push(message);
      },
    }));

    output.section("Mind", "Choose a provider");
    output.info("Using linked auth.");
    output.warn("Fallback engaged.");
    output.banner();

    expect(sections).toEqual([{ title: "Mind", detail: "Choose a provider" }]);
    expect(lines).toEqual(["Using linked auth.", "WARNING: Fallback engaged."]);
  });

  it("prints the banner in plain console mode", () => {
    let printed = "";
    const spy = mock((value?: unknown) => {
      printed = String(value ?? "");
    });
    const original = console.log;
    console.log = spy as typeof console.log;
    try {
      createBootstrapOutput(() => null).banner();
    } finally {
      console.log = original;
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(printed).toContain("DOOLITTLE // AWAKENING");
  });
});
