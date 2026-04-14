import { describe, expect, it } from "bun:test";
import { buildHelpText } from "./help-text";

describe("buildHelpText", () => {
  it("organizes the operator surface into quick-start sections", () => {
    const help = buildHelpText("Doolittle");

    expect(help).toContain("Doolittle operator shell");
    expect(help).toContain("Quick start:");
    expect(help).toContain("One-shot views (from outside the shell):");
    expect(help).toContain("Daily loop:");
    expect(help).toContain("Sessions:");
    expect(help).toContain("Background jobs:");
    expect(help).toContain("Cockpit hotkeys:");
    expect(help).toContain("doolittle progress");
    expect(help).toContain("/gateway readiness");
    expect(help).toContain("/accounts doctor");
  });
});
