import { describe, expect, it } from "vitest";
import {
  SERVICE_REGISTRY_DEFINITIONS,
  SERVICE_RESOLUTION_DEFINITIONS,
} from "@/runtime/native/service-manifest";
import {
  createNativeServiceRegistry,
  describeNativeServiceRegistry,
} from "./native-service-registry";

describe("native service registry", () => {
  it("classifies delegation as an official Eliza-backed projection", () => {
    const registry = createNativeServiceRegistry();

    expect(registry.officialBacked).toContain("delegation");
    expect(registry.productOrchestration).not.toContain("delegation");
    expect(describeNativeServiceRegistry(registry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: "officialBacked",
          services: expect.arrayContaining(["delegation"]),
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

  it("maps every native capability fallback to a declared product service", () => {
    const declared = new Set(
      SERVICE_REGISTRY_DEFINITIONS.map((definition) => definition.service),
    );

    for (const definition of SERVICE_RESOLUTION_DEFINITIONS) {
      for (const service of definition.productServices) {
        expect(
          declared.has(service),
          `${definition.capability} references undeclared service ${service}`,
        ).toBe(true);
      }
    }
  });
});
