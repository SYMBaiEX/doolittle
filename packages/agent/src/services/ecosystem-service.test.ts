import { describe, expect, it } from "bun:test";
import { EcosystemService } from "./ecosystem-service";

describe("EcosystemService", () => {
  it("reads benchmark packs, distribution channels, and modeling profiles", () => {
    const service = new EcosystemService();

    expect(service.benchmarkPacks().length).toBeGreaterThan(0);
    expect(service.distributionChannels().length).toBeGreaterThan(0);
    expect(service.modelingProfiles().length).toBeGreaterThan(0);
    expect(service.optionalSkillPacks().length).toBeGreaterThan(0);
    expect(service.summary().packageRoots.every((entry) => entry.exists)).toBe(
      true,
    );
    expect(
      service
        .summary()
        .packageRoots.some(
          (entry) => entry.label === "skill-packs-optional" && entry.exists,
        ),
    ).toBe(true);
  });
});
