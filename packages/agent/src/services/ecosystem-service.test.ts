import { describe, expect, it } from "vitest";
import { EcosystemService } from "./ecosystem-service";

describe("EcosystemService", () => {
  it("reads optional skill packs from the native filesystem layout", () => {
    const service = new EcosystemService();

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
