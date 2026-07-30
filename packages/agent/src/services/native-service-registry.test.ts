import { describe, expect, it } from "vitest";
import { SERVICE_RESOLUTION_DEFINITIONS } from "@/runtime/native/service-manifest";
import {
  createNativeServiceRegistry,
  describeNativeServiceRegistry,
} from "./native-service-registry";

describe("native service registry", () => {
  it("classifies Eliza-backed projections by their canonical ownership", () => {
    const registry = createNativeServiceRegistry();

    expect(registry.officialBacked).toContain("delegationProjection");
    expect(registry.officialBacked).toContain("cron");
    expect(registry.customEliza).toContain("skillSynthesis");
    expect(registry.customEliza).toContain("trajectoryEvaluation");
    expect(registry.officialBacked).not.toContain("skillSynthesis");
    expect(registry.officialBacked).not.toContain("trajectoryEvaluation");
    expect(registry.officialBacked).not.toContain("trajectories");
    expect(registry.productOrchestration).not.toContain("delegation");
    expect(registry.officialBacked).not.toContain("delegation");
    expect(registry.customEliza).not.toContain("cron");
    expect(registry.productOrchestration).toContain("tools");
    expect(registry.customEliza).not.toContain("tools");
    expect(describeNativeServiceRegistry(registry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: "officialBacked",
          services: expect.arrayContaining(["delegationProjection", "cron"]),
        }),
      ]),
    );
  });

  it("returns isolated registry arrays for each service assembly", () => {
    const first = createNativeServiceRegistry();
    const second = createNativeServiceRegistry();

    first.officialBacked.push("test-only");

    expect(second.officialBacked).not.toContain("test-only");
  });

  it("keeps native capability resolution free of product fallback ownership", () => {
    for (const definition of SERVICE_RESOLUTION_DEFINITIONS) {
      expect(definition).not.toHaveProperty("productServices");
      expect(definition.requirement).toMatch(/^(required|optional)/);
    }
  });

  it("assigns action and operator planning to distinct runtime services", () => {
    const actionPlanning = SERVICE_RESOLUTION_DEFINITIONS.find(
      (definition) => definition.capability === "actionPlanning",
    );
    const operatorPlanning = SERVICE_RESOLUTION_DEFINITIONS.find(
      (definition) => definition.capability === "operatorPlanning",
    );

    expect(actionPlanning?.nativeService).toBe("planning");
    expect(operatorPlanning?.nativeService).toBe("doolittle_operator_planning");
    expect(operatorPlanning?.nativeService).not.toBe(
      actionPlanning?.nativeService,
    );
  });
});
