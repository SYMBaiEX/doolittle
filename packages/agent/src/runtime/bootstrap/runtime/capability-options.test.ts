import { describe, expect, it } from "vitest";
import { DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS } from "./capability-options";

describe("Doolittle runtime capability ownership", () => {
  it("keeps required Eliza native features explicit without the deprecated alias", () => {
    expect(DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS).toEqual({
      enableAutonomy: false,
      enableDocuments: true,
      enableExtendedCapabilities: true,
      enableRelationships: true,
      enableSecretsManager: true,
      enableTrajectories: true,
    });
    expect(DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS).not.toHaveProperty(
      "advancedCapabilities",
    );
  });
});
