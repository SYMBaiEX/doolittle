import { describe, expect, it } from "bun:test";
import {
  appendWizardLogLine,
  cloneWizardSnapshot,
  createWizardSnapshot,
  setWizardSection,
  WIZARD_MIN_COLS,
  WIZARD_MIN_ROWS,
} from "./state";

describe("wizard-screen state helpers", () => {
  it("creates stable defaults and clones snapshots", () => {
    const snapshot = createWizardSnapshot();
    expect(snapshot.title).toBe("DOOLITTLE // AWAKENING");
    expect(snapshot.subtitle).toContain("first-contact ritual");
    expect(snapshot.currentSection).toBe("Preflight");
    expect(snapshot.currentDetail).toContain("checked the machine");
    expect(WIZARD_MIN_COLS).toBeGreaterThan(0);
    expect(WIZARD_MIN_ROWS).toBeGreaterThan(0);

    const clone = cloneWizardSnapshot(snapshot);
    clone.currentSection = "Awakening";
    expect(snapshot.currentSection).toBe("Preflight");
  });

  it("records sections and trims log lines", () => {
    const snapshot = createWizardSnapshot();
    setWizardSection(snapshot, "Mind", "Thinking clearly");
    expect(snapshot.currentSection).toBe("Mind");
    expect(snapshot.currentDetail).toBe("Thinking clearly");
    expect(snapshot.logLines.at(-1)).toBe("◆ Mind — Thinking clearly");

    for (let index = 0; index < 250; index += 1) {
      appendWizardLogLine(snapshot, `line-${index}`);
    }

    expect(snapshot.logLines).toHaveLength(200);
    expect(snapshot.logLines[0]).toBe("line-50");
  });
});
