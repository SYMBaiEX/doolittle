import { describe, expect, it } from "vitest";
import { renderCliCommandCatalog } from "../../apps/cli/src/cli/command-surface";
import { resolveStaticCliInput } from "../../apps/cli/src/cli/execution/static";
import { buildHelpText } from "../../apps/cli/src/cli/help-text";
import { renderPaletteItems } from "../../apps/cli/src/cli/tui-overlays/bindings";

function stripBlessedTags(value: string): string {
  return value.replace(/\{[^}]+\}/gu, "");
}

describe("CLI command discovery", () => {
  it("groups the browsable command catalog by stable operator domains", () => {
    const catalog = renderCliCommandCatalog(undefined, 80);
    const runtimeIndex = catalog.indexOf("\nRuntime\n");
    const gatewayIndex = catalog.indexOf("\nGateway\n");
    const executionIndex = catalog.indexOf("\nExecution\n");
    const toolsIndex = catalog.indexOf("\nTools\n");

    expect(catalog).toMatch(/^Command catalog\n/u);
    expect(runtimeIndex).toBeGreaterThan(0);
    expect(gatewayIndex).toBeGreaterThan(runtimeIndex);
    expect(executionIndex).toBeGreaterThan(gatewayIndex);
    expect(toolsIndex).toBeGreaterThan(executionIndex);
    expect(catalog).toContain("  /status");
    expect(catalog).toContain(
      "Show the top-level agent runtime status summary.",
    );
  });

  it("keeps ranked command searches grouped instead of returning a flat row set", () => {
    const catalog = renderCliCommandCatalog("job", 80);

    expect(catalog).toMatch(/^Commands matching "job"\n/u);
    expect(catalog).toContain("\nExecution\n");
    expect(catalog).toContain("  /jobs start");
  });

  it("uses the grouped catalog for the interactive /commands surface", () => {
    const result = resolveStaticCliInput("/commands", {
      agentName: "Doolittle",
      sessionOpen: true,
    });

    expect(result?.text).toMatch(/^Command catalog\n/u);
    expect(result?.text).toContain("\nRuntime\n");
  });

  it("keeps shell help organized around stable task sections", () => {
    const help = buildHelpText("Doolittle");
    const inspectIndex = help.indexOf("\nInspect runtime:\n");
    const sessionsIndex = help.indexOf("\nSessions:\n");
    const jobsIndex = help.indexOf("\nBackground jobs:\n");
    const cockpitIndex = help.indexOf("\nCockpit controls:\n");
    const examplesIndex = help.indexOf("\nExamples:\n");

    expect(help).toContain("  /commands");
    expect(help).toContain("Browse the grouped command catalog");
    expect(inspectIndex).toBeGreaterThan(0);
    expect(sessionsIndex).toBeGreaterThan(inspectIndex);
    expect(jobsIndex).toBeGreaterThan(sessionsIndex);
    expect(cockpitIndex).toBeGreaterThan(jobsIndex);
    expect(examplesIndex).toBeGreaterThan(cockpitIndex);
    expect(help.split("\n").length).toBeLessThan(70);
  });

  it("adds palette descriptions when the overlay is wide enough", () => {
    const rows = renderPaletteItems("/jobs", undefined, 0, 72);
    const first = stripBlessedTags(rows[0] ?? "");

    expect(first).toContain("/jobs");
    expect(first).toMatch(/Start a detached|List detached/iu);
    expect(first).toContain("[execution]");
    expect(rows[0]).not.toContain("{gray-fg}");
  });

  it("keeps palette rows compact in narrow overlays", () => {
    const rows = renderPaletteItems("/jobs", undefined, 0, 34);
    const first = stripBlessedTags(rows[0] ?? "");

    expect(first).toContain("[execution]");
    expect(rows[0]).not.toContain("{gray-fg}");
    expect(first).not.toMatch(/Start a detached|List background/iu);
    expect(first.length).toBeLessThanOrEqual(34);
  });
});
