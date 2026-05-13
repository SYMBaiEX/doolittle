import { describe, expect, it } from "bun:test";
import {
  listOperatorWowAcceptanceScenarios,
  listOperatorWowContract,
  summarizeOperatorWowContract,
} from "./operator-wow-contract";

function expectUnique(values: string[]) {
  expect(new Set(values).size).toBe(values.length);
}

describe("operator wow contract", () => {
  it("keeps pillar ids, scenario ids, and task ids stable and unique", () => {
    const pillars = listOperatorWowContract();
    const scenarios = listOperatorWowAcceptanceScenarios();
    const tasks = pillars.flatMap((pillar) => pillar.nextImplementationTasks);

    expect(pillars).toHaveLength(8);
    expectUnique(pillars.map((pillar) => pillar.id));
    expectUnique(scenarios.map((scenario) => scenario.id));
    expectUnique(tasks.map((task) => task.id));
  });

  it("anchors every pillar to research signals, ElizaOS leverage, Doolittle surfaces, scenarios, gaps, and tasks", () => {
    for (const pillar of listOperatorWowContract()) {
      expect(pillar.title.length).toBeGreaterThan(0);
      expect(pillar.outcome.length).toBeGreaterThan(80);
      expect(pillar.referenceSignals.length).toBeGreaterThanOrEqual(2);
      expect(pillar.elizaosLeverage.length).toBeGreaterThanOrEqual(2);
      expect(pillar.doolittleSurfaces.length).toBeGreaterThanOrEqual(3);
      expect(pillar.acceptanceScenarios.length).toBeGreaterThanOrEqual(2);
      expect(pillar.currentGaps.length).toBeGreaterThanOrEqual(2);
      expect(pillar.nextImplementationTasks.length).toBeGreaterThanOrEqual(2);

      for (const scenario of pillar.acceptanceScenarios) {
        expect(scenario.id.startsWith(`${pillar.id}.`)).toBe(true);
        expect(scenario.trigger.length).toBeGreaterThan(40);
        expect(scenario.requiredSignals.length).toBeGreaterThanOrEqual(3);
        expect(scenario.verification.length).toBeGreaterThanOrEqual(2);
        expect(["covered", "partial", "missing"]).toContain(
          scenario.currentStatus,
        );
      }

      for (const task of pillar.nextImplementationTasks) {
        expect(task.ownerSurface.length).toBeGreaterThan(0);
        expect(task.files.length).toBeGreaterThanOrEqual(2);
        expect(task.definitionOfDone.length).toBeGreaterThanOrEqual(3);
        expect(
          task.files.some(
            (file) => file.startsWith("packages/") || file.startsWith("docs/"),
          ),
        ).toBe(true);
      }
    }
  });

  it("summarizes the contract for operator surfaces", () => {
    expect(summarizeOperatorWowContract()).toEqual({
      pillars: 8,
      scenarios: 16,
      tasks: 16,
      coveredScenarios: 0,
      partialScenarios: 11,
      missingScenarios: 5,
    });
  });
});
