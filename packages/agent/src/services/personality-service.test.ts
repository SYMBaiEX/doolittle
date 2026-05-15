import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonalityService } from "./personality-service";

describe("PersonalityService", () => {
  it("exposes an SDK-style activate alias and defensive profile copies", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-personality-"));
    const service = new PersonalityService(root);

    try {
      const activated = service.activate("teacher");
      expect(activated.id).toBe("teacher");
      expect(service.activeId()).toBe("teacher");

      const listed = service.list();
      listed[0].name = "mutated";
      expect(service.get("operator")?.name).toBe("Operator");

      const active = service.getActive();
      active.name = "mutated-again";
      expect(service.getActive().name).toBe("Teacher");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
